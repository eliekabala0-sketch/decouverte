import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@lib/supabase'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'

type AdminUserRow = {
  id: string
  phone?: string | null
  username?: string | null
  role?: string | null
  status?: string | null
  boost_reason?: string | null
  boosted_until?: string | null
  is_boosted?: boolean | null
  created_at?: string | null
  accessLabel?: string
  subscriptionLabel?: string
  creditsLabel?: string
}

type AccessRow = {
  user_id: string
  all_profiles_access?: boolean | null
  contact_quota?: number | null
  contact_quota_used?: number | null
  photo_quota?: number | null
  photo_quota_used?: number | null
}

type CreditRow = {
  user_id: string
  contact_credits?: number | null
  photo_credits?: number | null
  premium_credits?: number | null
}

type SubscriptionRow = {
  user_id: string
  plan_key?: string | null
  status?: string | null
  ends_at?: string | null
}

function formatAccess(row?: AccessRow): string {
  if (!row) return 'Aucun'
  if (row.all_profiles_access) return 'Premium'
  const contacts = `${row.contact_quota_used ?? 0}/${row.contact_quota ?? 0} contacts`
  const photos = `${row.photo_quota_used ?? 0}/${row.photo_quota ?? 0} photos`
  return `${contacts}, ${photos}`
}

function formatSubscription(row?: SubscriptionRow): string {
  if (!row) return 'Aucune'
  const suffix = row.ends_at ? ` jusqu'au ${new Date(row.ends_at).toLocaleDateString('fr-FR')}` : ''
  return `${row.plan_key ?? 'plan'} (${row.status ?? 'actif'})${suffix}`
}

function formatCredits(row?: CreditRow): string {
  if (!row) return '0'
  return String((row.contact_credits ?? 0) + (row.photo_credits ?? 0) + (row.premium_credits ?? 0))
}

export function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setUsers([])
      setLoading(false)
      return
    }

    const baseUsers = (data ?? []) as AdminUserRow[]
    const userIds = baseUsers.map((u) => u.id)
    const [accessRes, creditRes, subRes] = await Promise.all([
      userIds.length > 0 ? supabase.from('profile_access').select('*').in('user_id', userIds) : Promise.resolve({ data: [] }),
      userIds.length > 0 ? supabase.from('user_credit_balances').select('*').in('user_id', userIds) : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase
            .from('user_subscriptions')
            .select('*')
            .in('user_id', userIds)
            .in('status', ['active', 'granted'])
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    const accessByUser = new Map(((accessRes.data ?? []) as AccessRow[]).map((row) => [row.user_id, row]))
    const creditsByUser = new Map(((creditRes.data ?? []) as CreditRow[]).map((row) => [row.user_id, row]))
    const subsByUser = new Map<string, SubscriptionRow>()
    ;((subRes.data ?? []) as SubscriptionRow[]).forEach((row) => {
      if (!subsByUser.has(row.user_id)) subsByUser.set(row.user_id, row)
    })

    setUsers(
      baseUsers.map((u) => ({
        ...u,
        accessLabel: formatAccess(accessByUser.get(u.id)),
        subscriptionLabel: formatSubscription(subsByUser.get(u.id)),
        creditsLabel: formatCredits(creditsByUser.get(u.id)),
      }))
    )
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : 'Erreur de chargement des utilisateurs.')
      setLoading(false)
    })
  }, [load])

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <div>
      <PageHeader onRefresh={load} />
      <h1 className="page-title">Utilisateurs</h1>
      <p className="page-subtitle">
        Comptes disposant d&apos;un profil. Cliquez pour ouvrir profil, activite ou conversations.
      </p>
      {error && <div className="dashboard-message dashboard-message-error" role="alert">{error}</div>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pseudo</th>
              <th>Utilisateur (ID)</th>
              <th>Telephone</th>
              <th>Role</th>
              <th>Statut</th>
              <th>Acces</th>
              <th>Abonnement</th>
              <th>Credits</th>
              <th>Visibilite</th>
              <th>Cree le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !error && (
              <tr><td colSpan={11}>Aucun profil pour l&apos;instant.</td></tr>
            )}
            {users.map((u) => {
              const visibility = u.boosted_until
                ? `Boost jusqu'au ${new Date(u.boosted_until).toLocaleDateString('fr-FR')}`
                : u.is_boosted || u.boost_reason
                  ? `Boost ${u.boost_reason ?? 'actif'}`
                  : 'Standard'

              return (
                <tr key={u.id}>
                  <td>{u.username ?? '-'}</td>
                  <td><code>{u.id.slice(0, 8)}...</code></td>
                  <td>{u.phone ?? '-'}</td>
                  <td>{u.role ?? 'user'}</td>
                  <td>{u.status ?? '-'}</td>
                  <td>{u.accessLabel ?? 'Aucun'}</td>
                  <td>{u.subscriptionLabel ?? 'Aucune'}</td>
                  <td>{u.creditsLabel ?? '0'}</td>
                  <td>{visibility}</td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '-'}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => navigate(`/users/${encodeURIComponent(u.id)}`)}
                    >
                      Fiche complete
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => navigate(`/profiles?user_id=${encodeURIComponent(u.id)}`)}
                      style={{ marginLeft: 8 }}
                    >
                      Profil (liste)
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => navigate(`/conversations?user_id=${encodeURIComponent(u.id)}`)}
                      style={{ marginLeft: 8 }}
                    >
                      Conversations
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
