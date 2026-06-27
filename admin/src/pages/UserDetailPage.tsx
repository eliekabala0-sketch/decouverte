import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@lib/supabase'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import { PageHeader } from '../components/PageHeader'
import type { Profile, ProfileAccess } from '@shared/types'
import { GENDER_LABELS } from '@shared/constants'
import './DashboardPage.css'

type PhotoRow = { id: string; photo_url: string; is_primary: boolean }
type PackRow = {
  id: string
  name: string
  quota?: number
  contact_quota?: number | null
  photo_quota?: number | null
  all_profiles_access?: boolean | null
  price_cents?: number
}
type CreditRow = { contact_credits?: number | null; photo_credits?: number | null; premium_credits?: number | null }
type SubscriptionRow = {
  id: string
  plan_key?: string | null
  status?: string | null
  source?: string | null
  starts_at?: string | null
  ends_at?: string | null
}
type EntitlementRow = {
  id: string
  target_profile_id?: string | null
  access_type?: string | null
  mode?: string | null
  source?: string | null
  expires_at?: string | null
  revoked_at?: string | null
  reason?: string | null
}
type AuditRow = {
  id: string
  action: string
  entity_type?: string | null
  entity_id?: string | null
  reason?: string | null
  created_at: string
}

type ProfileEditableFields = Pick<Profile, 'boost_reason' | 'mode_libre_active' | 'mode_serieux_active'>

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
  const [credits, setCredits] = useState<CreditRow | null>(null)
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditRow[]>([])
  const [packs, setPacks] = useState<PackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [pw, setPw] = useState('')
  const [dm, setDm] = useState('')
  const [giftPackId, setGiftPackId] = useState('')
  const [giftReason, setGiftReason] = useState('geste commercial')
  const [grantTargetProfileId, setGrantTargetProfileId] = useState('')
  const [grantAccessType, setGrantAccessType] = useState<'photo' | 'contact' | 'profile'>('photo')
  const [grantReason, setGrantReason] = useState('geste administrateur')
  const [creditForm, setCreditForm] = useState({ contact_credits: 0, photo_credits: 0, premium_credits: 0 })
  const [subscriptionForm, setSubscriptionForm] = useState({ plan_key: 'premium_admin', days: 30, reason: 'abonnement offert' })

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
    const { data: pk } = await supabase
      .from('contact_packs')
      .select('id,name,quota,contact_quota,photo_quota,all_profiles_access,price_cents')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    setPacks((pk ?? []) as PackRow[])

    const [creditRes, subRes, entitlementRes, auditRes] = await Promise.all([
      supabase.from('user_credit_balances').select('*').eq('user_id', userId).maybeSingle(),
      supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('profile_access_entitlements')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase
        .from('audit_events')
        .select('id,action,entity_type,entity_id,reason,created_at')
        .eq('target_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(25),
    ])
    setCredits((creditRes.data as CreditRow | null) ?? null)
    if (creditRes.data) {
      const c = creditRes.data as CreditRow
      setCreditForm({
        contact_credits: c.contact_credits ?? 0,
        photo_credits: c.photo_credits ?? 0,
        premium_credits: c.premium_credits ?? 0,
      })
    }
    setSubscriptions((subRes.data ?? []) as SubscriptionRow[])
    setEntitlements((entitlementRes.data ?? []) as EntitlementRow[])
    setAuditEvents((auditRes.data ?? []) as AuditRow[])

    setLoading(false)
  }, [userId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const recordAudit = async (
    action: string,
    entityType?: string,
    entityId?: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ) => {
    if (!userId) return
    try {
      const { error } = await supabase.rpc('log_admin_audit', {
        action,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        target_user_id: userId,
        reason: reason ?? null,
        metadata: metadata ?? {},
      })
      if (error) console.warn('[admin-audit] log failed', error.message)
    } catch (e) {
      console.warn('[admin-audit] log failed', e)
    }
  }

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
    else {
      await recordAudit('update_profile_access', 'profile_access', userId, 'admin manual update', accForm)
      setMsg({ type: 'success', text: 'Accès / quotas enregistrés.' })
    }
    void load()
  }

  const saveProfilePatch = async (patch: Partial<ProfileEditableFields>) => {
    if (!userId) return
    setMsg(null)
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      await recordAudit('update_profile', 'profiles', userId, 'admin profile update', patch)
      setMsg({ type: 'success', text: 'Profil mis à jour.' })
    }
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
      await recordAudit('set_temporary_password', 'auth.users', userId, 'admin password reset')
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
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', convId)
      await recordAudit('send_direct_message', 'conversations', convId, 'admin direct message')
      setDm('')
      setMsg({ type: 'success', text: 'Message envoyé (visible dans Messages de l’utilisateur).' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Échec envoi' })
    }
  }

  const giftPack = async () => {
    if (!userId || !giftPackId) return
    const pack = packs.find((p) => p.id === giftPackId)
    if (!pack) return
    setMsg(null)
    const addContacts = pack.contact_quota ?? pack.quota ?? 0
    const addPhotos = pack.photo_quota ?? 0
    const allAccess = !!pack.all_profiles_access
    try {
      const currentQuota = access?.contact_quota ?? 0
      const currentUsed = access?.contact_quota_used ?? 0
      const currentPhoto = access?.photo_quota ?? 0
      const currentPhotoUsed = access?.photo_quota_used ?? 0

      const { error: upErr } = await supabase.from('profile_access').upsert(
        {
          user_id: userId,
          contact_quota: currentQuota + addContacts,
          contact_quota_used: currentUsed,
          photo_quota: currentPhoto + addPhotos,
          photo_quota_used: currentPhotoUsed,
          all_profiles_access: !!((access?.all_profiles_access ?? false) || allAccess),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (upErr) throw upErr

      const { error: payErr } = await supabase.from('payments').insert({
        user_id: userId,
        amount: 0,
        currency: 'USD',
        payment_method: 'Admin grant',
        payment_provider: 'Admin grant',
        provider: 'contact_pack_gift',
        transaction_ref: `gift-${Date.now()}-${giftReason.replace(/\s+/g, '-').slice(0, 24)}`,
        status: 'completed',
      })
      if (payErr) throw payErr

      await recordAudit('grant_contact_pack', 'contact_packs', pack.id, giftReason, {
        pack_name: pack.name,
        add_contacts: addContacts,
        add_photos: addPhotos,
        all_profiles_access: allAccess,
      })
      setMsg({ type: 'success', text: `Pack offert appliqué: ${pack.name}${giftReason ? ` (${giftReason})` : ''}.` })
      await load()
    } catch (e: unknown) {
      if (e && typeof e === 'object') {
        const rec = e as { message?: string; code?: string; details?: string; hint?: string }
        const extra = [rec.code, rec.details, rec.hint].filter(Boolean).join(' | ')
        setMsg({ type: 'error', text: `${rec.message ?? 'Attribution pack échouée.'}${extra ? ` (${extra})` : ''}` })
      } else {
        setMsg({ type: 'error', text: 'Attribution pack échouée.' })
      }
    }
  }

  const saveCredits = async () => {
    if (!userId) return
    setMsg(null)
    const { error } = await supabase.from('user_credit_balances').upsert(
      {
        user_id: userId,
        ...creditForm,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }
    await recordAudit('update_credit_balance', 'user_credit_balances', userId, 'admin credit update', creditForm)
    setMsg({ type: 'success', text: 'Crédits enregistrés.' })
    await load()
  }

  const grantSubscription = async () => {
    if (!userId || !subscriptionForm.plan_key.trim()) return
    setMsg(null)
    const startsAt = new Date()
    const endsAt = new Date(startsAt.getTime() + Math.max(1, subscriptionForm.days) * 24 * 60 * 60 * 1000)
    const { data, error } = await supabase
      .from('user_subscriptions')
      .insert({
        user_id: userId,
        plan_key: subscriptionForm.plan_key.trim(),
        status: 'granted',
        source: 'admin_grant',
        granted_by: adminUser?.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        metadata: { reason: subscriptionForm.reason },
      })
      .select('id')
      .single()
    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }
    await recordAudit('grant_subscription', 'user_subscriptions', (data as { id: string }).id, subscriptionForm.reason, subscriptionForm)
    setMsg({ type: 'success', text: 'Abonnement accordé.' })
    await load()
  }

  const grantSpecificAccess = async () => {
    if (!userId || !grantTargetProfileId.trim()) return
    setMsg(null)
    const { error } = await supabase.rpc('grant_profile_entitlement', {
      target_user_id: userId,
      target_profile_id: grantTargetProfileId.trim(),
      entitlement_type: grantAccessType,
      grant_mode: 'global',
      grant_source: 'admin_grant',
      grant_expires_at: null,
      grant_reason: grantReason,
      grant_metadata: {},
    })
    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }
    setGrantTargetProfileId('')
    setMsg({ type: 'success', text: `Accès ${grantAccessType} accordé.` })
    await load()
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
        <h2>Credits / abonnements / acces particuliers</h2>
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              <tr>
                <th>Credits contacts</th>
                <td>{credits?.contact_credits ?? 0}</td>
              </tr>
              <tr>
                <th>Credits photos</th>
                <td>{credits?.photo_credits ?? 0}</td>
              </tr>
              <tr>
                <th>Credits premium</th>
                <td>{credits?.premium_credits ?? 0}</td>
              </tr>
              <tr>
                <th>Abonnements</th>
                <td>
                  {subscriptions.length === 0
                    ? 'Aucun'
                    : subscriptions.map((s) => `${s.plan_key ?? 'plan'} (${s.status ?? 'statut inconnu'})`).join(', ')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Profil cible</th>
                <th>Mode</th>
                <th>Source</th>
                <th>Expiration</th>
                <th>Etat</th>
              </tr>
            </thead>
            <tbody>
              {entitlements.length === 0 ? (
                <tr><td colSpan={6}>Aucun acces particulier.</td></tr>
              ) : (
                entitlements.map((row) => (
                  <tr key={row.id}>
                    <td>{row.access_type ?? '-'}</td>
                    <td><code>{row.target_profile_id ? `${row.target_profile_id.slice(0, 8)}...` : '-'}</code></td>
                    <td>{row.mode ?? '-'}</td>
                    <td>{row.source ?? '-'}</td>
                    <td>{row.expires_at ? new Date(row.expires_at).toLocaleDateString('fr-FR') : 'Permanent'}</td>
                    <td>{row.revoked_at ? 'Revoque' : 'Actif'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="form-group">
            <label>Crédits contacts</label>
            <input
              type="number"
              min={0}
              value={creditForm.contact_credits}
              onChange={(e) => setCreditForm((f) => ({ ...f, contact_credits: +e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Crédits photos</label>
            <input
              type="number"
              min={0}
              value={creditForm.photo_credits}
              onChange={(e) => setCreditForm((f) => ({ ...f, photo_credits: +e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Crédits premium</label>
            <input
              type="number"
              min={0}
              value={creditForm.premium_credits}
              onChange={(e) => setCreditForm((f) => ({ ...f, premium_credits: +e.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => void saveCredits()}>
              Enregistrer les crédits
            </button>
          </div>
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="form-group">
            <label>Plan abonnement</label>
            <input
              value={subscriptionForm.plan_key}
              onChange={(e) => setSubscriptionForm((f) => ({ ...f, plan_key: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Durée (jours)</label>
            <input
              type="number"
              min={1}
              value={subscriptionForm.days}
              onChange={(e) => setSubscriptionForm((f) => ({ ...f, days: +e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Raison abonnement</label>
            <input
              value={subscriptionForm.reason}
              onChange={(e) => setSubscriptionForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => void grantSubscription()}>
              Accorder abonnement
            </button>
          </div>
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="form-group">
            <label>ID profil cible</label>
            <input
              value={grantTargetProfileId}
              onChange={(e) => setGrantTargetProfileId(e.target.value)}
              placeholder="UUID du profil à débloquer"
            />
          </div>
          <div className="form-group">
            <label>Type accès</label>
            <select value={grantAccessType} onChange={(e) => setGrantAccessType(e.target.value as typeof grantAccessType)}>
              <option value="photo">Photo</option>
              <option value="contact">Contact</option>
              <option value="profile">Profil complet</option>
            </select>
          </div>
          <div className="form-group">
            <label>Raison accès</label>
            <input value={grantReason} onChange={(e) => setGrantReason(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => void grantSpecificAccess()} disabled={!grantTargetProfileId.trim()}>
              Accorder accès particulier
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
        <p className="text-secondary" style={{ marginBottom: 12 }}>
          Securite: le mot de passe n'est jamais affichable. L'admin peut seulement definir un mot de passe temporaire
          ou lancer une reinitialisation; les secrets restent hashes par Supabase Auth.
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
        <h2>Offrir un pack</h2>
        <p className="text-secondary">Attribue immédiatement un pack actif au client, avec traçabilité paiement offert.</p>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="form-group">
            <label>Pack</label>
            <select value={giftPackId} onChange={(e) => setGiftPackId(e.target.value)}>
              <option value="">— Choisir —</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({(p.contact_quota ?? p.quota ?? 0)} contacts{p.photo_quota ? `, ${p.photo_quota} photos` : ''})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Raison</label>
            <input value={giftReason} onChange={(e) => setGiftReason(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => void giftPack()} disabled={!giftPackId}>
              Offrir ce pack
            </button>
          </div>
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

      <section className="dashboard-section">
        <h2>Historique des actions admin</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Objet</th>
                <th>Raison</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.length === 0 ? (
                <tr><td colSpan={4}>Aucune action historisee.</td></tr>
              ) : (
                auditEvents.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString('fr-FR')}</td>
                    <td>{row.action}</td>
                    <td>{row.entity_type ?? '-'} {row.entity_id ? `/${row.entity_id.slice(0, 8)}...` : ''}</td>
                    <td>{row.reason ?? '-'}</td>
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
