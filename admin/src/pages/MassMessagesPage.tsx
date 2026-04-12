import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import type { MassMessage, MassMessageContentType } from '@shared/types'
import { MediaUpload } from '../components/MediaUpload'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

const SEGMENTS: { value: MassMessage['segment']; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'men', label: 'Hommes' },
  { value: 'women', label: 'Femmes' },
  { value: 'paying', label: 'Payants' },
  { value: 'non_paying', label: 'Non payants' },
  { value: 'city', label: 'Ville' },
  { value: 'commune', label: 'Commune' },
  { value: 'mode_libre', label: 'Mode Libre' },
  { value: 'mode_serieux', label: 'Mode Sérieux' },
]

const MESSAGE_CONTENT_TYPES: { value: MassMessageContentType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Vidéo' },
]

export function MassMessagesPage() {
  const { user } = useAdminAuth()
  const [messages, setMessages] = useState<(MassMessage & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({
    title: '',
    body: '',
    content_type: 'text' as MassMessageContentType,
    image_url: '',
    video_url: '',
    segment: 'all' as MassMessage['segment'],
    segment_value: '',
  })

  const load = useCallback(async () => {
    const { data } = await supabase.from('mass_messages').select('*').order('created_at', { ascending: false })
    setMessages((data ?? []) as (MassMessage & { id: string })[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sendNow = async (msg: MassMessage & { id: string }) => {
    const { error } = await supabase.from('mass_messages').update({ sent_at: new Date().toISOString() }).eq('id', msg.id)
    if (error) {
      setSubmitMessage({ type: 'error', text: error.message })
      return
    }
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, sent_at: new Date().toISOString() } : m)))
    setSubmitMessage({ type: 'success', text: `« ${msg.title} » envoyé aux destinataires du segment.` })
  }

  const resetForm = () =>
    setForm({ title: '', body: '', content_type: 'text', image_url: '', video_url: '', segment: 'all', segment_value: '' })

  const createDraft = async (): Promise<string | null> => {
    setSubmitMessage(null)
    if (form.content_type === 'image' && !form.image_url?.trim()) {
      setSubmitMessage({ type: 'error', text: 'Choisissez une image (import) ou passez en format Texte.' })
      return null
    }
    if (form.content_type === 'video' && !form.video_url?.trim()) {
      setSubmitMessage({ type: 'error', text: 'Choisissez une vidéo (import) ou passez en format Texte.' })
      return null
    }
    const { data, error } = await supabase
      .from('mass_messages')
      .insert({
        title: form.title,
        body: form.body,
        content_type: form.content_type,
        image_url: form.content_type === 'image' ? form.image_url || null : null,
        video_url: form.content_type === 'video' ? form.video_url || null : null,
        segment: form.segment,
        segment_value: form.segment_value || null,
        created_by: user?.id,
      })
      .select('id')
      .single()
    if (error) {
      setSubmitMessage({ type: 'error', text: error.message })
      return null
    }
    return (data as { id: string }).id
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = await createDraft()
    if (!id) return
    await load()
    resetForm()
    setSubmitMessage({
      type: 'success',
      text: 'Brouillon créé. Utilisez « Envoyer » dans le tableau ou « Créer et envoyer » pour publication immédiate dans l’app.',
    })
  }

  const createAndSendNow = async () => {
    const id = await createDraft()
    if (!id) return
    const sentAt = new Date().toISOString()
    const { error } = await supabase.from('mass_messages').update({ sent_at: sentAt }).eq('id', id)
    if (error) {
      setSubmitMessage({ type: 'error', text: error.message })
      return
    }
    await load()
    resetForm()
    setSubmitMessage({ type: 'success', text: 'Message créé et visible dans l’app (Annonces) pour les segments concernés.' })
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="mass_messages_enabled">
      <div>
        <PageHeader onRefresh={load} />
        <h1 className="page-title">Messages de masse</h1>
        <p className="page-subtitle">
          Les messages <strong>ne sont visibles dans l’app (Annonces)</strong> qu’après envoi : colonne <code>sent_at</code> renseignée. Sans envoi, aucun utilisateur ne les voit.
        </p>
        {submitMessage && (
          <div className={`dashboard-message ${submitMessage.type === 'error' ? 'dashboard-message-error' : 'dashboard-message-success'}`} role="alert">
            {submitMessage.text}
          </div>
        )}
        <section className="dashboard-section" style={{ marginBottom: 24 }}>
          <h2>Nouveau message</h2>
          <form onSubmit={submit} className="form-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Titre</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Format</label>
              <select value={form.content_type} onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value as MassMessageContentType }))}>
                {MESSAGE_CONTENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Message (texte)</label>
              <textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required />
            </div>
            {form.content_type === 'image' && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Image (importer un fichier)</label>
                <MediaUpload
                  mediaType="image"
                  kind="mass-messages"
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
                  kind="mass-messages"
                  value={form.video_url}
                  onChange={(url) => setForm((f) => ({ ...f, video_url: url }))}
                  onError={(msg) => setSubmitMessage(msg ? { type: 'error', text: msg } : null)}
                />
              </div>
            )}
            <div className="form-group">
              <label>Segment</label>
              <select value={form.segment} onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value as MassMessage['segment'] }))}>
                {SEGMENTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            {(form.segment === 'city' || form.segment === 'commune') && (
              <div className="form-group">
                <label>Valeur (ville ou commune)</label>
                <input value={form.segment_value} onChange={(e) => setForm((f) => ({ ...f, segment_value: e.target.value }))} placeholder="Ex: Kinshasa" />
              </div>
            )}
            <div className="form-actions">
              <button type="submit">Créer brouillon</button>
              <button type="button" className="secondary" onClick={() => void createAndSendNow()}>
                Créer et envoyer maintenant
              </button>
            </div>
          </form>
        </section>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Format</th>
                <th>Segment</th>
                <th>Valeur</th>
                <th>Envoyé le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td>{m.title}</td>
                  <td>{m.content_type || 'text'}</td>
                  <td>{m.segment}</td>
                  <td>{m.segment_value ?? '—'}</td>
                  <td>{m.sent_at ? new Date(m.sent_at).toLocaleString('fr-FR') : 'Non envoyé'}</td>
                  <td>
                    {!m.sent_at && (
                      <button type="button" className="secondary" onClick={() => sendNow(m)}>Envoyer</button>
                    )}
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
