import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

type ProfileRow = {
  id: string
  username: string
  boost_reason: string | null
}

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
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState<typeof BOOST_REASONS[number]['value']>('admin')

  const load = async () => {
    const [r1, r2] = await Promise.all([
      supabase.from('profiles').select('id, username, boost_reason').not('boost_reason', 'is', null),
      supabase.from('profiles').select('id, username').eq('status', 'active').order('username'),
    ])
    setBoosted((r1.data ?? []) as ProfileRow[])
    setAllProfiles((r2.data ?? []) as ProfileRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const addBoost = async () => {
    if (!selectedId) return
    await supabase.from('profiles').update({ boost_reason: reason }).eq('id', selectedId)
    setSelectedId('')
    load()
  }

  const removeBoost = async (id: string) => {
    await supabase.from('profiles').update({ boost_reason: null }).eq('id', id)
    load()
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="boost_enabled">
      <div>
        <h1 className="page-title">Mises en avant</h1>
        <p className="page-subtitle">Mettre en avant un profil (colonne boost_reason sur le schéma réel).</p>
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
