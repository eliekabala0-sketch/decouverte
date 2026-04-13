import { createContext, useContext, useEffect, useRef, useState } from 'react'
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
const ADMIN_DEBUG = import.meta.env.VITE_ADMIN_DEBUG === 'true'

const lastLogAt = new Map<string, number>()
function logOnce(level: 'info' | 'warn' | 'error', key: string, payload?: unknown, cooldownMs = 10_000) {
  const now = Date.now()
  const prev = lastLogAt.get(key) ?? 0
  if (now - prev < cooldownMs) return
  lastLogAt.set(key, now)
  if (level === 'error') console.error(key, payload)
  else if (ADMIN_DEBUG && level === 'warn') console.warn(key, payload)
  else if (ADMIN_DEBUG && level === 'info') console.info(key, payload)
}

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

/**
 * Lien stable avec Auth : public.profiles.id = auth.users.id (création profil app).
 * Ne pas utiliser profiles.user_id : colonne absente sur plusieurs déploiements réels.
 */
async function fetchProfileIsAdmin(userId: string): Promise<{ ok: boolean; error: Error | null }> {
  if (!userId) {
    return { ok: false, error: null }
  }
  const res = await withTimeout(
    Promise.resolve(supabase.from('profiles').select('role').eq('id', userId).maybeSingle()),
    PROFILE_ROLE_TIMEOUT_MS,
    'Lecture du rôle (profiles.id = auth.uid)'
  )
  if (res.error) {
    logOnce('error', '[admin-auth] profiles.select(role)', { authUserId: userId, error: res.error })
    return { ok: false, error: res.error instanceof Error ? res.error : new Error(String(res.error)) }
  }
  const ok = roleIsAdmin((res.data as { role?: unknown } | null)?.role)
  logOnce('info', `[admin-auth] role-check:${userId}:${ok ? 'ok' : 'ko'}`, {
    authUserId: userId,
    role: (res.data as { role?: unknown } | null)?.role ?? null,
    ok,
  }, 20000)
  return { ok, error: null }
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const validatedAdminUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const finishBootstrap = () => {
      if (!cancelled) setLoading(false)
    }

    const applyUserAndAdmin = async (current: User | null, source: string) => {
      if (!current?.id) {
        logOnce('warn', '[admin-auth] session absente', { source }, 15000)
        validatedAdminUserIdRef.current = null
        setIsAdmin(false)
        setAuthError(null)
        return
      }
      const { ok, error } = await fetchProfileIsAdmin(current.id)
      if (cancelled) return
      if (error) {
        const message = error instanceof Error ? error.message : String(error)
        const isTimeout = message.toLowerCase().includes('délai')
        const hasStableValidatedAdmin = validatedAdminUserIdRef.current === current.id
        if (hasStableValidatedAdmin) {
          logOnce('warn', '[admin-auth] revalidation admin échouée, session conservée', {
            source,
            authUserId: current.id,
            reason: isTimeout ? 'timeout réseau' : 'erreur requête',
            error: message,
          }, 15000)
          // On ne force pas logout/redirect pour un admin déjà validé.
          return
        }
        logOnce('error', '[admin-auth] revalidation admin échouée, accès refusé', {
          source,
          authUserId: current.id,
          reason: isTimeout ? 'timeout réseau' : 'erreur requête',
          error: message,
        }, 10000)
        validatedAdminUserIdRef.current = null
        setIsAdmin(false)
        setAuthError(
          isTimeout
            ? 'Impossible de vérifier le rôle admin (délai réseau). Réessayez dans un instant.'
            : 'Impossible de vérifier le rôle admin (réseau ou RLS). Réessayez dans un instant.'
        )
        return
      }
      setIsAdmin(ok)
      if (!ok) {
        validatedAdminUserIdRef.current = null
        logOnce('warn', '[admin-auth] rôle non admin', { source, authUserId: current.id }, 15000)
        setAuthError('Compte non autorisé pour le dashboard admin.')
      } else {
        validatedAdminUserIdRef.current = current.id
        setAuthError(null)
      }
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
          logOnce('error', '[admin-auth] getSession error', sessionRes.error)
        }
        const current = session?.user ?? null
        if (!cancelled) setUser(current)
        await applyUserAndAdmin(current, 'bootstrap')
      } catch (e) {
        logOnce('error', '[admin-auth] bootstrap', e)
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
        logOnce('warn', '[admin-auth] session absente (SIGNED_OUT)', undefined, 15000)
        validatedAdminUserIdRef.current = null
        setUser(null)
        setIsAdmin(false)
        setAuthError('Session expirée. Veuillez vous reconnecter.')
        return
      }
      const current = session?.user ?? null
      setUser(current)
      try {
        await applyUserAndAdmin(current, `onAuthStateChange:${event}`)
      } catch (e) {
        logOnce('error', '[admin-auth] onAuthStateChange', e)
        const stable = !!current?.id && validatedAdminUserIdRef.current === current.id
        if (!stable) {
          validatedAdminUserIdRef.current = null
          setIsAdmin(false)
          setAuthError(
            e instanceof Error
              ? `Erreur lors de la mise à jour de la session : ${e.message}`
              : 'Erreur lors de la mise à jour de la session.'
          )
        } else {
          logOnce('warn', '[admin-auth] erreur onAuthStateChange, session admin conservée', {
            event,
            authUserId: current.id,
          }, 15000)
        }
      }
    })

    return () => {
      cancelled = true
      validatedAdminUserIdRef.current = null
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
      if (gu.error) logOnce('error', '[admin-auth] getUser after signIn', gu.error)
      current = gu.data?.user ?? null
    } catch (e) {
      logOnce('error', '[admin-auth] getUser timeout', e)
      setAuthError(
        e instanceof Error
          ? `Connexion OK mais lecture du compte trop lente : ${e.message}`
          : 'Connexion OK mais lecture du compte impossible.'
      )
      await supabase.auth.signOut()
      setUser(null)
      validatedAdminUserIdRef.current = null
      setIsAdmin(false)
      return { error: e instanceof Error ? e : new Error('getUser failed') }
    }

    if (!current?.id) {
      setAuthError('Session invalide après connexion.')
      await supabase.auth.signOut()
      setUser(null)
      validatedAdminUserIdRef.current = null
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
      validatedAdminUserIdRef.current = null
      setIsAdmin(false)
      return { error: roleErr }
    }
    if (!ok) {
      setAuthError('Compte non autorisé pour le dashboard admin.')
      await supabase.auth.signOut()
      setUser(null)
      validatedAdminUserIdRef.current = null
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
    validatedAdminUserIdRef.current = null
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
