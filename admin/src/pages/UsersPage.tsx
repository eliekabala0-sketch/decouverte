import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@lib/supabase'
import { PageHeader } from '../components/PageHeader'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import './DashboardPage.css'

const PAGE_SIZE = 25
const PROFILE_SELECT_BASE =
  'id,phone,username,role,status,gender,city,commune,age,is_verified,mode_libre_active,mode_serieux_active,boost_reason,boosted_until,is_boosted,created_at,photo'
const PROFILE_SELECT_WITH_IP = `${PROFILE_SELECT_BASE},ip_city,ip_region,ip_country,ip_city_mismatch`

type AdminUserRow = {
  id: string
  phone?: string | null
  username?: string | null
  role?: string | null
  status?: string | null
  gender?: string | null
  city?: string | null
  commune?: string | null
  age?: number | null
  is_verified?: boolean | null
  mode_libre_active?: boolean | null
  mode_serieux_active?: boolean | null
  boost_reason?: string | null
  boosted_until?: string | null
  is_boosted?: boolean | null
  created_at?: string | null
  photo?: string | null
  ip_city?: string | null
  ip_region?: string | null
  ip_country?: string | null
  ip_city_mismatch?: boolean | null
  accessLabel?: string
  hasPack?: boolean
  detectedTest?: boolean
}

type AccessRow = {
  user_id: string
  all_profiles_access?: boolean | null
  contact_quota?: number | null
  contact_quota_used?: number | null
  photo_quota?: number | null
  photo_quota_used?: number | null
}

type Filters = {
  search: string
  phone: string
  gender: string
  city: string
  ipCity: string
  commune: string
  minAge: string
  maxAge: string
  status: string
  verified: string
  mode: string
  boost: string
  pack: string
  date: string
  photo: string
  testOnly: boolean
  includeDeleted: boolean
}

const initialFilters: Filters = {
  search: '',
  phone: '',
  gender: '',
  city: '',
  ipCity: '',
  commune: '',
  minAge: '',
  maxAge: '',
  status: 'active',
  verified: '',
  mode: '',
  boost: '',
  pack: '',
  date: '',
  photo: '',
  testOnly: false,
  includeDeleted: false,
}

function genderLabel(value?: string | null) {
  const normalized = String(value ?? '').toLowerCase()
  if (['f', 'femme', 'female'].includes(normalized)) return 'Femme'
  if (['m', 'homme', 'male', 'h'].includes(normalized)) return 'Homme'
  return 'Autre'
}

function isBoosted(row: AdminUserRow) {
  return !!row.is_boosted || !!row.boost_reason || (!!row.boosted_until && new Date(row.boosted_until) > new Date())
}

function formatAccess(row?: AccessRow): { label: string; hasPack: boolean } {
  if (!row) return { label: 'Sans pack', hasPack: false }
  const contactsLeft = (row.contact_quota ?? 0) - (row.contact_quota_used ?? 0)
  const photosLeft = (row.photo_quota ?? 0) - (row.photo_quota_used ?? 0)
  const hasPack = !!row.all_profiles_access || contactsLeft > 0 || photosLeft > 0
  if (row.all_profiles_access) return { label: 'Premium', hasPack: true }
  return { label: `${Math.max(contactsLeft, 0)} contacts, ${Math.max(photosLeft, 0)} photos`, hasPack }
}

function isDetectedTestAccount(row: AdminUserRow) {
  const username = String(row.username ?? '').toLowerCase()
  const phone = String(row.phone ?? '').toLowerCase()
  return (
    username.includes('test') ||
    username.includes('smoke') ||
    username.startsWith('p1_') ||
    username.startsWith('p2_') ||
    username.includes('admin_action') ||
    phone.includes('test')
  )
}

