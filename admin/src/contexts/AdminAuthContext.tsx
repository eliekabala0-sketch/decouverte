import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import type { User } from '@supabase/supabase-js'
import { roleIsAdmin } from '@shared/profileRole'

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

/** Évite un spinner infini si l’API auth ou PostgREST ne répond pas. */
const SESSION_TIMEOUT_MS = 20_000
const PROFILE_ROLE_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      reject(new Error(`${label} — délai ${ms} ms`))
    }, ms)
    promise.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      }
    )
  })
}

async function fetchProfileIsAdmin(userId: string): Promise<{ ok: boolean; error: Error | null }> {
  if (!userId) {
    return { ok: false, error: null }
  }
  const byId = await withTimeout(
    Promise.resolve(supabase.from('profiles').select('role,id,user_id').eq('id', userId).maybeSingle()),
    PROFILE_ROLE_TIMEOUT_MS,
    'Lecture du rôle (profiles par id)'
  )
  if (byId.error) {
    console.error('[admin-auth] profiles.select(role) id=', userId, byId.error)
    return { ok: false, error: byId.error instanceof Error ? byId.error : new Error(String(byId.error)) }
  }
  let row = byId.data as { role?: unknown; id?: string; user_id?: string } | null
  let match: 'id' | 'user_id' | null = row ? 'id' : null

  if (!row) {
    const byUserId = await withTimeout(
      Promise.resolve(supabase.from('profiles').select('role,id,user_id').eq('user_id', userId).maybeSingle()),
      PROFILE_ROLE_TIMEOUT_MS,
      'Lecture du rôle (profiles par user_id)'
    )
    if (byUserId.error) {
      const msg = String((byUserId.error as { message?: string }).message || '').toLowerCase()
      if (msg.includes('user_id') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
        console.info('[admin-auth] colonne profiles.user_id absente, seul id=auth.uid() est utilisé')
      } else {
        console.error('[admin-auth] profiles.select(role) user_id=', userId, byUserId.error)
        return {
          ok: false,
          error: byUserId.error instanceof Error ? byUserId.error : new Error(String(byUserId.error)),
        }
      }
    } else {
      row = byUserId.data as { role?: unknown } | null
      match = row ? 'user_id' : null
    }
  }

  const ok = roleIsAdmin(row?.role)
  console.info('[admin-auth] rôle admin', { authUserId: userId, match, role: row?.role ?? null, ok })
  return { ok, error: null }
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const finishBootstrap = () => {
      if (!cancelled) setLoading(false)
    }

    const applyUserAndAdmin = async (current: User | null) => {
      if (!current?.id) {
        setIsAdmin(false)
        setAuthError(null)
        return
      }
      const { ok, error } = await fetchProfileIsAdmin(current.id)
      if (cancelled) return
      if (error) {
        setIsAdmin(false)
        setAuthError(
          'Impossible de vérifier le rôle admin (réseau, RLS ou délai dépassé). Réessayez dans un instant.'
        )
        return
      }
      setIsAdmin(ok)
      if (!ok) setAuthError('Compte non autorisé pour le dashboard admin.')
      else setAuthError(null)
    }

    const runBootstrap = async () => {
      try {
        const sessionRes = await withTimeout(
          supabase.auth.getSession(),
          SESSION_TIMEOUT_MS,
          'getSession()'
        )
        const session = sessionRes.data?.session ?? null
        if (sessionRes.error) {
          console.error('[admin-auth] getSession error', sessionRes.error)
        }
        const current = session?.user ?? null
        if (!cancelled) setUser(current)
        await applyUserAndAdmin(current)
      } catch (e) {
        console.error('[admin-auth] bootstrap', e)
        if (!cancelled) {
          setUser(null)
          setIsAdmin(false)
          setAuthError(
            e instanceof Error
              ? `Échec du chargement de la session : ${e.message}`
              : 'Échec du chargement de la session.'
          )
        }
      } finally {
        finishBootstrap()
      }
    }

    void runBootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsAdmin(false)
        setAuthError('Session expirée. Veuillez vous reconnecter.')
        return
      }
      const current = session?.user ?? null
      setUser(current)
      try {
        await applyUserAndAdmin(current)
      } catch (e) {
        console.error('[admin-auth] onAuthStateChange', e)
        setIsAdmin(false)
        setAuthError(
          e instanceof Error
            ? `Erreur lors de la mise à jour de la session : ${e.message}`
            : 'Erreur lors de la mise à jour de la session.'
        )
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message || 'Erreur de connexion.')
      return { error: error as Error }
    }
    let current: User | null = null
    try {
      const gu = await withTimeout(supabase.auth.getUser(), SESSION_TIMEOUT_MS, 'getUser()')
      if (gu.error) console.error('[admin-auth] getUser after signIn', gu.error)
      current = gu.data?.user ?? null
    } catch (e) {
      console.error('[admin-auth] getUser timeout', e)
      setAuthError(
        e instanceof Error
          ? `Connexion OK mais lecture du compte trop lente : ${e.message}`
          : 'Connexion OK mais lecture du compte impossible.'
      )
      await supabase.auth.signOut()
      setUser(null)
      setIsAdmin(false)
      return { error: e instanceof Error ? e : new Error('getUser failed') }
    }

    if (!current?.id) {
      setAuthError('Session invalide après connexion.')
      await supabase.auth.signOut()
      setUser(null)
      setIsAdmin(false)
      return { error: new Error('Session invalide après connexion.') }
    }

    const { ok, error: roleErr } = await fetchProfileIsAdmin(current.id)
    if (roleErr) {
      setAuthError(
        'Impossible de vérifier le rôle admin (réseau, RLS ou délai). Réessayez dans un instant.'
      )
      await supabase.auth.signOut()
      setUser(null)
      setIsAdmin(false)
      return { error: roleErr }
    }
    if (!ok) {
      setAuthError('Compte non autorisé pour le dashboard admin.')
      await supabase.auth.signOut()
      setUser(null)
      setIsAdmin(false)
      return { error: new Error('Compte non autorisé pour le dashboard admin.') }
    }
    setUser(current)
    setIsAdmin(true)
    setAuthError(null)
    return { error: null }
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
