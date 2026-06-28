import {
  createServiceClient,
  createUserClient,
  envRequired,
  gatewayProvider,
  getNestedString,
  json,
  normalizePaymentStatus,
  recordPaymentEvent,
  cors,
} from '../_shared/payment.ts'

type PaymentType = 'contact_pack' | 'visibility_boost' | 'profiles_access'
type Network = 'OM' | 'AM' | 'MP' | 'AFRIMONEY'
type Currency = 'USD' | 'CDF'

const allowedNetworks = new Set<Network>(['OM', 'AM', 'MP', 'AFRIMONEY'])
const allowedCurrencies = new Set<Currency>(['USD', 'CDF'])

function normalizeType(value: unknown): PaymentType | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'pack' || raw === 'contact_pack') return 'contact_pack'
  if (raw === 'boost' || raw === 'visibility_boost') return 'visibility_boost'
  if (raw === 'profiles_access' || raw === 'profile_access') return 'profiles_access'
  return null
}

function asMoney(value: unknown): number {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

function transactionRef(userId: string, type: PaymentType) {
  return `decouverte-${type}-${userId.slice(0, 8)}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Authentification requise.' }, 401)

    const userClient = createUserClient(authHeader)
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData.user) return json({ error: 'Session invalide.' }, 401)

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return json({ error: 'Requete invalide.' }, 400)

    const paymentType = normalizeType(body.payment_type ?? body.type)
    if (!paymentType) return json({ error: 'Type de paiement invalide.' }, 400)

    const amount = asMoney(body.amount)
    if (amount <= 0) return json({ error: 'Montant invalide.' }, 400)

    const currency = String(body.currency ?? 'USD').trim().toUpperCase() as Currency
    if (!allowedCurrencies.has(currency)) return json({ error: 'Devise invalide.' }, 400)

    const network = String(body.network ?? '').trim().toUpperCase() as Network
    if (!allowedNetworks.has(network)) return json({ error: 'Reseau Mobile Money invalide.' }, 400)

    const customerPhone = String(body.customer_phone ?? body.phone ?? '').trim()
    if (customerPhone.replace(/\D/g, '').length < 8) return json({ error: 'Telephone client invalide.' }, 400)

    const metadata = (body.metadata && typeof body.metadata === 'object' ? body.metadata : {}) as Record<string, unknown>
    const userId = authData.user.id
    const reference = transactionRef(userId, paymentType)
    const supabase = createServiceClient()

    const { data: payment, error: insertErr } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        amount,
        currency,
        payment_method: 'mobile_money',
        payment_provider: 'secure_checkout',
        provider: paymentType,
        transaction_ref: reference,
        status: 'pending',
        metadata: {
          ...metadata,
          app_id: Deno.env.get('PAYMENT_APP_ID') ?? 'app_decouverte_ad0c17',
          app_slug: Deno.env.get('PAYMENT_APP_SLUG') ?? 'decouverte',
          customer_phone: customerPhone,
          network,
          requested_currency: currency,
        },
      })
      .select('*')
      .single()
    if (insertErr) return json({ error: 'Paiement en attente non cree.' }, 400)

    const baseUrl = envRequired('PAYMENT_BASE_URL').replace(/\/+$/, '')
    const appSlug = Deno.env.get('PAYMENT_APP_SLUG')?.trim() || 'decouverte'
    const appId = Deno.env.get('PAYMENT_APP_ID')?.trim() || 'app_decouverte_ad0c17'
    const apiKey = envRequired('PAYMENT_API_KEY')
    const apiSecret = envRequired('PAYMENT_API_SECRET')

    const gatewayBody = {
      app_id: appId,
      app_slug: appSlug,
      reference,
      merchant_reference: reference,
      customer_id: userId,
      amount,
      currency,
      phone: customerPhone,
      clientPhone: customerPhone,
      customer_phone: customerPhone,
      network,
      payment_type: paymentType,
      callback_url: `${envRequired('SUPABASE_URL')}/functions/v1/badiboss-webhook`,
      metadata: {
        ...metadata,
        payment_id: payment.id,
        user_id: userId,
        provider: paymentType,
        reference,
      },
    }

    const gatewayRes = await fetch(`${baseUrl}/api/v1/apps/${appSlug}/payments`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(gatewayBody),
    })

    const gatewayText = await gatewayRes.text()
    let gatewayPayload: Record<string, unknown> = {}
    try {
      gatewayPayload = gatewayText ? JSON.parse(gatewayText) as Record<string, unknown> : {}
    } catch {
      gatewayPayload = { raw: gatewayText }
    }

    await recordPaymentEvent(supabase, {
      payment_id: payment.id,
      event_type: gatewayRes.ok ? 'payment.create.accepted' : 'payment.create.failed',
      event_id: getNestedString(gatewayPayload, ['transaction_id', 'id', 'reference']) ?? reference,
      signature_valid: true,
      payload: { status: gatewayRes.status, response: gatewayPayload },
    })

    if (!gatewayRes.ok) {
      await supabase.from('payments').update({ status: 'failed' }).eq('id', payment.id)
      return json({ status: 'failed', message: 'Paiement echoue. Reessayez dans quelques instants.' }, 502)
    }

    const gatewayTransactionId =
      getNestedString(gatewayPayload, ['transaction_id', 'id', 'payment_id', 'reference']) ?? reference
    const status = normalizePaymentStatus(getNestedString(gatewayPayload, ['status', 'payment_status']))
    const nextMetadata = {
      ...((payment.metadata ?? {}) as Record<string, unknown>),
      gateway_transaction_id: gatewayTransactionId,
      gateway_status: status,
    }
    await supabase.from('payments').update({ status, metadata: nextMetadata }).eq('id', payment.id)

    return json({
      transaction_id: gatewayTransactionId,
      status,
      message:
        status === 'completed'
          ? 'Paiement reussi.'
          : status === 'failed'
            ? 'Paiement echoue.'
            : 'Paiement en attente.',
    })
  } catch (e) {
    const message = e instanceof Error && e.message.includes('PAYMENT_')
      ? 'Paiement Mobile Money non configure.'
      : 'Creation du paiement impossible.'
    return json({ error: message }, 500)
  }
})
