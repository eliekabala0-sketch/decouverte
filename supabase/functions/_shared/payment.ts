import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export type PaymentStatus = 'pending' | 'completed' | 'failed'

export const gatewayProvider = 'badiboss_pay'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-badiboss-signature, x-badiboss-timestamp',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export function envRequired(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function createServiceClient() {
  return createClient(envRequired('SUPABASE_URL'), envRequired('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createUserClient(authHeader: string) {
  return createClient(envRequired('SUPABASE_URL'), envRequired('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function normalizePaymentStatus(status: string | null | undefined): PaymentStatus {
  const value = String(status ?? '').trim().toLowerCase()
  if (['completed', 'success', 'successful', 'paid', 'confirmed'].includes(value)) return 'completed'
  if (['failed', 'cancelled', 'canceled', 'expired', 'error', 'rejected'].includes(value)) return 'failed'
  return 'pending'
}

export function getString(input: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

export function getNestedString(input: Record<string, unknown>, keys: string[]): string | null {
  const direct = getString(input, keys)
  if (direct) return direct
  for (const container of ['data', 'payment', 'transaction']) {
    const nested = input[container]
    if (nested && typeof nested === 'object') {
      const found = getString(nested as Record<string, unknown>, keys)
      if (found) return found
    }
  }
  return null
}

export function extendUntil(current: string | null | undefined, days: number): string {
  const now = Date.now()
  const cur = current ? new Date(current).getTime() : 0
  const base = Number.isFinite(cur) && cur > now ? cur : now
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString()
}

export async function recordPaymentEvent(
  supabase: ReturnType<typeof createClient>,
  params: {
    payment_id?: string
    event_type: string
    event_id?: string | null
    signature_valid?: boolean
    payload: Record<string, unknown>
  },
) {
  await supabase.from('payment_events').insert({
    payment_id: params.payment_id,
    provider: gatewayProvider,
    event_type: params.event_type,
    event_id: params.event_id,
    signature_valid: !!params.signature_valid,
    payload: params.payload,
    processed_at: new Date().toISOString(),
  })
}

export async function activatePaymentEntitlements(
  supabase: ReturnType<typeof createClient>,
  payment: Record<string, unknown>,
  source: string,
) {
  const metadata = (payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {}) as Record<string, unknown>
  if (metadata.activation_processed_at) return { activated: false, already_processed: true }

  const userId = String(payment.user_id ?? '')
  const provider = String(payment.provider ?? payment.type ?? '')
  if (!userId) return { activated: false, already_processed: false }

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
    if (accessErr) throw new Error(accessErr.message)
    const { error: eventErr } = await supabase.from('profile_access_events').insert({
      user_id: userId,
      access_type: 'profile',
      event_type: 'payment_profiles_access',
      payment_id: String(payment.id),
      metadata: { source },
    })
    if (eventErr) throw new Error(eventErr.message)
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
    if (accessErr) throw new Error(accessErr.message)
    const { error: eventErr } = await supabase.from('profile_access_events').insert({
      user_id: userId,
      access_type: 'contact',
      event_type: 'payment_contact_pack',
      payment_id: String(payment.id),
      metadata: { add_contacts: addContacts, add_photos: addPhotos, all_profiles_access: allProfilesAccess, source },
    })
    if (eventErr) throw new Error(eventErr.message)
  }

  if (provider === 'visibility_boost') {
    const days = Number(metadata.days ?? 7)
    const safeDays = Number.isFinite(days) && days > 0 ? days : 7
    const { data: prof } = await supabase.from('profiles').select('boosted_until,boost_reason').eq('id', userId).maybeSingle()
    const newUntil = extendUntil((prof as { boosted_until?: string | null } | null)?.boosted_until, safeDays)
    const { error: boostErr } = await supabase.from('profiles').update({
      boosted_until: newUntil,
      is_boosted: true,
      boost_reason: (prof as { boost_reason?: string | null } | null)?.boost_reason || 'paid',
    }).eq('id', userId)
    if (boostErr) throw new Error(boostErr.message)
    const { error: eventErr } = await supabase.from('profile_access_events').insert({
      user_id: userId,
      access_type: 'profile',
      event_type: 'payment_visibility_boost',
      payment_id: String(payment.id),
      metadata: { boosted_until: newUntil, days: safeDays, source },
    })
    if (eventErr) throw new Error(eventErr.message)
  }

  const nextMetadata = {
    ...metadata,
    activation_processed_at: new Date().toISOString(),
    activation_source: source,
  }
  const { error: metaErr } = await supabase.from('payments').update({ metadata: nextMetadata }).eq('id', payment.id)
  if (metaErr) throw new Error(metaErr.message)

  return { activated: true, already_processed: false }
}
