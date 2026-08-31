const baseUrl = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const KEY = 'decouverte.admin.mysql.session.v1'
export type AdminUser = { id: string; email: string; role: string }
type Session = { user: AdminUser; accessToken: string; refreshToken: string; expiresAt: number }
export function getAdminSession(): Session | null { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null } catch { return null } }
export function clearAdminSession() { localStorage.removeItem(KEY) }
export async function adminLogin(email: string, password: string) {
  const response = await fetch(`${baseUrl}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'Connexion impossible.')
  if (!['admin', 'super_admin'].includes(payload.user?.role)) throw new Error('Compte non autorisé pour le dashboard administrateur.')
  const session = { ...payload, expiresAt: Date.now() + Number(payload.expiresIn ?? 900) * 1000 } as Session
  localStorage.setItem(KEY, JSON.stringify(session)); return session
}
async function token() {
  let session = getAdminSession(); if (!session) throw new Error('Session administrateur absente.')
  if (session.expiresAt > Date.now() + 30000) return session.accessToken
  const response = await fetch(`${baseUrl}/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) })
  const payload = await response.json()
  if (!response.ok || !['admin', 'super_admin'].includes(payload.user?.role)) { clearAdminSession(); throw new Error('Session expirée.') }
  session = { ...payload, expiresAt: Date.now() + Number(payload.expiresIn ?? 900) * 1000 } as Session; localStorage.setItem(KEY, JSON.stringify(session)); return session.accessToken
}
export async function adminRequest<T>(path: string, init: RequestInit = {}) {
  const accessToken = await token(); const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, ...init.headers } })
  const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? `Erreur serveur (${response.status})`); return payload as T
}