export function UsersPage() {
  const navigate = useNavigate()
  const { user: adminUser } = useAdminAuth()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adminRole, setAdminRole] = useState<string | null>(null)
  const [ipColumnsAvailable, setIpColumnsAvailable] = useState(true)
  const isSuperAdmin = adminRole === 'super_admin' || adminRole === 'superadmin'

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  const load = useCallback(async () => {
    setLoading(true)
    setError(ipColumnsAvailable ? null : 'Colonnes IP approx. indisponibles: appliquez la migration 037 pour activer ces filtres.')
    if (!ipColumnsAvailable && filters.ipCity) {
      setUsers([])
      setTotal(0)
      setError('Filtre Ville IP indisponible: migration 037 non appliquee.')
      setLoading(false)
      return
    }
    const needsClientFilteredPage = !!filters.boost || !!filters.pack
    let query = supabase
      .from('profiles')
      .select(ipColumnsAvailable ? PROFILE_SELECT_WITH_IP : PROFILE_SELECT_BASE, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (!filters.includeDeleted) query = query.neq('status', 'deleted')
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.search) query = query.ilike('username', `%${filters.search}%`)
    if (filters.phone) query = query.ilike('phone', `%${filters.phone}%`)
    if (filters.gender) query = query.eq('gender', filters.gender)
    if (filters.city) query = query.ilike('city', filters.city)
    if (filters.ipCity && ipColumnsAvailable) query = query.ilike('ip_city', filters.ipCity)
    if (filters.commune) query = query.ilike('commune', filters.commune)
    if (filters.minAge) query = query.gte('age', Number(filters.minAge))
    if (filters.maxAge) query = query.lte('age', Number(filters.maxAge))
    if (filters.verified === 'yes') query = query.eq('is_verified', true)
    if (filters.verified === 'no') query = query.eq('is_verified', false)
    if (filters.mode === 'libre') query = query.eq('mode_libre_active', true)
    if (filters.mode === 'serieux') query = query.eq('mode_serieux_active', true)
    if (filters.date === 'recent') query = query.gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    if (filters.date === 'old') query = query.lt('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
    if (filters.photo === 'with') query = query.not('photo', 'is', null)
    if (filters.photo === 'without') query = query.is('photo', null)
    if (filters.testOnly) query = query.or('username.ilike.%test%,username.ilike.%smoke%,username.ilike.p1_%,username.ilike.p2_%,username.ilike.%admin_action%,phone.ilike.%test%')
    query = needsClientFilteredPage
      ? query.range(0, 999)
      : query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    const { data, error: loadError, count } = await query
    if (loadError) {
      if (ipColumnsAvailable && /ip_(city|region|country|city_mismatch)/i.test(loadError.message)) {
        setIpColumnsAvailable(false)
        setUsers([])
        setTotal(0)
        setError('Colonnes IP approx. indisponibles: migration 037 non appliquee. Rechargement sans IP.')
        setLoading(false)
        return
      }
      setUsers([])
      setTotal(0)
      setError(loadError.message)
      setLoading(false)
      return
    }

    let baseUsers = ((data ?? []) as unknown) as AdminUserRow[]
    if (filters.boost === 'boosted') baseUsers = baseUsers.filter(isBoosted)
    if (filters.boost === 'not_boosted') baseUsers = baseUsers.filter((u) => !isBoosted(u))

    const ids = baseUsers.map((u) => u.id)
    const accessRes = ids.length
      ? await supabase.from('profile_access').select('user_id,all_profiles_access,contact_quota,contact_quota_used,photo_quota,photo_quota_used').in('user_id', ids)
      : { data: [] as AccessRow[] }
    const accessByUser = new Map(((accessRes.data ?? []) as AccessRow[]).map((row) => [row.user_id, formatAccess(row)]))
    let enriched = baseUsers.map((u) => {
      const access = accessByUser.get(u.id) ?? { label: 'Sans pack', hasPack: false }
      return { ...u, accessLabel: access.label, hasPack: access.hasPack, detectedTest: isDetectedTestAccount(u) }
    })
    if (filters.pack === 'active') enriched = enriched.filter((u) => u.hasPack)
    if (filters.pack === 'none') enriched = enriched.filter((u) => !u.hasPack)

    if (needsClientFilteredPage) {
      setUsers(enriched.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE))
      setTotal(enriched.length)
    } else {
      setUsers(enriched)
      setTotal(count ?? enriched.length)
    }
    setLoading(false)
  }, [filters, ipColumnsAvailable, page])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!adminUser?.id) return
    void supabase
      .from('profiles')
      .select('role')
      .eq('id', adminUser.id)
      .maybeSingle()
      .then(({ data }) => setAdminRole((data as { role?: string | null } | null)?.role ?? null))
  }, [adminUser?.id])

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setPage(0)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const setStatus = async (id: string, status: 'active' | 'suspended' | 'banned') => {
    const reason = window.prompt(`Raison ${status} ?`, 'Action admin') ?? 'Action admin'
    const { error: actionError } = await supabase.rpc('admin_set_profile_status', { p_profile_id: id, p_status: status, p_reason: reason })
    if (actionError) setError(actionError.message)
    await load()
  }

  const softDelete = async (row: AdminUserRow) => {
    if (!isSuperAdmin) return
    if (!window.confirm('Cette action est definitive cote utilisateur. Le compte test sera archive et masque.')) return
    const typed = window.prompt('Tapez SUPPRIMER pour confirmer.')
    if (typed !== 'SUPPRIMER') return
    const reason = window.prompt('Raison de suppression/archivage ?', 'suppression compte test') ?? 'suppression compte test'
    const { error: actionError } = await supabase.rpc('admin_soft_delete_user', { p_profile_id: row.id, p_confirmation: typed, p_reason: reason })
    if (actionError) setError(actionError.message)
    await load()
  }

  const cleanupVisibleTests = async () => {
    if (!isSuperAdmin) return
    const candidates = users.filter((row) => row.status !== 'deleted' && isDetectedTestAccount(row))
    if (candidates.length === 0) {
      setError('Aucun compte test detecte dans la page courante.')
      return
    }
    const preview = candidates.slice(0, 20).map((u) => `${u.username ?? '-'} / ${u.phone ?? '-'} / ${u.id}`).join('\n')
    if (!window.confirm(`Comptes test a archiver sur cette page: ${candidates.length}\n\n${preview}${candidates.length > 20 ? '\n...' : ''}\n\nContinuer ?`)) return
    const typed = window.prompt('Tapez SUPPRIMER TESTS pour confirmer le nettoyage des comptes test visibles.')
    if (typed !== 'SUPPRIMER TESTS') return
    setLoading(true)
    setError(null)
    let deleted = 0
    const failures: string[] = []
    for (const row of candidates) {
      const { error: actionError } = await supabase.rpc('admin_soft_delete_user', {
        p_profile_id: row.id,
        p_confirmation: 'SUPPRIMER',
        p_reason: 'suppression comptes test batch',
      })
      if (actionError) failures.push(`${row.username ?? row.id}: ${actionError.message}`)
      else deleted += 1
    }
    if (failures.length) setError(`${deleted} compte(s) test archive(s). Echecs: ${failures.slice(0, 3).join(' | ')}`)
    else setError(`${deleted} compte(s) test archive(s) et exclus du feed.`)
    await load()
  }

  return (
    <div>
      <PageHeader onRefresh={load} />
      <h1 className="page-title">Utilisateurs</h1>
      <p className="page-subtitle">{total} profils. Filtres appliques cote requete avec pagination.</p>
      {error && <div className="dashboard-message dashboard-message-error" role="alert">{error}</div>}

      <section className="dashboard-section">
        <div className="form-grid">
          <div className="form-group"><label>Nom / pseudo</label><input value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} /></div>
          <div className="form-group"><label>Telephone</label><input value={filters.phone} onChange={(e) => updateFilter('phone', e.target.value)} /></div>
          <div className="form-group"><label>Sexe</label><select value={filters.gender} onChange={(e) => updateFilter('gender', e.target.value)}><option value="">Tous</option><option value="M">Homme</option><option value="F">Femme</option></select></div>
          <div className="form-group"><label>Ville</label><input value={filters.city} onChange={(e) => updateFilter('city', e.target.value)} /></div>
          <div className="form-group"><label>Ville IP approx.</label><input value={filters.ipCity} onChange={(e) => updateFilter('ipCity', e.target.value)} /></div>
          <div className="form-group"><label>Commune</label><input value={filters.commune} onChange={(e) => updateFilter('commune', e.target.value)} /></div>
          <div className="form-group"><label>Age min</label><input type="number" value={filters.minAge} onChange={(e) => updateFilter('minAge', e.target.value)} /></div>
          <div className="form-group"><label>Age max</label><input type="number" value={filters.maxAge} onChange={(e) => updateFilter('maxAge', e.target.value)} /></div>
          <div className="form-group"><label>Statut</label><select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}><option value="">Tous</option><option value="active">Actif</option><option value="suspended">Suspendu</option><option value="banned">Banni</option><option value="deleted">Supprime/archive</option></select></div>
          <div className="form-group"><label>Verification</label><select value={filters.verified} onChange={(e) => updateFilter('verified', e.target.value)}><option value="">Tous</option><option value="yes">Verifie</option><option value="no">Non verifie</option></select></div>
          <div className="form-group"><label>Mode</label><select value={filters.mode} onChange={(e) => updateFilter('mode', e.target.value)}><option value="">Tous</option><option value="libre">Libre actif</option><option value="serieux">Serieux actif</option></select></div>
          <div className="form-group"><label>Boost</label><select value={filters.boost} onChange={(e) => updateFilter('boost', e.target.value)}><option value="">Tous</option><option value="boosted">Booste</option><option value="not_boosted">Non booste</option></select></div>
          <div className="form-group"><label>Pack</label><select value={filters.pack} onChange={(e) => updateFilter('pack', e.target.value)}><option value="">Tous</option><option value="active">Pack actif</option><option value="none">Sans pack</option></select></div>
          <div className="form-group"><label>Inscription</label><select value={filters.date} onChange={(e) => updateFilter('date', e.target.value)}><option value="">Toutes</option><option value="recent">Recents</option><option value="old">Anciens</option></select></div>
          <div className="form-group"><label>Photo</label><select value={filters.photo} onChange={(e) => updateFilter('photo', e.target.value)}><option value="">Tous</option><option value="with">Avec photo</option><option value="without">Sans photo</option></select></div>
          <label className="inline-check"><input type="checkbox" checked={filters.testOnly} onChange={(e) => updateFilter('testOnly', e.target.checked)} /> Comptes test</label>
          <label className="inline-check"><input type="checkbox" checked={filters.includeDeleted} onChange={(e) => updateFilter('includeDeleted', e.target.checked)} /> Afficher archives</label>
        </div>
        <div className="form-actions">
          <button type="button" onClick={() => void load()}>Actualiser</button>
          <button type="button" className="secondary" onClick={() => { setFilters(initialFilters); setPage(0) }}>Reinitialiser filtres</button>
          {isSuperAdmin && filters.testOnly ? (
            <button type="button" className="danger" onClick={() => void cleanupVisibleTests()}>
              Nettoyer les comptes de test visibles
            </button>
          ) : null}
        </div>
      </section>

      {loading ? <div className="page-loading">Chargement...</div> : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pseudo</th><th>Telephone</th><th>Sexe</th><th>Ville</th><th>IP approx.</th><th>Statut</th><th>Pack</th><th>Boost</th><th>Cree le</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? <tr><td colSpan={10}>Aucun profil.</td></tr> : users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username ?? '-'}<br /><code>{u.id.slice(0, 8)}...</code>{u.detectedTest ? <><br /><span className="badge">Test</span></> : null}</td>
                    <td>{u.phone ?? '-'}</td>
                    <td><span className="badge">{genderLabel(u.gender)}</span></td>
                    <td>{u.city ?? '-'}{u.commune ? ` / ${u.commune}` : ''}<br />{u.age ?? '-'} ans</td>
                    <td>{ipColumnsAvailable ? (u.ip_city ?? '-') : 'N/D'}{u.ip_region ? ` / ${u.ip_region}` : ''}<br />{ipColumnsAvailable ? (u.ip_city_mismatch ? <span className="badge badge-banned">Ecart</span> : <span className="badge">OK</span>) : <span className="badge">Migration 037</span>}</td>
                    <td><span className={`badge badge-${u.status ?? 'active'}`}>{u.status ?? '-'}</span></td>
                    <td><span className="badge">{u.accessLabel ?? 'Sans pack'}</span></td>
                    <td><span className="badge">{isBoosted(u) ? 'Booste' : 'Standard'}</span></td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '-'}</td>
                    <td className="actions-cell">
                      <button type="button" className="secondary" onClick={() => navigate(`/users/${encodeURIComponent(u.id)}`)}>Voir</button>
                      {u.status !== 'suspended' && <button type="button" className="secondary" onClick={() => void setStatus(u.id, 'suspended')}>Suspendre</button>}
                      {u.status !== 'banned' && <button type="button" className="secondary" onClick={() => void setStatus(u.id, 'banned')}>Bannir</button>}
                      {u.status !== 'active' && <button type="button" className="secondary" onClick={() => void setStatus(u.id, 'active')}>Restaurer</button>}
                      {isSuperAdmin && u.status !== 'deleted' && <button type="button" className="danger" onClick={() => void softDelete(u)}>Supprimer test</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button type="button" className="secondary" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Page precedente</button>
            <span>Page {page + 1} / {totalPages}</span>
            <button type="button" className="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Page suivante</button>
          </div>
        </>
      )}
    </div>
  )
}
