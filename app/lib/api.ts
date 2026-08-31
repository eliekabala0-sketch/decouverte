import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'

const extra = Constants.expoConfig?.extra ?? {}
const apiUrl = String(process.env.EXPO_PUBLIC_API_URL ?? extra.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
export const apiBaseUrl = apiUrl
let cachedToken: { value: string; expiresAt: number } | null = null

export async function apiAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value
  const { data } = await supabase.auth.getSession()
  const sourceToken = data.session?.access_token
  if (!sourceToken) throw new Error('Session utilisateur indisponible.')
  if (!apiUrl) throw new Error('Le nouveau serveur Découverte n’est pas encore configuré.')
  const response = await fetch(`${apiUrl}/v1/auth/exchange`, {
    method: 'POST', headers: { Authorization: `Bearer ${sourceToken}` },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'Impossible de sécuriser la session d’appel.')
  cachedToken = { value: payload.accessToken, expiresAt: Date.now() + Number(payload.expiresIn ?? 900) * 1000 }
  return cachedToken.value
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
