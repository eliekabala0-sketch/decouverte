import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let envText = readFileSync(join(root, 'app', '.env'), 'utf8')
if (envText.charCodeAt(0) === 0xfeff) envText = envText.slice(1)
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const url = env.EXPO_PUBLIC_SUPABASE_URL
const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const h = { apikey: key, Authorization: `Bearer ${key}` }

async function probe(table, cols) {
  for (const c of cols) {
    const r = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(c)}&limit=1`, { headers: h })
    const t = await r.text()
    console.log(table, c, r.status, r.status === 200 ? 'OK' : t.slice(0, 140))
  }
}

await probe('profile_access', [
  'user_id',
  'contact_quota',
  'contact_quota_used',
  'updated_at',
  'photo_quota',
  'photo_quota_used',
  'all_profiles_access',
])
await probe('contact_packs', [
  'id',
  'name',
  'quota',
  'contact_quota',
  'photo_quota',
  'all_profiles_access',
  'price_cents',
  'currency',
  'is_active',
  'sort_order',
  'created_at',
])
