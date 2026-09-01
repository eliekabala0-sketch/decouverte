import Constants from 'expo-constants'
import { getApiSession, setApiSession, type ApiSession } from '@/lib/session'

const extra = Constants.expoConfig?.extra ?? {}
const apiUrl = String(
  process.env.EXPO_PUBLIC_API_URL ??
  extra.EXPO_PUBLIC_API_URL ??
  'https://decouverte-api-production.up.railway.app',
).replace(/\/$/, '')
export const apiBaseUrl = apiUrl
export async function apiAccessToken() {
  if (!apiUrl) throw new Error('Le nouveau serveur Découverte n’est pas encore configuré.')
  let session = await getApiSession()
  if (!session) throw new Error('Session utilisateur indisponible.')
  if (session.expiresAt > Date.now() + 30_000) return session.accessToken
  const response = await fetch(`${apiUrl}/v1/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }),
  })
  const payload = await response.json()
  if (!response.ok) { await setApiSession(null); throw new Error('Session expirée.') }
  session = { ...payload, expiresAt: Date.now() + Number(payload.expiresIn ?? 900) * 1000 } as ApiSession
  await setApiSession(session)
  return session.accessToken
}

export async function apiLogin(email: string, password: string) {
  if (!apiUrl) throw new Error('Le serveur Découverte n’est pas configuré.')
  const response = await fetch(`${apiUrl}/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'invalid_credentials')
  const session = { ...payload, expiresAt: Date.now() + Number(payload.expiresIn ?? 900) * 1000 } as ApiSession
  await setApiSession(session)
  return session
}

export async function apiRegister(email: string, phone: string, password: string) {
  if (!apiUrl) throw new Error('Le serveur Découverte n’est pas configuré.')
  const response = await fetch(`${apiUrl}/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone, password }),
  })
  const payload = await response.json()
  if (!response.ok) {
    const messages: Record<string, string> = {
      invalid_registration: 'Vérifiez le numéro et utilisez un mot de passe d’au moins 8 caractères.',
      user_already_exists: 'Ce numéro possède déjà un compte. Essayez de vous connecter.',
    }
    throw new Error(messages[payload.error] ?? payload.error ?? 'Inscription impossible.')
  }
  const session = { ...payload, expiresAt: Date.now() + Number(payload.expiresIn ?? 900) * 1000 } as ApiSession
  await setApiSession(session)
  return session
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await apiAccessToken()
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  })
  const payload = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(payload?.error ?? `Erreur serveur (${response.status})`)
  return payload as T
}

export type CallCredentials = {
  callId: string
  kind: 'audio' | 'video'
  room: string
  url: string
  token: string
}
