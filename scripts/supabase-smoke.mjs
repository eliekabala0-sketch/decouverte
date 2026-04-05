/**
 * Smoke tests REST Supabase — ne pas committer de clés.
 * Usage: node scripts/supabase-smoke.mjs
 * Lit app/.env (EXPO_PUBLIC_*)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const envPath = join(root, 'app', '.env')
let envText = readFileSync(envPath, 'utf8')
if (envText.charCodeAt(0) === 0xfeff) envText = envText.slice(1)
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) {
    const k = m[1].trim().replace(/\r$/, '')
    const v = m[2].trim().replace(/\r$/, '').replace(/^["']|["']$/g, '')
    env[k] = v
  }
}

const EXPECTED = 'https://lddzhnbrknrdrhsplfzl.supabase.co'
const url = env.EXPO_PUBLIC_SUPABASE_URL || ''
const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

function headers(extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  }
}

async function req(label, input, init = {}) {
  const res = await fetch(input, { ...init, headers: { ...headers(), ...init.headers } })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { label, status: res.status, ok: res.ok, body: json }
}

async function main() {
  const out = []
  const log = (o) => {
    out.push(o)
    console.log(JSON.stringify({ label: o.label, status: o.status, ok: o.ok, snippet: summarize(o.body) }))
  }

  function summarize(body) {
    if (body == null) return null
    if (typeof body === 'string') return body.slice(0, 200)
    if (Array.isArray(body)) {
      if (body.length === 0) return []
      const keys = body[0] && typeof body[0] === 'object' ? Object.keys(body[0]).sort() : body[0]
      return { count: body.length, firstRowKeys: keys }
    }
    if (typeof body === 'object') {
      if (body.message && body.code) return { code: body.code, message: String(body.message).slice(0, 180) }
      if (body.hint || body.details) return { message: body.message, hint: body.hint, details: body.details }
      return Object.keys(body).slice(0, 30)
    }
    return String(body).slice(0, 120)
  }

  out.push({ check: 'url_exact', expected: EXPECTED, actual: url, match: url === EXPECTED })

  // 1) SELECT profiles
  log(
    await req(
      'GET profiles ?limit=5',
      `${url}/rest/v1/profiles?select=*&limit=5`,
      { headers: { Prefer: 'count=exact' } }
    )
  )

  // 2) INSERT test (anon, expect 401 JWT or 403 RLS or 400)
  const fakeId = '00000000-0000-4000-8000-000000000001'
  log(
    await req('POST profiles test insert (anon)', `${url}/rest/v1/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        id: fakeId,
        display_name: 'smoke_test',
        gender: 'M',
        birthdate: '1990-01-01',
        city: 'Kinshasa',
        commune: 'Gombe',
        bio: null,
        photo_urls: [],
        mode_libre_active: true,
        mode_serieux_active: false,
        serieux_intention: null,
        status: 'active',
        is_verified: false,
        is_boosted: false,
      }),
    })
  )

  // 3) profile_access
  log(await req('GET profile_access', `${url}/rest/v1/profile_access?select=*&limit=5`))

  // 4) contact_packs
  log(await req('GET contact_packs', `${url}/rest/v1/contact_packs?select=*&limit=20`))

  // 5) OpenAPI / schema hints
  const oa = await req('GET openapi', `${url}/rest/v1/`, {
    headers: { Accept: 'application/openapi+json' },
  })
  log(oa)
  let profilesCols = null
  let profileAccessCols = null
  let contactPacksCols = null
  if (oa.ok && oa.body && oa.body.definitions) {
    const defs = oa.body.definitions
    profilesCols = defs.profiles?.properties ? Object.keys(defs.profiles.properties).sort() : null
    profileAccessCols = defs.profile_access?.properties ? Object.keys(defs.profile_access.properties).sort() : null
    contactPacksCols = defs.contact_packs?.properties ? Object.keys(defs.contact_packs.properties).sort() : null
  }
  out.push({ openapi_profiles_columns: profilesCols, openapi_profile_access_columns: profileAccessCols, openapi_contact_packs_columns: contactPacksCols })

  // 6) PATCH profiles anon (RLS)
  log(
    await req('PATCH profiles anon', `${url}/rest/v1/profiles?id=eq.${fakeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ display_name: 'x' }),
    })
  )

  // 7) Storage buckets list
  log(await req('GET storage buckets', `${url}/storage/v1/bucket`, { method: 'GET' }))

  // Write summary file without secrets
  const fs = await import('node:fs/promises')
  await fs.writeFile(
    join(root, 'scripts', 'supabase-smoke-result.json'),
    JSON.stringify({ url_check: out[0], results: out.slice(1) }, null, 2),
    'utf8'
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
