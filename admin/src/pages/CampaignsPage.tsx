import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import type { AdCampaign } from '@shared/types'
import { MediaUpload } from '../components/MediaUpload'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

type CampaignForm = {
  title: string
  image_url: string
  text: string
  start_at: string
  end_at: string
  audience: AdCampaign['audience']
  priority: number
  is_active: boolean
}

const emptyForm = (): CampaignForm => ({
  title: '',
  image_url: '',
  text: '',
  start_at: new Date().toISOString().slice(0, 16),
  end_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  audience: 'all',
  priority: 0,
  is_active: true,
})

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState<CampaignForm>(emptyForm)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('ad_campaigns').select('*').order('priority', { ascending: false })
      setCampaigns((data ?? []) as AdCampaign[])
      setLoading(false)
    }
    load()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitMessage(null)
    if (!form.image_url?.trim()) {
      setSubmitMessage({ type: 'error', text: 'Importez une image pour la campagne.' })
      return
    }
    const { error } = await supabase.from('ad_campaigns').insert({
      ...form,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
    })
    if (error) {
      setSubmitMessage({ type: 'error', text: error.message })
      return
    }
    const { data } = await supabase.from('ad_campaigns').select('*').order('priority', { ascending: false })
    setCampaigns((data ?? []) as AdCampaign[])
    setForm(emptyForm())
    setSubmitMessage({ type: 'success', text: 'Campagne créée.' })
  }

  const toggleActive = async (id: string, is_active: boolean) => {
    await supabase.from('ad_campaigns').update({ is_active }).eq('id', id)
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, is_active } : c)))
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="ad_campaigns_enabled">
      <div>
        <h1 className="page-title">Campagnes publicitaires</h1>
        <p className="page-subtitle">Créer des campagnes (image, texte, durée, audience, priorité). Affichées en haut selon la config.</p>
        {submitMessage && (
          <div className={`dashboard-message ${submitMessage.type === 'error' ? 'dashboard-message-error' : 'dashboard-message-success'}`} role="alert">
            {submitMessage.text}
          </div>
        )}
        <section className="dashboard-section" style={{ marginBottom: 24 }}>
          <h2>Nouvelle campagne</h2>
          <form onSubmit={submit} className="form-grid">
            <div className="form-group">
              <label>Titre</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Image (importer un fichier)</label>
              <MediaUpload
                mediaType="image"
                kind="campaigns"
                value={form.image_url}
                onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
                onError={(msg) => setSubmitMessage(msg ? { type: 'error', text: msg } : null)}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Texte</label>
              <textarea rows={2} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Début</label>
              <input type="datetime-local" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Fin</label>
              <input type="datetime-local" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Audience</label>
              <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as AdCampaign['audience'] }))}>
                <option value="all">Tous</option>
                <option value="men">Hommes</option>
                <option value="women">Femmes</option>
                <option value="paying">Payants</option>
                <option value="non_paying">Non payants</option>
              </select>
            </div>
            <div className="form-group">
              <label>Priorité</label>
              <input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Actif</label>
              <select value={String(form.is_active)} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))}>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit">Créer la campagne</button>
            </div>
          </form>
        </section>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Audience</th>
                <th>Priorité</th>
                <th>Actif</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td>{c.audience}</td>
                  <td>{c.priority}</td>
                  <td>{c.is_active ? 'Oui' : 'Non'}</td>
                  <td>
                    <button type="button" className="secondary" onClick={() => toggleActive(c.id, !c.is_active)}>
                      {c.is_active ? 'Désactiver' : 'Activer'}
                    </button>
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
