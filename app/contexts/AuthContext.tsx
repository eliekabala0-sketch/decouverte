import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { apiRequest } from '@/lib/api'
import { getApiSession, onApiSessionChange, setApiSession, type ApiUser } from '@/lib/session'
import type { Profile, ProfileAccess } from '../../lib/types'

type AuthContextType = {
  user: ApiUser | null
  profile: Profile | null
  profileAccess: ProfileAccess | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  primeProfile: (nextProfile: Profile | null, nextAccess?: ProfileAccess | null) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

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
  const [user, setUser] = useState<ApiUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileAccess, setProfileAccess] = useState<ProfileAccess | null>(null)
  const [loading, setLoading] = useState(true)

  const profileChainRef = useRef(Promise.resolve())
  const expectedUserIdRef = useRef<string | null>(null)

  const loadProfilesForUser = useCallback(async (userId: string) => {
    const run = async () => {
      const result = await withTimeout(
        apiRequest<{ profile: Profile | null; profileAccess: ProfileAccess | null }>('/v1/me'),
        PROFILE_LOAD_TIMEOUT_MS,
        'load profile'
      )

      if (expectedUserIdRef.current !== userId) return

      setProfile(result.profile ?? null)

      if (expectedUserIdRef.current !== userId) return

      setProfileAccess(result.profileAccess ?? null)
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

    const applySession = (session: { user: ApiUser } | null, source: string) => {
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
        applySession(await getApiSession(), 'bootstrap')
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

    const unsubscribe = onApiSessionChange((session) => applySession(session, 'session change'))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [loadProfilesForUser])

  const signOut = async () => {
    expectedUserIdRef.current = null
    profileChainRef.current = Promise.resolve()
    try {
      await setApiSession(null)
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
