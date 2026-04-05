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

const listRes = await fetch(`${url}/storage/v1/object/list/admin-media`, {
  method: 'POST',
  headers: { ...h, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '', limit: 5 }),
})
console.log('list admin-media', listRes.status, (await listRes.text()).slice(0, 400))

const upRes = await fetch(`${url}/storage/v1/object/admin-media/smoke-test-${Date.now()}.txt`, {
  method: 'POST',
  headers: { ...h, 'Content-Type': 'text/plain', 'x-upsert': 'false' },
  body: 'smoke',
})
const upText = await upRes.text()
console.log('upload anon', upRes.status, upText.slice(0, 400))

const patchRes = await fetch(
  `${url}/rest/v1/profiles?id=eq.00000000-0000-4000-8000-000000000099`,
  {
    method: 'PATCH',
    headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ username: 'x' }),
  }
)
console.log('PATCH profiles anon (valid col)', patchRes.status, (await patchRes.text()).slice(0, 300))
