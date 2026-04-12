import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import type { PublicPublication, PublicationContentType } from '@shared/types'
import { MediaUpload } from '../components/MediaUpload'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

const CONTENT_TYPES: { value: PublicationContentType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Vidéo' },
]

export function PublicationsPage() {
  const { user } = useAdminAuth()
  const [publications, setPublications] = useState<PublicPublication[]>([])
  const [loading, setLoading] = useState(true)
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    content_type: 'text' as PublicationContentType,
    image_url: '',
    video_url: '',
    is_pinned: true,
    is_active: true,
  })

  const load = useCallback(async () => {
    const { data } = await supabase.from('public_publications').select('*').order('created_at', { ascending: false })
    setPublications((data ?? []) as PublicPublication[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitMessage(null)
    if (form.content_type === 'image' && !form.image_url?.trim()) {
      setSubmitMessage({ type: 'error', text: 'Choisissez une image (import) ou passez en format Texte.' })
      return
    }
    if (form.content_type === 'video' && !form.video_url?.trim()) {
      setSubmitMessage({ type: 'error', text: 'Choisissez une vidéo (import) ou passez en format Texte.' })
      return
    }
    const { error } = await supabase.from('public_publications').insert({
      author_id: user?.id,
      title: form.title,
      content: form.content,
      content_type: form.content_type,
      image_url: form.content_type === 'image' ? form.image_url || null : null,
      video_url: form.content_type === 'video' ? form.video_url || null : null,
      is_pinned: form.is_pinned,
      is_active: form.is_active,
    })
    if (error) {
      setSubmitMessage({ type: 'error', text: error.message })
      return
    }
    const { data } = await supabase.from('public_publications').select('*').order('created_at', { ascending: false })
    setPublications((data ?? []) as PublicPublication[])
    setForm({ title: '', content: '', content_type: 'text', image_url: '', video_url: '', is_pinned: true, is_active: true })
    setSubmitMessage({ type: 'success', text: 'Publication enregistrée.' })
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="public_publications_enabled">
      <div>
        <PageHeader onRefresh={load} />
        <h1 className="page-title">Publications publiques</h1>
        <p className="page-subtitle">
          Insérées dans <code>public_publications</code> (RLS : compte avec <code>profiles.role = admin</code>). Visibles dans l’app onglet Publications si actif dans les paramètres.
        </p>
        {submitMessage && (
          <div className={`dashboard-message ${submitMessage.type === 'error' ? 'dashboard-message-error' : 'dashboard-message-success'}`} role="alert">
            {submitMessage.text}
          </div>
        )}
        <section className="dashboard-section" style={{ marginBottom: 24 }}>
          <h2>Nouvelle publication</h2>
          <form onSubmit={submit} className="form-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Titre</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Format</label>
              <select value={form.content_type} onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value as PublicationContentType }))}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Contenu (texte)</label>
              <textarea rows={4} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} required />
            </div>
            {form.content_type === 'image' && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Image (importer un fichier)</label>
                <MediaUpload
                  mediaType="image"
                  kind="publications"
                  value={form.image_url}
                  onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
                  onError={(msg) => setSubmitMessage(msg ? { type: 'error', text: msg } : null)}
                />
              </div>
            )}
            {form.content_type === 'video' && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Vidéo (importer un fichier)</label>
                <MediaUpload
                  mediaType="video"
                  kind="publications"
                  value={form.video_url}
                  onChange={(url) => setForm((f) => ({ ...f, video_url: url }))}
                  onError={(msg) => setSubmitMessage(msg ? { type: 'error', text: msg } : null)}
                />
              </div>
            )}
            <div className="form-group">
              <label>Épinglé</label>
              <select value={String(form.is_pinned)} onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.value === 'true' }))}>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select>
            </div>
            <div className="form-group">
              <label>Actif</label>
              <select value={String(form.is_active)} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))}>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit">Publier</button>
            </div>
          </form>
        </section>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Format</th>
                <th>Épinglé</th>
                <th>Actif</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {publications.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>{p.content_type || 'text'}</td>
                  <td>{p.is_pinned ? 'Oui' : 'Non'}</td>
                  <td>{p.is_active ? 'Oui' : 'Non'}</td>
                  <td>{new Date(p.created_at).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FeatureGate>
  )
}
