import { createContext, useContext, useEffect, useState } from 'react'
import { adminLogin, adminRequest, clearAdminSession, getAdminSession, type AdminUser } from '@lib/api'

export type AdminAuthContextType = {
  user: AdminUser | null; isAdmin: boolean; loading: boolean; isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>; authError: string | null
}
const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  useEffect(() => {
    void (async () => {
      const session = getAdminSession()
      if (!session) { setLoading(false); return }
      try { const result = await adminRequest<{ user: AdminUser }>('/v1/admin/me'); setUser(result.user) }
      catch (error) { clearAdminSession(); setAuthError(error instanceof Error ? error.message : 'Session invalide.') }
      finally { setLoading(false) }
    })()
  }, [])
  const signIn = async (email: string, password: string) => {
    try { const session = await adminLogin(email, password); setUser(session.user); setAuthError(null); return { error: null } }
    catch (error) { const next = error instanceof Error ? error : new Error('Connexion impossible.'); setAuthError(next.message); return { error: next } }
  }
  const signOut = async () => { clearAdminSession(); setUser(null); setAuthError(null) }
  const isAdmin = !!user && ['admin', 'super_admin'].includes(user.role)
  return <AdminAuthContext.Provider value={{ user, isAdmin, loading, isAuthenticated: !!user, signIn, signOut, authError }}>{children}</AdminAuthContext.Provider>
}
export function useAdminAuth() { const ctx = useContext(AdminAuthContext); if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider'); return ctx }
