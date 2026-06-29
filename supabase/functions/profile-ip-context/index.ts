import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || ''
}

function truncateIp(ip: string): string {
  if (!ip) return ''
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':')
  const parts = ip.split('.')
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : ip
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function lookupGeo(ip: string): Promise<{ country?: string; region?: string; city?: string; confidence?: number; source: string }> {
  const apiUrl = Deno.env.get('GEOIP_API_URL')?.trim()
  const apiKey = Deno.env.get('GEOIP_API_KEY')?.trim()
  if (!apiUrl || !ip) return { source: 'ip_hash_only' }

  try {
    const url = new URL(apiUrl)
    url.searchParams.set('ip', ip)
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
    if (!res.ok) return { source: 'geoip_failed' }
    const payload = await res.json().catch(() => ({})) as Record<string, unknown>
    return {
      country: String(payload.country ?? payload.country_name ?? '').trim() || undefined,
      region: String(payload.region ?? payload.region_name ?? payload.state ?? '').trim() || undefined,
      city: String(payload.city ?? '').trim() || undefined,
      confidence: Number(payload.confidence ?? payload.accuracy ?? 0) || null || undefined,
      source: 'geoip_api',
    }
  } catch {
    return { source: 'geoip_failed' }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Authentification requise.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ ok: false, source: 'not_configured' })

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Session invalide.' }, 401)

  const ip = clientIp(req)
  const salt = Deno.env.get('IP_HASH_SALT') ?? serviceKey.slice(0, 24)
  const ipHash = ip ? await sha256(`${salt}:${truncateIp(ip)}`) : null
  const geo = await lookupGeo(ip)

  const serviceClient = createClient(supabaseUrl, serviceKey)
  const { data: current } = await serviceClient
    .from('profiles')
    .select('city')
    .eq('id', authData.user.id)
    .maybeSingle()

  const declaredCity = String((current as { city?: unknown } | null)?.city ?? '').trim().toLowerCase()
  const ipCity = String(geo.city ?? '').trim().toLowerCase()

  const { error } = await serviceClient
    .from('profiles')
    .update({
      ip_country: geo.country ?? null,
      ip_region: geo.region ?? null,
      ip_city: geo.city ?? null,
      ip_hash: ipHash,
      ip_source: geo.source,
      ip_confidence: geo.confidence ?? null,
      ip_last_seen_at: new Date().toISOString(),
      ip_city_mismatch: !!declaredCity && !!ipCity && declaredCity !== ipCity,
    })
    .eq('id', authData.user.id)

  if (error) return json({ ok: false, source: geo.source })
  return json({ ok: true, source: geo.source })
})
