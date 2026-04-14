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
type LogLevel = 'info' | 'warn' | 'error'
type AuthIssueKind = 'application_error' | 'network_timeout' | 'browser_extension_noise'

function serializeLogPayload(payload?: unknown): string {
  if (payload == null) return ''
  if (payload instanceof Error) {
    return JSON.stringify(
      {
        name: payload.name,
        message: payload.message,
        stack: payload.stack,
      },
      null,
      2
    )
  }
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

function classifyIssue(message: string): AuthIssueKind {
  const lower = message.toLowerCase()
  if (
    lower.includes('délai') ||
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('failed to fetch')
  ) {
    return 'network_timeout'
  }
  if (
    lower.includes('listener indicated an asynchronous response') ||
    lower.includes('a listener indicated an asynchronous response')
  ) {
    return 'browser_extension_noise'
  }
  return 'application_error'
}

function logOnce(level: LogLevel, key: string, payload?: unknown, cooldownMs = 10_000) {
  const now = Date.now()
  const prev = lastLogAt.get(key) ?? 0
  if (now - prev < cooldownMs) return
  lastLogAt.set(key, now)
  const body = serializeLogPayload(payload)
  const line = body ? `${key} ${body}` : key
  if (level === 'error') console.error(line)
  else if (ADMIN_DEBUG && level === 'warn') console.warn(line)
  else if (ADMIN_DEBUG && level === 'info') console.info(line)
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
  try {
    const res = await withTimeout(
      Promise.resolve(supabase.from('profiles').select('role').eq('id', userId).maybeSingle()),
      PROFILE_ROLE_TIMEOUT_MS,
      'Lecture du rôle (profiles.id = auth.uid)'
    )
    if (res.error) {
      return { ok: false, error: res.error instanceof Error ? res.error : new Error(String(res.error)) }
    }
    const ok = roleIsAdmin((res.data as { role?: unknown } | null)?.role)
    logOnce('info', `[admin-auth] role-check:${userId}:${ok ? 'ok' : 'ko'}`, {
      authUserId: userId,
      role: (res.data as { role?: unknown } | null)?.role ?? null,
      ok,
    }, 20000)
    return { ok, error: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) }
  }
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
        const issueKind = classifyIssue(message)
        const isTimeout = issueKind === 'network_timeout'
        const hasStableValidatedAdmin = validatedAdminUserIdRef.current === current.id
        const logPayload = {
          source,
          authUserId: current.id,
          issueKind,
          blocking: !hasStableValidatedAdmin,
          error: {
            name: error.name,
            message: error.message,
          },
        }
        if (hasStableValidatedAdmin) {
          logOnce('warn', '[admin-auth] revalidation non bloquante (session conservée)', logPayload, 15000)
          // On ne force pas logout/redirect pour un admin déjà validé.
          return
        }
        const level: LogLevel = issueKind === 'application_error' ? 'error' : 'warn'
        logOnce(level, '[admin-auth] revalidation admin bloquée (accès temporairement refusé)', logPayload, 10000)
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
        const message = e instanceof Error ? e.message : String(e)
        const issueKind = classifyIssue(message)
        const level: LogLevel = issueKind === 'application_error' ? 'error' : 'warn'
        logOnce(level, '[admin-auth] bootstrap', {
          issueKind,
          blocking: true,
          error: e instanceof Error ? { name: e.name, message: e.message } : { message: String(e) },
        })
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
      if (
        event === 'TOKEN_REFRESHED' &&
        !!current?.id &&
        validatedAdminUserIdRef.current === current.id
      ) {
        // Évite de revalider le rôle à chaque refresh token (source de timeouts/bruit console).
        return
      }
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
