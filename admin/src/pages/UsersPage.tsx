import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@lib/supabase'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'

type AdminUserRow = {
  id: string
  username?: string | null
  created_at?: string | null
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
    } else {
      setUsers((data ?? []) as AdminUserRow[])
      setError(null)
    }
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
        Comptes disposant d&apos;un profil. Cliquez pour ouvrir profil, activité ou conversations.
      </p>
      {error && <div className="dashboard-message dashboard-message-error" role="alert">{error}</div>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pseudo</th>
              <th>Utilisateur (ID)</th>
              <th>Créé le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !error && (
              <tr><td colSpan={4}>Aucun profil pour l&apos;instant.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username ?? '—'}</td>
                <td><code>{u.id.slice(0, 8)}…</code></td>
                <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => navigate(`/users/${encodeURIComponent(u.id)}`)}
                  >
                    Fiche complète
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
