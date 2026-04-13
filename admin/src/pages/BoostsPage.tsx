import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

type ProfileRow = {
  id: string
  username: string
  boost_reason: string | null
}
type BoostOffer = { id: string; label: string; days: number; amount: number; active: boolean }

const BOOST_REASONS = [
  { value: 'admin', label: 'Choisi par l\'admin' },
  { value: 'most_liked', label: 'Plus appréciés' },
  { value: 'most_selected', label: 'Plus sélectionnés' },
  { value: 'paid', label: 'A payé (boost)' },
] as const

export function BoostsPage() {
  const [boosted, setBoosted] = useState<ProfileRow[]>([])
  const [allProfiles, setAllProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState<typeof BOOST_REASONS[number]['value']>('admin')
  const [offers, setOffers] = useState<BoostOffer[]>([])
  const [savingOffers, setSavingOffers] = useState(false)

  const load = async () => {
    setPageError(null)
    try {
      const [r1, r2] = await Promise.all([
        supabase.from('profiles').select('id, username, boost_reason').not('boost_reason', 'is', null),
        supabase.from('profiles').select('id, username').eq('status', 'active').order('username'),
      ])
      if (r1.error || r2.error) {
        const msg = r1.error?.message || r2.error?.message || 'Erreur de chargement des mises en avant.'
        console.error('[admin-boosts] load error', { boostedError: r1.error, profilesError: r2.error })
        setPageError(msg)
        return
      }
      setBoosted((r1.data ?? []) as ProfileRow[])
      setAllProfiles((r2.data ?? []) as ProfileRow[])
      const { data: st } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'visibility_boost_offers')
        .maybeSingle()
      const raw = (st as { value?: unknown } | null)?.value
      if (Array.isArray(raw)) {
        const parsed = raw
          .map((x, i) => {
            const r = x as { id?: unknown; label?: unknown; days?: unknown; amount?: unknown; active?: unknown }
            const days = Number(r.days)
            const amount = Number(r.amount)
            if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(amount) || amount < 0) return null
            return {
              id: typeof r.id === 'string' && r.id.trim() ? r.id : `offer_${i + 1}`,
              label: typeof r.label === 'string' && r.label.trim() ? r.label : `${days} jours`,
              days,
              amount,
              active: typeof r.active === 'boolean' ? r.active : true,
            } as BoostOffer
          })
          .filter(Boolean) as BoostOffer[]
        setOffers(parsed)
      } else {
        setOffers([])
      }
    } catch (e) {
      console.error('[admin-boosts] load exception', e)
      setPageError(e instanceof Error ? e.message : 'Erreur de chargement des mises en avant.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const addBoost = async () => {
    if (!selectedId) return
    const { error } = await supabase.from('profiles').update({ boost_reason: reason }).eq('id', selectedId)
    if (error) {
      console.error('[admin-boosts] add error', error)
      setPageError(error.message || 'Impossible d’ajouter la mise en avant.')
      return
    }
    setSelectedId('')
    void load()
  }

  const removeBoost = async (id: string) => {
    const { error } = await supabase.from('profiles').update({ boost_reason: null }).eq('id', id)
    if (error) {
      console.error('[admin-boosts] remove error', error)
      setPageError(error.message || 'Impossible de retirer la mise en avant.')
      return
    }
    void load()
  }

  const addOffer = () => {
    setOffers((prev) => [
      ...prev,
      { id: `offer_${Date.now()}`, label: 'Nouvelle offre', days: 7, amount: 9.99, active: true },
    ])
  }

  const normalizedOffers = useMemo(
    () =>
      offers
        .map((o) => ({
          id: o.id.trim() || `offer_${Math.random().toString(36).slice(2, 7)}`,
          label: o.label.trim() || `${o.days} jours`,
          days: Number(o.days),
          amount: Number(o.amount),
          active: !!o.active,
        }))
        .filter((o) => Number.isFinite(o.days) && o.days > 0 && Number.isFinite(o.amount) && o.amount >= 0),
    [offers]
  )

  const saveOffers = async () => {
    if (normalizedOffers.length === 0) {
      setPageError('Aucune offre boost valide à enregistrer.')
      return
    }
    setSavingOffers(true)
    setPageError(null)
    const { error } = await supabase
      .from('admin_settings')
      .upsert(
        { key: 'visibility_boost_offers', value: normalizedOffers, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
    setSavingOffers(false)
    if (error) {
      setPageError(error.message || 'Erreur enregistrement des offres boost.')
      return
    }
    await load()
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="boost_enabled">
      <div>
        <h1 className="page-title">Mises en avant</h1>
        <p className="page-subtitle">Mettre en avant un profil (colonne boost_reason sur le schéma réel).</p>
        {pageError ? <p className="page-subtitle" style={{ color: 'var(--error)' }}>{pageError}</p> : null}
        <section className="dashboard-section" style={{ marginBottom: 24 }}>
          <h2>Mettre un profil en avant</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Profil</label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">— Choisir —</option>
                {allProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.username}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Raison</label>
              <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                {BOOST_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="button" onClick={addBoost} disabled={!selectedId}>Mettre en avant</button>
            </div>
          </div>
        </section>
        <section className="dashboard-section" style={{ marginBottom: 24 }}>
          <h2>Offres de mise en avant (prix / durée)</h2>
          <p className="text-secondary">
            Ces offres sont utilisées immédiatement côté app utilisateur dans l’écran Paiements.
          </p>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Libellé</th>
                  <th>Durée (jours)</th>
                  <th>Prix (USD)</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o, idx) => (
                  <tr key={`${o.id}-${idx}`}>
                    <td><input value={o.id} onChange={(e) => setOffers((prev) => prev.map((x, i) => i === idx ? { ...x, id: e.target.value } : x))} /></td>
                    <td><input value={o.label} onChange={(e) => setOffers((prev) => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} /></td>
                    <td><input type="number" min={1} value={o.days} onChange={(e) => setOffers((prev) => prev.map((x, i) => i === idx ? { ...x, days: Number(e.target.value) } : x))} /></td>
                    <td><input type="number" min={0} step="0.01" value={o.amount} onChange={(e) => setOffers((prev) => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))} /></td>
                    <td><input type="checkbox" checked={o.active} onChange={(e) => setOffers((prev) => prev.map((x, i) => i === idx ? { ...x, active: e.target.checked } : x))} /></td>
                    <td>
                      <button type="button" className="secondary" onClick={() => setOffers((prev) => prev.filter((_, i) => i !== idx))}>
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
                {offers.length === 0 ? <tr><td colSpan={6}>Aucune offre boost.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button type="button" className="secondary" onClick={addOffer}>Ajouter une offre</button>
            <button type="button" onClick={() => void saveOffers()} disabled={savingOffers}>
              {savingOffers ? 'Enregistrement…' : 'Enregistrer les offres'}
            </button>
          </div>
        </section>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Profil</th>
                <th>Raison</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {boosted.length === 0 && (
                <tr><td colSpan={3}>Aucun profil en mise en avant.</td></tr>
              )}
              {boosted.map((p) => (
                <tr key={p.id}>
                  <td>{p.username}</td>
                  <td>{BOOST_REASONS.find((r) => r.value === p.boost_reason)?.label ?? p.boost_reason ?? '—'}</td>
                  <td>
                    <button type="button" className="secondary" onClick={() => removeBoost(p.id)}>Retirer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FeatureGate>
  )
}
