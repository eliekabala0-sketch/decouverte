import { useCallback, useEffect, useState } from 'react'
import { adminRequest } from '@lib/api'
import { GENDER_LABELS } from '@shared/constants'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'

const PAGE_SIZE = 150
type ManagedUser = { id: string; email: string; phone?: string | null; role: string; status: string; created_at: string; username?: string | null; gender?: string | null; city?: string | null; commune?: string | null }

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await adminRequest<{ data: ManagedUser[] }>(`/v1/admin/users?limit=${PAGE_SIZE}`)
    setProfiles(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateStatus = async (id: string, status: 'active' | 'suspended' | 'banned') => {
    const reason =
      status === 'active'
        ? 'Restauration admin'
        : window.prompt(`Raison de la ${status === 'banned' ? 'bannissement' : 'suspension'} ?`, 'Moderation admin') ?? 'Moderation admin'
    try {
      await adminRequest(`/v1/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action moderation impossible.')
      return
    }
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
    setMessage('Statut mis a jour et historise.')
  }

  const resetPassword = async (id: string) => {
    const password = window.prompt('Nouveau mot de passe (10 caractères minimum) :')
    if (!password) return
    if (password.length < 10) { setMessage('Le mot de passe doit contenir au moins 10 caractères.'); return }
    try {
      await adminRequest(`/v1/admin/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) })
      setMessage('Mot de passe réinitialisé et action historisée.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Réinitialisation impossible.')
    }
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <div>
      <PageHeader onRefresh={load} />
      <h1 className="page-title">Comptes et profils</h1>
      <p className="page-subtitle">Tous les comptes MySQL, y compris les administrateurs et les comptes sans profil.</p>
      {message ? <div className="dashboard-message dashboard-message-success">{message}</div> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Compte</th>
              <th>Rôle</th>
              <th>Sexe</th>
              <th>Ville / Commune</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && (
              <tr><td colSpan={6}>Aucun compte.</td></tr>
            )}
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.username || p.email}<br /><small>{p.username ? p.email : 'Profil non créé'}</small></td>
                <td>{p.role}</td>
                <td>{p.gender ? (GENDER_LABELS[p.gender] ?? p.gender) : '—'}</td>
                <td>{p.city ? `${p.city}${p.commune ? `, ${p.commune}` : ''}` : '—'}</td>
                <td>{p.status}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => resetPassword(p.id)}>Mot de passe</button>
                  {p.status === 'active' && (
                    <>
                      <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={() => updateStatus(p.id, 'suspended')}>Suspendre</button>
                      <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={() => updateStatus(p.id, 'banned')}>Bannir</button>
                    </>
                  )}
                  {(p.status === 'suspended' || p.status === 'banned') && (
                    <button type="button" onClick={() => updateStatus(p.id, 'active')}>Restaurer</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
