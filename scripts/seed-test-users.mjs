/**
 * Crée / met à jour des comptes de test (Auth + profiles + profile_access). Lit app/.env
 * Usage : node scripts/seed-test-users.mjs           → tous les comptes
 *         node scripts/seed-test-users.mjs admin      → uniquement le compte admin
 *
 * Email synthétique aligné sur l’app (défaut tel_*@gmail.com ; surcharge via EXPO_PUBLIC_SYNTHETIC_EMAIL_DOMAIN).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let t = readFileSync(join(root, 'app', '.env'), 'utf8')
if (t.charCodeAt(0) === 0xfeff) t = t.slice(1)
const env = {}
for (const line of t.split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const PASS = process.env.SEED_TEST_PASSWORD || 'TestDc26'
const SYNTHETIC_DOMAIN =
  process.env.SYNTHETIC_AUTH_EMAIL_DOMAIN ||
  env.EXPO_PUBLIC_SYNTHETIC_EMAIL_DOMAIN?.replace(/^["']|["']$/g, '') ||
  'gmail.com'

const onlyAdmin = process.argv.includes('admin')

async function auth(path, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, j }
}

async function rest(method, path, token, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let j = null
  try {
    j = text ? JSON.parse(text) : null
  } catch {
    j = text
  }
  return { ok: r.ok, status: r.status, j }
}

function syntheticEmailsForSeed(phone) {
  const digits = phone.replace(/\D/g, '')
  const cleaned = phone.replace(/\s/g, '')
  return [
    `tel_${digits}@${SYNTHETIC_DOMAIN}`,
    `tel_${digits}@example.com`,
    `tel_${digits}@decouverte.auth`,
    `${cleaned}@decouverte.auth`,
  ]
}

function getServiceRole() {
  return (
    (env.SUPABASE_SERVICE_ROLE_KEY && String(env.SUPABASE_SERVICE_ROLE_KEY).replace(/^["']|["']$/g, '')) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

/** Contourne signup anonyme (429 email) : nécessite SUPABASE_SERVICE_ROLE_KEY dans app/.env (ne jamais committer). */
async function ensureAuthViaServiceRole(phone, password, canonicalEmail, phoneMeta) {
  const SERVICE_ROLE = getServiceRole()
  if (!SERVICE_ROLE) {
    return {
      error: {
        msg: 'Signup limité (email rate limit). Ajoutez SUPABASE_SERVICE_ROLE_KEY dans app/.env puis relancez le script.',
      },
    }
  }
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: canonicalEmail,
      password,
      email_confirm: true,
      user_metadata: { phone: phoneMeta },
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const m = String(j.msg || j.message || '').toLowerCase()
    if (m.includes('already') || j.error_code === 'email_exists') {
      const signin = await auth('token?grant_type=password', { email: canonicalEmail, password })
      if (signin.ok && signin.j?.access_token) {
        return {
          email: canonicalEmail,
          access_token: signin.j.access_token,
          user_id: signin.j.user?.id,
          existing: true,
        }
      }
    }
    return { error: j }
  }
  const uid = j.id || j.user?.id
  if (!uid) return { error: j }
  const signin = await auth('token?grant_type=password', { email: canonicalEmail, password })
  if (signin.ok && signin.j?.access_token) {
    return {
      email: canonicalEmail,
      access_token: signin.j.access_token,
      user_id: signin.j.user?.id || uid,
    }
  }
  return { email: canonicalEmail, user_id: uid, access_token: null }
}

async function restServiceRole(method, path, body) {
  const SERVICE_ROLE = getServiceRole()
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { ok: r.ok, status: r.status, j: parsed }
}

async function upsertProfileServiceRole(userId, row) {
  const get = await restServiceRole('GET', `profiles?id=eq.${userId}&select=id`, null)
  const exists = Array.isArray(get.j) && get.j.length > 0
  if (exists) {
    return restServiceRole('PATCH', `profiles?id=eq.${userId}`, row)
  }
  return restServiceRole('POST', 'profiles', { id: userId, ...row })
}

async function upsertAccessServiceRole(userId, row) {
  const get = await restServiceRole('GET', `profile_access?user_id=eq.${userId}&select=user_id`, null)
  const exists = Array.isArray(get.j) && get.j.length > 0
  if (exists) {
    return restServiceRole('PATCH', `profile_access?user_id=eq.${userId}`, row)
  }
  return restServiceRole('POST', 'profile_access', { user_id: userId, ...row })
}

