import React, { createContext, useContext, useEffect, useState } from 'react'
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

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select(
        'id,created_at,phone,photo,gender,city,commune,bio,status,is_verified,username,age,boost_reason,country,role'
      )
      .eq('id', userId)
      .single()
    if (!data) {
      setProfile(null)
      return
    }
    setProfile(data as Profile)
  }

  const fetchProfileAccess = async (userId: string) => {
    const { data } = await supabase
      .from('profile_access')
      .select('user_id,contact_quota,contact_quota_used,updated_at,photo_quota,photo_quota_used,all_profiles_access')
      .eq('user_id', userId)
      .maybeSingle()
    setProfileAccess(data as ProfileAccess | null)
  }

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id)
      await fetchProfileAccess(user.id)
    }
  }

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user?.id) {
        await fetchProfile(session.user.id)
        await fetchProfileAccess(session.user.id)
      } else {
        setProfile(null)
        setProfileAccess(null)
      }
      if (mounted) setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user?.id) {
        await fetchProfile(session.user.id)
        await fetchProfileAccess(session.user.id)
      } else {
        setProfile(null)
        setProfileAccess(null)
      }
      setLoading(false)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

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
