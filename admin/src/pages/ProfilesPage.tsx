import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminRequest } from '@lib/api'
import { GENDER_LABELS } from '@shared/constants'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'

const PAGE_SIZE = 100
type ManagedUser = { id: string; email: string; phone?: string | null; role: string; status: string; created_at: string; username?: string | null; gender?: string | null; city?: string | null; commune?: string | null; has_active_subscription?: number | boolean }
type Filters = { q: string; gender: string; status: string; role: string; city: string; subscription: string }
const EMPTY_FILTERS: Filters = { q: '', gender: '', status: '', role: '', city: '', subscription: '' }

export function ProfilesPage() {
  const { user } = useAdminAuth()
  const isSuperAdmin = user?.role === 'super_admin'
  const [profiles, setProfiles] = useState<ManagedUser[]>([])
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [bulkPassword, setBulkPassword] = useState('')
  const [showBulkPassword, setShowBulkPassword] = useState(false)
  const [includePrivileged, setIncludePrivileged] = useState(false)
  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) })
    Object.entries(appliedFilters).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()) })
    return params.toString()
  }, [appliedFilters, page])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminRequest<{ data: ManagedUser[]; total: number }>(`/v1/admin/users?${query}`)
      setProfiles(result.data)
      setTotal(result.total)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Chargement impossible.') }
    finally { setLoading(false) }
  }, [query])

  useEffect(() => { void load() }, [load])
  const applyFilters = () => { setPage(0); setAppliedFilters(filters) }
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); setPage(0) }

  const updateStatus = async (id: string, status: 'active' | 'suspended' | 'banned') => {
    const reason = status === 'active' ? 'Restauration admin' : window.prompt(`Raison de la ${status === 'banned' ? 'bannissement' : 'suspension'} ?`, 'Modération admin') ?? 'Modération admin'
    try {
      await adminRequest(`/v1/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) })
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
      setMessage('Statut mis à jour et historisé.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Action de modération impossible.') }
  }

  const resetPassword = async (id: string) => {
    const password = window.prompt('Nouveau mot de passe (10 caractères minimum) :')
    if (!password) return
    if (password.length < 10) { setMessage('Le mot de passe doit contenir au moins 10 caractères.'); return }
    try {
      await adminRequest(`/v1/admin/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) })
      setMessage('Mot de passe réinitialisé et action historisée.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Réinitialisation impossible.') }
  }

  const bulkReset = async () => {
    if (!isSuperAdmin) return
    if (bulkPassword.length < 10) { setMessage('Le mot de passe temporaire doit contenir au moins 10 caractères.'); return }
    if (!window.confirm(`Réinitialiser ${total} compte(s) correspondant aux filtres ? ${includePrivileged ? 'Les comptes administrateurs sont inclus.' : 'Les administrateurs sont exclus.'}`)) return
    const confirmation = window.prompt('Saisissez exactement REINITIALISER pour confirmer :')
    if (confirmation !== 'REINITIALISER') { setMessage('Réinitialisation annulée : confirmation incorrecte.'); return }
    try {
      const activeFilters = Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value))
      const result = await adminRequest<{ affected: number }>('/v1/admin/users/bulk-password-reset', { method: 'POST', body: JSON.stringify({ password: bulkPassword, confirmation, filters: { ...activeFilters, includePrivileged } }) })
      setBulkPassword('')
      setMessage(`${result.affected} mot(s) de passe réinitialisé(s). Action historisée.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Réinitialisation en masse impossible.') }
  }

  return <div>
    <PageHeader onRefresh={load} />
    <h1 className="page-title">Comptes et profils</h1>
    <p className="page-subtitle">Tous les comptes MySQL. Les filtres s’appliquent à la liste et aux actions en masse.</p>
    {message ? <div className="dashboard-message dashboard-message-success">{message}<button className="dashboard-message-dismiss" onClick={() => setMessage(null)}>×</button></div> : null}
    <section className="dashboard-section accounts-filters">
      <div className="filters-grid">
        <input aria-label="Recherche" placeholder="Nom, email ou téléphone" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select aria-label="Sexe" value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">Tous les sexes</option><option value="M">Homme</option><option value="F">Femme</option></select>
        <select aria-label="Statut" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Tous les statuts</option><option value="active">Actif</option><option value="suspended">Suspendu</option><option value="banned">Banni</option><option value="deleted">Supprimé</option></select>
        <select aria-label="Rôle" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}><option value="">Tous les rôles</option><option value="user">Utilisateur</option><option value="admin">Administrateur</option><option value="super_admin">Super administrateur</option></select>
        <select aria-label="Abonnement" value={filters.subscription} onChange={(e) => setFilters({ ...filters, subscription: e.target.value })}><option value="">Tous les abonnements</option><option value="active">Abonné actif</option><option value="inactive">Non abonné</option></select>
        <input aria-label="Ville" placeholder="Ville" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
      </div>
      <div className="form-actions"><button type="button" onClick={applyFilters}>Filtrer</button><button type="button" className="secondary" onClick={clearFilters}>Effacer</button><strong>{total} résultat(s)</strong></div>
    </section>
    {isSuperAdmin ? <section className="dashboard-section bulk-reset-panel">
      <h2>Réinitialisation en masse — super administrateur</h2>
      <p className="text-secondary">Le mot de passe temporaire sera appliqué aux comptes correspondant aux filtres actifs. L’action est confirmée deux fois et historisée.</p>
      <div className="bulk-reset-controls">
        <input type={showBulkPassword ? 'text' : 'password'} placeholder="Mot de passe temporaire (10 caractères min.)" value={bulkPassword} onChange={(e) => setBulkPassword(e.target.value)} />
        <button type="button" className="secondary" onClick={() => setShowBulkPassword((value) => !value)}>{showBulkPassword ? 'Masquer' : 'Afficher'}</button>
        <label><input type="checkbox" checked={includePrivileged} onChange={(e) => setIncludePrivileged(e.target.checked)} /> Inclure admin et super-admin</label>
        <button type="button" className="danger" onClick={bulkReset}>Réinitialiser les comptes filtrés</button>
      </div>
    </section> : null}
    {loading ? <div className="page-loading">Chargement...</div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Compte</th><th>Rôle</th><th>Sexe</th><th>Ville / Commune</th><th>Abonnement</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
      {profiles.length === 0 ? <tr><td colSpan={7}>Aucun compte.</td></tr> : profiles.map((p) => <tr key={p.id}><td>{p.username || p.email}<br /><small>{p.username ? p.email : 'Profil non créé'}{p.phone ? ` · ${p.phone}` : ''}</small></td><td>{p.role}</td><td>{p.gender ? (GENDER_LABELS[p.gender] ?? p.gender) : '—'}</td><td>{p.city ? `${p.city}${p.commune ? `, ${p.commune}` : ''}` : '—'}</td><td>{p.has_active_subscription ? 'Actif' : 'Non abonné'}</td><td>{p.status}</td><td><button type="button" className="secondary" onClick={() => resetPassword(p.id)}>Mot de passe</button>{p.status === 'active' ? <><button type="button" className="secondary" onClick={() => updateStatus(p.id, 'suspended')}>Suspendre</button><button type="button" className="secondary" onClick={() => updateStatus(p.id, 'banned')}>Bannir</button></> : <button type="button" onClick={() => updateStatus(p.id, 'active')}>Restaurer</button>}</td></tr>)}
    </tbody></table></div>}
    <div className="pagination"><button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Précédent</button><span>Page {page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Suivant</button></div>
  </div>
}
