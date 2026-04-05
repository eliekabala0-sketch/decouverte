import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const extra = Constants.expoConfig?.extra ?? {}

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.EXPO_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY for App.')
}

const webStorage: Storage | null =
  typeof window !== 'undefined' ? window.sessionStorage : null

const storage =
  Platform.OS === 'web' && webStorage
    ? {
        getItem: (key: string) => {
          try {
            return webStorage.getItem(key)
          } catch {
            return null
          }
        },
        setItem: (key: string, value: string) => {
          try {
            webStorage.setItem(key, value)
          } catch {}
        },
        removeItem: (key: string) => {
          try {
            webStorage.removeItem(key)
          } catch {}
        },
      }
    : undefined

export const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: {
    storage,
    storageKey: 'decouverte-auth',
    persistSession: true,
    // Sur web, le refresh auto + lock peut rester bloqué selon environnements/onglets.
    autoRefreshToken: Platform.OS !== 'web',
    detectSessionInUrl: Platform.OS === 'web',
    // Réduit les warnings « lock not released / stolen » (support runtime auth-js ; types parfois en retard).
    // @ts-expect-error lockAcquireTimeout existe sur GoTrueClient
    lockAcquireTimeout: 20000,
  },
})

