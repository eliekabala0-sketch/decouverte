import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

export type ApiUser = { id: string; email: string; role: string }
export type ApiSession = { user: ApiUser; accessToken: string; refreshToken: string; expiresAt: number }

const KEY = 'decouverte.mysql.session.v1'
const listeners = new Set<(session: ApiSession | null) => void>()

async function readRaw() {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null
  return SecureStore.getItemAsync(KEY)
}

async function writeRaw(value: string | null) {
  if (Platform.OS === 'web') {
    if (value) globalThis.localStorage?.setItem(KEY, value)
    else globalThis.localStorage?.removeItem(KEY)
    return
  }
  if (value) await SecureStore.setItemAsync(KEY, value)
  else await SecureStore.deleteItemAsync(KEY)
}

export async function getApiSession(): Promise<ApiSession | null> {
  const raw = await readRaw()
  if (!raw) return null
  try { return JSON.parse(raw) as ApiSession } catch { await writeRaw(null); return null }
}

export async function setApiSession(session: ApiSession | null) {
  await writeRaw(session ? JSON.stringify(session) : null)
  listeners.forEach((listener) => listener(session))
}

export function onApiSessionChange(listener: (session: ApiSession | null) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
