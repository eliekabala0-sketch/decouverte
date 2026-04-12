import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@lib/supabase'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import { PageHeader } from '../components/PageHeader'
import type { Profile, ProfileAccess } from '@shared/types'
import { GENDER_LABELS } from '@shared/constants'
import './DashboardPage.css'

type PhotoRow = { id: string; photo_url: string; is_primary: boolean }

const fnSetPassword = () => {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? ''
  return `${base}/functions/v1/admin-set-password`
}

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user: adminUser } = useAdminAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [access, setAccess] = useState<ProfileAccess | null>(null)
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [payments, setPayments] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [pw, setPw] = useState('')
  const [dm, setDm] = useState('')

  const [accForm, setAccForm] = useState({
    contact_quota: 0,
    contact_quota_used: 0,
    photo_quota: 0,
    photo_quota_used: 0,
    all_profiles_access: false,
  })

  const load = useCallback(async () => {
    if (!userId) return
    setMsg(null)
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((p as Profile | null) ?? null)

    const { data: a } = await supabase.from('profile_access').select('*').eq('user_id', userId).maybeSingle()
    const acc = (a as ProfileAccess | null) ?? null
    setAccess(acc)
    if (acc) {
      setAccForm({
        contact_quota: acc.contact_quota ?? 0,
        contact_quota_used: acc.contact_quota_used ?? 0,
        photo_quota: acc.photo_quota ?? 0,
        photo_quota_used: acc.photo_quota_used ?? 0,
        all_profiles_access: !!acc.all_profiles_access,
      })
    }

    const { data: ph } = await supabase.from('profile_photos').select('id,photo_url,is_primary').eq('user_id', userId)
    setPhotos((ph ?? []) as PhotoRow[])

    const { data: pay } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25)
    setPayments((pay ?? []) as Record<string, unknown>[])

    setLoading(false)
  }, [userId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const saveAccess = async () => {
    if (!userId) return
    setMsg(null)
    const { error } = await supabase.from('profile_access').upsert(
      {
        user_id: userId,
        contact_quota: accForm.contact_quota,
        contact_quota_used: accForm.contact_quota_used,
        photo_quota: accForm.photo_quota,
        photo_quota_used: accForm.photo_quota_used,
        all_profiles_access: accForm.all_profiles_access,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (error) setMsg({ type: 'error', text: error.message })
    else setMsg({ type: 'success', text: 'Accès / quotas enregistrés.' })
    void load()
  }

  const saveProfilePatch = async (patch: Partial<Profile>) => {
    if (!userId) return
    setMsg(null)
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) setMsg({ type: 'error', text: error.message })
    else setMsg({ type: 'success', text: 'Profil mis à jour.' })
    void load()
  }

  const setPassword = async () => {
    if (!userId || !pw.trim()) return
    setMsg(null)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setMsg({ type: 'error', text: 'Session admin absente.' })
      return
    }
    try {
      const res = await fetch(fnSetPassword(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, password: pw }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ type: 'error', text: (j as { error?: string }).error ?? res.statusText })
        return
      }
      setPw('')
      setMsg({ type: 'success', text: 'Mot de passe défini (Auth Supabase).' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Appel fonction échoué' })
    }
  }

  const sendDirectMessage = async () => {
    if (!userId || !adminUser?.id || !dm.trim()) return
    setMsg(null)
    try {
      const { data: existing } = await supabase.from('conversations').select('id,participant_ids').contains('participant_ids', [adminUser.id])
      const convs = (existing ?? []) as { id: string; participant_ids: string[] }[]
      let convId: string | null = null
      for (const c of convs) {
        const ids = c.participant_ids ?? []
        if (ids.includes(userId) && ids.length === 2) {
          convId = c.id
          break
        }
      }
      if (!convId) {
        const { data: created, error: cErr } = await supabase
          .from('conversations')
          .insert({ participant_ids: [adminUser.id, userId] })
          .select('id')
          .single()
        if (cErr) throw new Error(cErr.message)
        convId = (created as { id: string }).id
      }
      const prefix = '« Équipe Découverte »\n\n'
      const { error: mErr } = await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: adminUser.id,
        content: prefix + dm.trim(),
      })
      if (mErr) throw new Error(mErr.message)
      setDm('')
      setMsg({ type: 'success', text: 'Message envoyé (visible dans Messages de l’utilisateur).' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Échec envoi' })
    }
  }

  if (!userId) {
    return (
      <div>
        <PageHeader />
        <p>Utilisateur manquant.</p>
      </div>
    )
  }

  if (loading) return <div className="page-loading">Chargement…</div>

  if (!profile) {
    return (
      <div>
        <PageHeader onRefresh={load} />
        <p>Profil introuvable pour cet ID.</p>
        <button type="button" className="secondary" onClick={() => navigate('/users')}>
          Liste utilisateurs
        </button>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={profile.username} onRefresh={load} />
      <h1 className="page-title">Fiche utilisateur</h1>
      <p className="page-subtitle">
        <code>{userId}</code> — {GENDER_LABELS[profile.gender] ?? profile.gender} — {profile.city}
        {profile.commune ? ` / ${profile.commune}` : ''}
      </p>
      {msg ? (
        <div className={`dashboard-message ${msg.type === 'error' ? 'dashboard-message-error' : 'dashboard-message-success'}`} role="alert">
          {msg.text}
        </div>
      ) : null}

      <section className="dashboard-section">
        <h2>Profil</h2>
        <p>Statut : <strong>{profile.status}</strong> — vérifié : {profile.is_verified ? 'oui' : 'non'} — rôle : {profile.role ?? '—'}</p>
        {profile.photo ? (
          <p>
            Photo principale :{' '}
            <a href={profile.photo} target="_blank" rel="noreferrer">
              ouvrir
            </a>
          </p>
        ) : null}
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="form-group">
            <label>Boost (boost_reason)</label>
            <input
              value={profile.boost_reason ?? ''}
              onChange={(e) => setProfile({ ...profile, boost_reason: e.target.value || null })}
            />
          </div>
          <div className="form-group">
            <label>Mode libre actif</label>
            <select
              value={String(profile.mode_libre_active ?? true)}
              onChange={(e) => setProfile({ ...profile, mode_libre_active: e.target.value === 'true' })}
            >
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </div>
          <div className="form-group">
            <label>Mode sérieux actif</label>
            <select
              value={String(profile.mode_serieux_active ?? true)}
              onChange={(e) => setProfile({ ...profile, mode_serieux_active: e.target.value === 'true' })}
            >
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </div>
          <div className="form-actions">
            <button
              type="button"
              onClick={() =>
                saveProfilePatch({
                  boost_reason: profile.boost_reason,
                  mode_libre_active: profile.mode_libre_active,
                  mode_serieux_active: profile.mode_serieux_active,
                })
              }
            >
              Enregistrer le profil
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Galerie ({photos.length})</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {photos.map((ph) => (
            <a key={ph.id} href={ph.photo_url} target="_blank" rel="noreferrer" style={{ maxWidth: 120 }}>
              <img src={ph.photo_url} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} />
              {ph.is_primary ? <div>Principale</div> : null}
            </a>
          ))}
          {photos.length === 0 ? <p>Aucune photo secondaire.</p> : null}
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Accès / quotas</h2>
        {!access ? <p>Aucune ligne profile_access — sera créée à l’enregistrement.</p> : null}
        <div className="form-grid">
          <div className="form-group">
            <label>Quota contacts</label>
            <input
              type="number"
              value={accForm.contact_quota}
              onChange={(e) => setAccForm((f) => ({ ...f, contact_quota: +e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Contacts utilisés</label>
            <input
              type="number"
              value={accForm.contact_quota_used}
              onChange={(e) => setAccForm((f) => ({ ...f, contact_quota_used: +e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Quota photos</label>
            <input
              type="number"
              value={accForm.photo_quota}
              onChange={(e) => setAccForm((f) => ({ ...f, photo_quota: +e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Photos utilisées</label>
            <input
              type="number"
              value={accForm.photo_quota_used}
              onChange={(e) => setAccForm((f) => ({ ...f, photo_quota_used: +e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Accès tous profils (premium)</label>
            <select
              value={String(accForm.all_profiles_access)}
              onChange={(e) => setAccForm((f) => ({ ...f, all_profiles_access: e.target.value === 'true' }))}
            >
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => void saveAccess()}>
              Enregistrer accès
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Mot de passe (Auth)</h2>
        <p className="text-secondary" style={{ marginBottom: 12 }}>
          Nécessite la Edge Function <code>admin-set-password</code> déployée sur Supabase avec la variable secrète{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>. Sans déploiement, l’appel échoue (réponse réelle du réseau).
        </p>
        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Nouveau mot de passe</label>
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => void setPassword()}>
              Définir le mot de passe
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Message individuel</h2>
        <p className="text-secondary">Crée ou réutilise une conversation avec l’admin connecté ; message visible dans l’app utilisateur.</p>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Texte</label>
          <textarea rows={4} value={dm} onChange={(e) => setDm(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" onClick={() => void sendDirectMessage()}>
            Envoyer
          </button>
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Paiements récents</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Statut</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={3}>Aucun paiement</td>
                </tr>
              ) : (
                payments.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{row.created_at ? new Date(String(row.created_at)).toLocaleString('fr-FR') : '—'}</td>
                    <td>{String(row.status ?? '—')}</td>
                    <td>{String(row.amount_cents ?? row.amount ?? '—')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
