import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import type { User } from '@supabase/supabase-js'

type AdminAuthContextType = {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  authError: string | null
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setAuthError('Session expirée. Veuillez vous reconnecter.')
      } else {
        setUser(session?.user ?? null)
        setAuthError(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message || 'Erreur de connexion.')
    } else {
      setAuthError(null)
    }
    return { error: error ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setAuthError(null)
  }

  return (
    <AdminAuthContext.Provider
      value={{
        user,
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

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
