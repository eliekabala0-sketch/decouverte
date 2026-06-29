import {
  activatePaymentEntitlements,
  createServiceClient,
  createUserClient,
  cors,
  envRequired,
  getNestedString,
  json,
  normalizePaymentStatus,
  recordPaymentEvent,
} from '../_shared/payment.ts'

async function readInput(req: Request): Promise<Record<string, unknown>> {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    return {
      transaction_id: url.searchParams.get('transaction_id'),
      payment_id: url.searchParams.get('payment_id'),
    }
  }
  return await req.json().catch(() => ({})) as Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Authentification requise.' }, 401)

    const userClient = createUserClient(authHeader)
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData.user) return json({ error: 'Session invalide.' }, 401)

    const input = await readInput(req)
    const transactionId = String(input.transaction_id ?? '').trim()
    const paymentId = String(input.payment_id ?? '').trim()
    if (!transactionId && !paymentId) return json({ error: 'Transaction manquante.' }, 400)

    const supabase = createServiceClient()
    let payment: Record<string, unknown> | null = null
    let readErr: { message: string } | null = null
    if (paymentId) {
      const res = await supabase.from('payments').select('*').eq('user_id', authData.user.id).eq('id', paymentId).maybeSingle()
      payment = res.data as Record<string, unknown> | null
      readErr = res.error
    } else {
      const byRef = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', authData.user.id)
        .eq('transaction_ref', transactionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      payment = byRef.data as Record<string, unknown> | null
      readErr = byRef.error
      if (!payment && !readErr) {
        const byMetadata = await supabase
          .from('payments')
          .select('*')
          .eq('user_id', authData.user.id)
          .contains('metadata', { gateway_transaction_id: transactionId })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        payment = byMetadata.data as Record<string, unknown> | null
        readErr = byMetadata.error
      }
    }
    if (readErr) return json({ error: 'Lecture paiement impossible.' }, 400)
    if (!payment) return json({ error: 'Paiement introuvable.' }, 404)

    const metadata = (payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {}) as Record<string, unknown>
    const gatewayTransactionId = transactionId || String(metadata.gateway_transaction_id ?? payment.transaction_ref ?? '')

    const baseUrl = envRequired('PAYMENT_BASE_URL').replace(/\/+$/, '')
    const appSlug = Deno.env.get('PAYMENT_APP_SLUG')?.trim() || 'decouverte'
    const apiKey = envRequired('PAYMENT_API_KEY')
    const apiSecret = envRequired('PAYMENT_API_SECRET')

    const gatewayRes = await fetch(`${baseUrl}/api/v1/apps/${appSlug}/payments/${encodeURIComponent(gatewayTransactionId)}/status`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
        Accept: 'application/json',
      },
    })

    const gatewayText = await gatewayRes.text()
    let gatewayPayload: Record<string, unknown> = {}
    try {
      gatewayPayload = gatewayText ? JSON.parse(gatewayText) as Record<string, unknown> : {}
    } catch {
      gatewayPayload = { raw: gatewayText }
    }

    const providerMessage = getNestedString(gatewayPayload, ['provider_message', 'message', 'error', 'detail'])
    const providerStatusCode = getNestedString(gatewayPayload, ['provider_status_code', 'status_code', 'code'])

    await recordPaymentEvent(supabase, {
      payment_id: payment.id,
      event_type: gatewayRes.ok ? 'payment.status.checked' : 'payment.status.failed',
      event_id: getNestedString(gatewayPayload, ['event_id', 'id', 'transaction_id']) ?? gatewayTransactionId,
      signature_valid: true,
      payload: { status: gatewayRes.status, provider_status_code: providerStatusCode, provider_message: providerMessage, response: gatewayPayload },
    })

    if (!gatewayRes.ok) {
      return json({
        status: payment.status ?? 'pending',
        message: 'Paiement en attente.',
        provider_status_code: providerStatusCode ?? gatewayRes.status,
        provider_message: providerMessage,
      }, 200)
    }

    const status = normalizePaymentStatus(getNestedString(gatewayPayload, ['status', 'payment_status']))
    const nextMetadata = {
      ...metadata,
      gateway_transaction_id: gatewayTransactionId,
      gateway_status: status,
      last_status_check_at: new Date().toISOString(),
      provider_status_code: providerStatusCode,
      provider_message: providerMessage,
    }

    await supabase.from('payments').update({ status, metadata: nextMetadata }).eq('id', payment.id)
    if (status === 'completed') {
      await activatePaymentEntitlements(supabase, { ...payment, status, metadata: nextMetadata }, 'status_check')
    }

    return json({
      transaction_id: gatewayTransactionId,
      status,
      message:
        status === 'completed'
          ? 'Paiement reussi.'
          : status === 'failed'
            ? 'Paiement echoue.'
            : 'Paiement en attente.',
      provider_status_code: providerStatusCode,
      provider_message: providerMessage,
    })
  } catch (e) {
    const message = e instanceof Error && e.message.includes('PAYMENT_')
      ? 'Paiement Mobile Money non configure.'
      : 'Verification du paiement impossible.'
    return json({ error: message }, 500)
  }
})
