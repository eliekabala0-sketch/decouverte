import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-badiboss-signature',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function getString(input: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function extendUntil(current: string | null | undefined, days: number): string {
  const now = Date.now()
  const cur = current ? new Date(current).getTime() : 0
  const base = Number.isFinite(cur) && cur > now ? cur : now
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const webhookSecret = Deno.env.get('BADIBOSS_WEBHOOK_SECRET') ?? ''
  if (!supabaseUrl || !serviceKey || !webhookSecret) {
    return json({ error: 'Webhook not configured' }, 500)
  }

  const bodyText = await req.text()
  const providedSig = req.headers.get('x-badiboss-signature') ?? ''
  const expectedSig = await hmacSha256Hex(webhookSecret, bodyText)
  const signatureValid = safeEquals(providedSig, expectedSig)

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(bodyText) as Record<string, unknown>
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const eventId = getString(payload, ['event_id', 'id', 'reference', 'transaction_id'])
  const eventType = getString(payload, ['event_type', 'type', 'status']) ?? 'payment.updated'
  const transactionRef = getString(payload, ['transaction_ref', 'reference', 'merchant_reference'])
  const paymentId = getString(payload, ['payment_id', 'metadata_payment_id'])
  const rawStatus = (getString(payload, ['status', 'payment_status']) ?? '').toLowerCase()
  const completed = ['completed', 'success', 'successful', 'paid', 'confirmed'].includes(rawStatus)
  const failed = ['failed', 'cancelled', 'canceled', 'expired'].includes(rawStatus)

  const { data: eventRow, error: eventErr } = await supabase
    .from('payment_events')
    .insert({
      provider: 'badiboss_pay',
      event_type: eventType,
      event_id: eventId,
      signature_valid: signatureValid,
      payload,
    })
    .select('id')
    .maybeSingle()

  if (eventErr?.code === '23505') {
    return json({ ok: true, duplicate: true })
  }
  if (eventErr) {
    return json({ error: eventErr.message }, 400)
  }

  if (!signatureValid) {
    return json({ error: 'Invalid signature' }, 401)
  }

  let query = supabase.from('payments').select('*')
  if (paymentId) query = query.eq('id', paymentId)
  else if (transactionRef) query = query.eq('transaction_ref', transactionRef)
  else return json({ error: 'Missing payment reference' }, 400)

  const { data: payment, error: payReadErr } = await query.maybeSingle()
  if (payReadErr) return json({ error: payReadErr.message }, 400)
  if (!payment) return json({ error: 'Payment not found' }, 404)

  const paymentRow = payment as Record<string, unknown>
  const userId = String(paymentRow.user_id ?? '')
  const provider = String(paymentRow.provider ?? paymentRow.type ?? '')
  const metadata = (paymentRow.metadata && typeof paymentRow.metadata === 'object' ? paymentRow.metadata : {}) as Record<string, unknown>

  const nextStatus = completed ? 'completed' : failed ? 'failed' : 'pending'
  const { error: payUpdateErr } = await supabase
    .from('payments')
    .update({ status: nextStatus })
    .eq('id', paymentRow.id)
  if (payUpdateErr) return json({ error: payUpdateErr.message }, 400)

  if (completed && userId) {
    if (provider === 'profiles_access') {
      const photoQuota = Number(metadata.photo_quota ?? 100)
      const { error: accessErr } = await supabase.from('profile_access').upsert(
        {
          user_id: userId,
          photo_quota: photoQuota,
          photo_quota_used: 0,
          all_profiles_access: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (accessErr) return json({ error: accessErr.message }, 400)
      const { error: eventErr } = await supabase.from('profile_access_events').insert({
        user_id: userId,
        access_type: 'profile',
        event_type: 'payment_profiles_access',
        payment_id: String(paymentRow.id),
        metadata: { provider: 'badiboss_pay', event_id: eventId },
      })
      if (eventErr) return json({ error: eventErr.message }, 400)
    }

    if (provider === 'contact_pack') {
      const addContacts = Number(metadata.contact_quota ?? metadata.quota ?? 0)
      const addPhotos = Number(metadata.photo_quota ?? 0)
      const allProfilesAccess = Boolean(metadata.all_profiles_access)
      const { data: acc } = await supabase.from('profile_access').select('*').eq('user_id', userId).maybeSingle()
      const row = (acc ?? {}) as Record<string, number | boolean | null>
      const { error: accessErr } = await supabase.from('profile_access').upsert(
        {
          user_id: userId,
          contact_quota: Number(row.contact_quota ?? 0) + addContacts,
          contact_quota_used: Number(row.contact_quota_used ?? 0),
          photo_quota: Number(row.photo_quota ?? 0) + addPhotos,
          photo_quota_used: Number(row.photo_quota_used ?? 0),
          all_profiles_access: Boolean(row.all_profiles_access) || allProfilesAccess,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (accessErr) return json({ error: accessErr.message }, 400)
      const { error: eventErr } = await supabase.from('profile_access_events').insert({
        user_id: userId,
        access_type: 'contact',
        event_type: 'payment_contact_pack',
        payment_id: String(paymentRow.id),
        metadata: { add_contacts: addContacts, add_photos: addPhotos, all_profiles_access: allProfilesAccess },
      })
      if (eventErr) return json({ error: eventErr.message }, 400)
    }

    if (provider === 'visibility_boost') {
      const days = Number(metadata.days ?? 7)
      const { data: prof } = await supabase.from('profiles').select('boosted_until,boost_reason').eq('id', userId).maybeSingle()
      const newUntil = extendUntil((prof as { boosted_until?: string | null } | null)?.boosted_until, Number.isFinite(days) && days > 0 ? days : 7)
      const { error: boostErr } = await supabase.from('profiles').update({
        boosted_until: newUntil,
        is_boosted: true,
        boost_reason: (prof as { boost_reason?: string | null } | null)?.boost_reason || 'paid',
      }).eq('id', userId)
      if (boostErr) return json({ error: boostErr.message }, 400)
      const { error: eventErr } = await supabase.from('profile_access_events').insert({
        user_id: userId,
        access_type: 'profile',
        event_type: 'payment_visibility_boost',
        payment_id: String(paymentRow.id),
        metadata: { boosted_until: newUntil, days },
      })
      if (eventErr) return json({ error: eventErr.message }, 400)
    }
  }

  if (eventRow?.id) {
    const { error: eventUpdateErr } = await supabase
      .from('payment_events')
      .update({ payment_id: String(paymentRow.id), processed_at: new Date().toISOString() })
      .eq('id', eventRow.id)
    if (eventUpdateErr) return json({ error: eventUpdateErr.message }, 400)
  }

  return json({ ok: true, payment_id: paymentRow.id, status: nextStatus })
})
