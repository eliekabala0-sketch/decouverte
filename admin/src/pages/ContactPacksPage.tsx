import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@lib/supabase'
import type { ContactPack } from '@shared/types'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

export function ContactPacksPage() {
  const [packs, setPacks] = useState<ContactPack[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editing, setEditing] = useState<ContactPack | null>(null)
  const [form, setForm] = useState({
    name: '',
    quota: 5,
    contact_quota: 5,
    photo_quota: 0,
    all_profiles_access: false,
    price_cents: 0,
    currency: 'USD',
    is_active: true,
    sort_order: 0,
  })

  const loadPacks = useCallback(async () => {
    const { data, error } = await supabase.from('contact_packs').select('*').order('sort_order')
    if (error) {
      setMessage({ type: 'error', text: `Erreur chargement : ${error.message}` })
      setPacks([])
    } else {
      setPacks((data ?? []) as ContactPack[])
      setMessage(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadPacks()
  }, [loadPacks])

  const clearMessage = () => setMessage(null)

  const save = async () => {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Le nom du pack est obligatoire.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        name: form.name,
        quota: form.quota,
        contact_quota: form.contact_quota,
        photo_quota: form.photo_quota,
        all_profiles_access: form.all_profiles_access,
        price_cents: form.price_cents,
        currency: form.currency || 'USD',
        is_active: form.is_active,
        sort_order: form.sort_order,
      }
      if (editing) {
        const { error } = await supabase.from('contact_packs').update(payload).eq('id', editing.id)
        if (error) throw error
        setMessage({ type: 'success', text: 'Pack mis à jour.' })
        await loadPacks()
      } else {
        const { data, error } = await supabase
          .from('contact_packs')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        setMessage({ type: 'success', text: `Pack « ${(data as ContactPack).name} » ajouté.` })
        await loadPacks()
      }
      setEditing(null)
      setForm({
        name: '',
        quota: 5,
        contact_quota: 5,
        photo_quota: 0,
        all_profiles_access: false,
        price_cents: 0,
        currency: 'USD',
        is_active: true,
        sort_order: 0,
      })
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message ?? 'Erreur lors de l\'enregistrement.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="contact_packs_enabled">
      <div>
        <h1 className="page-title">Packs contacts</h1>
        <p className="page-subtitle">Gérer les quotas (ex. 1, 3, 5, 10) et prix. Modifiables sans code.</p>

        {message && (
          <div
            className={`dashboard-message ${message.type === 'error' ? 'dashboard-message-error' : 'dashboard-message-success'}`}
            role="alert"
          >
            {message.text}
            <button type="button" className="dashboard-message-dismiss" onClick={clearMessage} aria-label="Fermer">×</button>
          </div>
        )}

        <section className="dashboard-section" style={{ marginBottom: 24 }}>
          <h2>Liste des packs existants</h2>
          {packs.length === 0 ? (
            <p className="text-secondary">Aucun pack pour l'instant. Ajoutez-en un ci-dessous.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Contacts</th>
                    <th>Photos</th>
                    <th>Premium</th>
                    <th>Prix (USD)</th>
                    <th>Actif</th>
                    <th>Ordre</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.contact_quota ?? p.quota}</td>
                      <td>{(p.photo_quota ?? 0).toString()}</td>
                      <td>{p.all_profiles_access ? 'Oui' : 'Non'}</td>
                      <td>{(p.price_cents / 100).toFixed(2)} {p.currency || 'USD'}</td>
                      <td>{p.is_active ? 'Oui' : 'Non'}</td>
                      <td>{p.sort_order}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setEditing(p)
                            setForm({
                              name: p.name,
                              quota: p.quota,
                              contact_quota: p.contact_quota ?? p.quota,
                              photo_quota: p.photo_quota ?? 0,
                              all_profiles_access: !!p.all_profiles_access,
                              price_cents: p.price_cents,
                              currency: p.currency || 'USD',
                              is_active: p.is_active,
                              sort_order: p.sort_order,
                            })
                            setMessage(null)
                          }}
                        >
                          Modifier
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-section">
          <h2>{editing ? 'Modifier le pack' : 'Ajouter un pack'}</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Nom</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Pack 5 contacts" />
            </div>
            <div className="form-group">
              <label>Contacts (quota)</label>
              <input
                type="number"
                min={0}
                value={form.contact_quota}
                onChange={(e) => setForm((f) => ({ ...f, contact_quota: +e.target.value, quota: +e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Photos visibles (quota)</label>
              <input type="number" min={0} value={form.photo_quota} onChange={(e) => setForm((f) => ({ ...f, photo_quota: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Pack premium (tous les profils)</label>
              <select value={String(form.all_profiles_access)} onChange={(e) => setForm((f) => ({ ...f, all_profiles_access: e.target.value === 'true' }))}>
                <option value="false">Non</option>
                <option value="true">Oui</option>
              </select>
            </div>
            <div className="form-group">
              <label>Prix (USD, ex. 20 = 20 USD)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price_cents ? (form.price_cents / 100).toString() : ''}
                onChange={(e) => {
                  const dollars = parseFloat(e.target.value || '0')
                  const cents = Math.round(dollars * 100)
                  setForm((f) => ({ ...f, price_cents: cents }))
                }}
              />
            </div>
            <div className="form-group">
              <label>Actif</label>
              <select value={String(form.is_active)} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))}>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select>
            </div>
            <div className="form-group">
              <label>Ordre</label>
              <input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: +e.target.value }))} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter le pack'}
            </button>
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditing(null)
                  setForm({
                    name: '',
                    quota: 5,
                    contact_quota: 5,
                    photo_quota: 0,
                    all_profiles_access: false,
                    price_cents: 0,
                    currency: 'USD',
                    is_active: true,
                    sort_order: 0,
                  })
                  setMessage(null)
                }}
              >
                Annuler
              </button>
            )}
          </div>
        </section>
      </div>
    </FeatureGate>
  )
}