async function ensureAuthUser(phone) {
  const digits = phone.replace(/\D/g, '')
  const phoneMeta = phone.replace(/\s/g, '')
  const canonicalEmail = `tel_${digits}@${SYNTHETIC_DOMAIN}`

  for (const email of syntheticEmailsForSeed(phone)) {
    const signin = await auth('token?grant_type=password', { email, password: PASS })
    if (signin.ok && signin.j?.access_token) {
      return { email, access_token: signin.j.access_token, user_id: signin.j.user?.id, existing: true }
    }
  }

  let res = await auth('signup', {
    email: canonicalEmail,
    password: PASS,
    data: { phone: phoneMeta },
  })

  const msg = String(res.j?.msg || res.j?.message || '').toLowerCase()
  const already =
    !res.ok &&
    (msg.includes('already') || msg.includes('registered') || res.j?.error_code === 'user_already_exists')

  if (already) {
    const signin2 = await auth('token?grant_type=password', { email: canonicalEmail, password: PASS })
    if (signin2.ok && signin2.j?.access_token) {
      return {
        email: canonicalEmail,
        access_token: signin2.j.access_token,
        user_id: signin2.j.user?.id,
        existing: true,
      }
    }
    return { email: canonicalEmail, error: res.j || res.status }
  }

  if (res.ok && res.j?.access_token) {
    return { email: canonicalEmail, access_token: res.j.access_token, user_id: res.j.user?.id }
  }
  if (res.ok && res.j?.user?.id) {
    const res2 = await auth('token?grant_type=password', { email: canonicalEmail, password: PASS })
    if (res2.ok && res2.j?.access_token) {
      return { email: canonicalEmail, access_token: res2.j.access_token, user_id: res2.j.user?.id }
    }
    return { email: canonicalEmail, error: 'no_session_after_signup', raw: res.j, signIn: res2 }
  }

  const isRate =
    !res.ok &&
    (res.status === 429 ||
      res.j?.error_code === 'over_email_send_rate_limit' ||
      String(res.j?.msg || '')
        .toLowerCase()
        .includes('rate limit'))
  if (isRate) {
    const sr = await ensureAuthViaServiceRole(phone, PASS, canonicalEmail, phoneMeta)
    if (sr?.error) return { email: canonicalEmail, error: sr.error }
    if (sr?.user_id) return sr
  }

  return { email: canonicalEmail, error: res.j || res.status }
}

async function upsertProfile(token, userId, row) {
  const get = await rest('GET', `profiles?id=eq.${userId}&select=id`, token, null)
  const exists = Array.isArray(get.j) && get.j.length > 0
  if (exists) {
    return rest('PATCH', `profiles?id=eq.${userId}`, token, row)
  }
  return rest('POST', 'profiles', token, { id: userId, ...row })
}

async function upsertAccess(token, userId, row) {
  const get = await rest('GET', `profile_access?user_id=eq.${userId}&select=user_id`, token, null)
  const exists = Array.isArray(get.j) && get.j.length > 0
  if (exists) {
    return rest('PATCH', `profile_access?user_id=eq.${userId}`, token, row)
  }
  return rest('POST', 'profile_access', token, { user_id: userId, ...row })
}

const accounts = [
  {
    phone: '+243900000101',
    label: 'homme_normal',
    profile: {
      phone: '+243900000101',
      username: 'TestHomme',
      gender: 'M',
      age: 28,
      city: 'Kinshasa',
      commune: 'Gombe',
      bio: 'Compte test homme',
      status: 'active',
      is_verified: false,
      country: 'CD',
      role: 'user',
      photo: null,
      boost_reason: null,
    },
    access: {
      contact_quota: 0,
      contact_quota_used: 0,
      photo_quota: 0,
      photo_quota_used: 0,
      all_profiles_access: false,
    },
  },
  {
    phone: '+243900000102',
    label: 'femme_vip',
    profile: {
      phone: '+243900000102',
      username: 'TestFemmeVIP',
      gender: 'F',
      age: 26,
      city: 'Kinshasa',
      commune: 'Lemba',
      bio: 'Compte test femme VIP',
      status: 'active',
      is_verified: true,
      country: 'CD',
      role: 'user',
      photo: 'https://picsum.photos/seed/femmevip/400/400',
      boost_reason: null,
    },
    access: {
      contact_quota: 50,
      contact_quota_used: 0,
      photo_quota: 10,
      photo_quota_used: 0,
      all_profiles_access: true,
    },
  },
  {
    phone: '+243900000199',
    label: 'admin',
    profile: {
      phone: '+243900000199',
      username: 'AdminDecouverte',
      gender: 'M',
      age: 35,
      city: 'Kinshasa',
      commune: 'Gombe',
      bio: 'Compte administrateur test (rôle admin)',
      status: 'active',
      is_verified: true,
      country: 'CD',
      role: 'admin',
      photo: 'https://picsum.photos/seed/admindecouverte/400/400',
      boost_reason: null,
    },
    access: {
      contact_quota: 100,
      contact_quota_used: 0,
      photo_quota: 100,
      photo_quota_used: 0,
      all_profiles_access: true,
    },
  },
]

const toRun = onlyAdmin ? accounts.filter((a) => a.label === 'admin') : accounts

if (!SUPABASE_URL || !ANON) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in app/.env')
  process.exit(1)
}

const results = []
for (const a of toRun) {
  const authRes = await ensureAuthUser(a.phone)
  const uid = authRes.user_id
  if (authRes.error || !uid) {
    results.push({ ...a, authRes })
    continue
  }

  let p
  let pa
  if (authRes.access_token) {
    p = await upsertProfile(authRes.access_token, uid, a.profile)
    pa = await upsertAccess(authRes.access_token, uid, {
      ...a.access,
      updated_at: new Date().toISOString(),
    })
  } else if (getServiceRole()) {
    p = await upsertProfileServiceRole(uid, a.profile)
    pa = await upsertAccessServiceRole(uid, {
      ...a.access,
      updated_at: new Date().toISOString(),
    })
  } else {
    results.push({
      ...a,
      authRes: {
        ...authRes,
        error: 'Pas de session utilisateur : ajoutez SUPABASE_SERVICE_ROLE_KEY dans app/.env pour finaliser profiles.',
      },
    })
    continue
  }

  results.push({
    label: a.label,
    phone: a.phone,
    email: authRes.email,
    synthetic_emails_login_order: syntheticEmailsForSeed(a.phone),
    password_set_via_seed: true,
    user_id: uid,
    profile: p.ok ? 'ok' : p,
    profile_access: pa.ok ? 'ok' : pa,
  })
}

console.log(JSON.stringify(results, null, 2))
