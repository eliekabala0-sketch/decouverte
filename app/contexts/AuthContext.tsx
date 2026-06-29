import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile, ProfileAccess } from '../../lib/types'

type AuthContextType = {
  user: User | null
  profile: Profile | null
  profileAccess: ProfileAccess | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  primeProfile: (nextProfile: Profile | null, nextAccess?: ProfileAccess | null) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const PROFILE_SELECT =
  'id,created_at,phone,photo,gender,city,commune,bio,status,is_verified,username,age,boost_reason,boosted_until,is_boosted,country,role,mode_libre_active,mode_serieux_active'

const PROFILE_ACCESS_SELECT =
  'user_id,contact_quota,contact_quota_used,updated_at,photo_quota,photo_quota_used,all_profiles_access'

const SESSION_TIMEOUT_MS = 12_000
const PROFILE_LOAD_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileAccess, setProfileAccess] = useState<ProfileAccess | null>(null)
  const [loading, setLoading] = useState(true)

  const profileChainRef = useRef(Promise.resolve())
  const expectedUserIdRef = useRef<string | null>(null)

  const loadProfilesForUser = useCallback(async (userId: string) => {
    const run = async () => {
      const [profileResult, accessResult] = await withTimeout(
        Promise.all([
          supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle(),
          supabase.from('profile_access').select(PROFILE_ACCESS_SELECT).eq('user_id', userId).maybeSingle(),
        ]),
        PROFILE_LOAD_TIMEOUT_MS,
        'load profile'
      )

      if (expectedUserIdRef.current !== userId) return

      if (profileResult.error) {
        console.warn('[Auth] profiles:', profileResult.error.message)
        setProfile(null)
      } else {
        setProfile((profileResult.data as Profile | null) ?? null)
      }

      if (expectedUserIdRef.current !== userId) return

      if (accessResult.error) {
        console.warn('[Auth] profile_access:', accessResult.error.message)
        setProfileAccess(null)
      } else {
        setProfileAccess((accessResult.data as ProfileAccess | null) ?? null)
      }
    }

    const next = profileChainRef.current.then(run, run)
    profileChainRef.current = next.catch(() => {})
    await next
  }, [])

  const refreshProfile = useCallback(async () => {
    const uid = user?.id
    if (!uid) return
    await loadProfilesForUser(uid)
  }, [user?.id, loadProfilesForUser])

  const primeProfile = useCallback((nextProfile: Profile | null, nextAccess?: ProfileAccess | null) => {
    setProfile(nextProfile)
    if (nextAccess !== undefined) setProfileAccess(nextAccess)
  }, [])

  useEffect(() => {
    let mounted = true

    const applySession = (session: { user: User } | null, source: string) => {
      if (!mounted) return

      const uid = session?.user?.id ?? null
      expectedUserIdRef.current = uid
      setUser(session?.user ?? null)

      if (!uid) {
        setProfile(null)
        setProfileAccess(null)
        setLoading(false)
        return
      }

      void (async () => {
        try {
          await loadProfilesForUser(uid)
        } catch (e) {
          console.warn(`[Auth] load profiles ${source}`, e)
          if (mounted && expectedUserIdRef.current === uid) {
            setProfile(null)
            setProfileAccess(null)
          }
        } finally {
          if (mounted && expectedUserIdRef.current === uid) setLoading(false)
        }
      })()
    }

    void (async () => {
      try {
        const { data, error } = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS, 'getSession')
        if (error) console.warn('[Auth] getSession:', error.message)
        applySession(data.session, 'bootstrap')
      } catch (e) {
        console.warn('[Auth] bootstrap session', e)
        if (!mounted) return
        expectedUserIdRef.current = null
        setUser(null)
        setProfile(null)
        setProfileAccess(null)
        setLoading(false)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session, `session change ${_event}`)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfilesForUser])

  const signOut = async () => {
    expectedUserIdRef.current = null
    profileChainRef.current = Promise.resolve()
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) console.warn('[Auth] signOut:', error.message)
    } catch (e) {
      console.warn('[Auth] signOut', e)
    }
    setUser(null)
    setProfile(null)
    setProfileAccess(null)
    setLoading(false)
  }

  return (
    <AuthContext.Provider value={{ user, profile, profileAccess, loading, signOut, refreshProfile, primeProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
