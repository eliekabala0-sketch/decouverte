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
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileAccess, setProfileAccess] = useState<ProfileAccess | null>(null)
  const [loading, setLoading] = useState(true)

  /** Évite courses entre refreshProfile et onAuthStateChange (même utilisateur). */
  const profileChainRef = useRef(Promise.resolve())

  const loadProfilesForUser = useCallback(async (userId: string) => {
    const run = async () => {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select(
          'id,created_at,phone,photo,gender,city,commune,bio,status,is_verified,username,age,boost_reason,country,role'
        )
        .eq('id', userId)
        .maybeSingle()
      if (profErr) {
        console.warn('[Auth] profiles:', profErr.message)
        setProfile(null)
      } else {
        setProfile((prof as Profile | null) ?? null)
      }

      const { data: acc, error: accErr } = await supabase
        .from('profile_access')
        .select(
          'user_id,contact_quota,contact_quota_used,updated_at,profiles_access_until,photo_quota,photo_quota_used,all_profiles_access'
        )
        .eq('user_id', userId)
        .maybeSingle()
      if (accErr) {
        console.warn('[Auth] profile_access:', accErr.message)
        setProfileAccess(null)
      } else {
        setProfileAccess((acc as ProfileAccess | null) ?? null)
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

  useEffect(() => {
    let mounted = true
    // Un seul flux d’init : onAuthStateChange émet INITIAL_SESSION après le lock interne.
    // Ne pas appeler getSession() en parallèle : ça provoque des courses sur lock:decouverte-auth (web).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      try {
        if (session?.user?.id) {
          await loadProfilesForUser(session.user.id)
        } else {
          setProfile(null)
          setProfileAccess(null)
        }
      } catch (e) {
        console.warn('[Auth] load profiles after session change', e)
      } finally {
        if (mounted) setLoading(false)
      }
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfilesForUser])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setProfileAccess(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, profileAccess, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
