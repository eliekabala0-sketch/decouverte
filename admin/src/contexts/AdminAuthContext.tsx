import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import type { User } from '@supabase/supabase-js'

export type AdminAuthContextType = {
  user: User | null
  isAdmin: boolean
  loading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  authError: string | null
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const resolveAdmin = async (u: User | null) => {
    if (!u?.id) {
      setIsAdmin(false)
      return false
    }
    const { data } = await supabase.from('profiles').select('role').eq('id', u.id).maybeSingle()
    const ok = (data as { role?: string } | null)?.role === 'admin'
    setIsAdmin(ok)
    return ok
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const current = session?.user ?? null
      setUser(current)
      await resolveAdmin(current)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsAdmin(false)
        setAuthError('Session expirée. Veuillez vous reconnecter.')
      } else {
        const current = session?.user ?? null
        setUser(current)
        const ok = await resolveAdmin(current)
        setAuthError(ok ? null : 'Compte non autorisé pour le dashboard admin.')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message || 'Erreur de connexion.')
    } else {
      const current = (await supabase.auth.getUser()).data.user
      const ok = await resolveAdmin(current ?? null)
      if (!ok) {
        setAuthError('Compte non autorisé pour le dashboard admin.')
        await supabase.auth.signOut()
        setUser(null)
        return { error: new Error('Compte non autorisé pour le dashboard admin.') }
      }
      setUser(current ?? null)
      setAuthError(null)
    }
    return { error: error ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setAuthError(null)
  }

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        isAdmin,
        loading,
        isAuthenticated: !!user,
        signIn,
        signOut,
        authError,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthContextType {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
