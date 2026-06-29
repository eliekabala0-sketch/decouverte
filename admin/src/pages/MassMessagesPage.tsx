import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import type { MassMessage, MassMessageContentType } from '@shared/types'
import { MediaUpload } from '../components/MediaUpload'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

const SEGMENTS: { value: MassMessage['segment']; label: string; needsValue?: boolean }[] = [
  { value: 'all', label: 'Tout le monde' },
  { value: 'men', label: 'Hommes' },
  { value: 'women', label: 'Femmes' },
  { value: 'city', label: 'Ville', needsValue: true },
  { value: 'commune', label: 'Commune', needsValue: true },
  { value: 'mode_libre', label: 'Mode Libre' },
  { value: 'mode_serieux', label: 'Mode Serieux' },
  { value: 'verified', label: 'Verifies' },
  { value: 'unverified', label: 'Non verifies' },
  { value: 'boosted', label: 'Boostes' },
  { value: 'with_pack', label: 'Pack actif' },
  { value: 'without_pack', label: 'Sans pack' },
  { value: 'new_users', label: 'Nouveaux inscrits' },
]

const MESSAGE_CONTENT_TYPES: { value: MassMessageContentType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
]

type Estimate = { recipient_count: number; preview_user_ids: string[] }
type TargetFilters = ReturnType<typeof normalizeTargetFilters>

function normalizeTargetFilters(filters: {
  segment: MassMessage['segment']
  segment_value?: string | null
  min_age?: number | null
  max_age?: number | null
  excluded_statuses?: string[]
}) {
  return {
    segment: filters.segment,
    segment_value: filters.segment_value || null,
    min_age: filters.min_age ?? null,
    max_age: filters.max_age ?? null,
    excluded_statuses: filters.excluded_statuses ?? ['banned', 'suspended', 'deleted'],
  }
}

export function MassMessagesPage() {
  const { user } = useAdminAuth()
  const [messages, setMessages] = useState<(MassMessage & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [form, setForm] = useState({
    title: '',
    body: '',
    content_type: 'text' as MassMessageContentType,
    image_url: '',
    video_url: '',
    segment: 'all' as MassMessage['segment'],
    segment_value: '',
    min_age: '',
    max_age: '',
  })

  const targetFilters = useCallback(() => normalizeTargetFilters({
    segment: form.segment,
    segment_value: form.segment_value || null,
    min_age: form.min_age ? Number(form.min_age) : null,
    max_age: form.max_age ? Number(form.max_age) : null,
  }), [form.segment, form.segment_value, form.min_age, form.max_age])

  const load = useCallback(async () => {
    const { data } = await supabase.from('mass_messages').select('*').order('created_at', { ascending: false }).limit(100)
    setMessages((data ?? []) as (MassMessage & { id: string })[])
    setLoading(false)
  }, [])

  const estimateTarget = useCallback(async (filters: TargetFilters) => {
    const { data, error } = await supabase.rpc('estimate_mass_message_recipients', { filters })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return {
      recipient_count: Number((row as { recipient_count?: number })?.recipient_count ?? 0),
      preview_user_ids: ((row as { preview_user_ids?: string[] })?.preview_user_ids ?? []) as string[],
    }
  }, [])

  const previewTarget = useCallback(async () => {
    setSubmitMessage(null)
    try {
      const next = await estimateTarget(targetFilters())
      setEstimate(next)
      return next
    } catch (error) {
      setEstimate(null)
      setSubmitMessage({ type: 'error', text: error instanceof Error ? error.message : 'Estimation impossible.' })
      return null
    }
  }, [estimateTarget, targetFilters])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void previewTarget()
  }, [previewTarget])

  const resetForm = () => {
    setForm({ title: '', body: '', content_type: 'text', image_url: '', video_url: '', segment: 'all', segment_value: '', min_age: '', max_age: '' })
    setEstimate(null)
  }

  const validate = () => {
    if (form.content_type === 'image' && !form.image_url?.trim()) return 'Choisissez une image ou passez en format Texte.'
    if (form.content_type === 'video' && !form.video_url?.trim()) return 'Choisissez une video ou passez en format Texte.'
    const selected = SEGMENTS.find((s) => s.value === form.segment)
    if (selected?.needsValue && !form.segment_value.trim()) return 'Renseignez la valeur du segment.'
    return null
  }

  const createDraft = async (sendNow: boolean): Promise<string | null> => {
    setSubmitMessage(null)
    const validationError = validate()
    if (validationError) {
      setSubmitMessage({ type: 'error', text: validationError })
      return null
    }
    const currentEstimate = (await previewTarget()) ?? estimate
    const sentAt = sendNow ? new Date().toISOString() : null
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
        target_filters: targetFilters(),
        recipient_count: currentEstimate?.recipient_count ?? 0,
        preview_user_ids: currentEstimate?.preview_user_ids ?? [],
        sent_at: sentAt,
        created_by: user?.id,
      })
      .select('id')
      .single()
    if (error) {
      setSubmitMessage({ type: 'error', text: error.message })
      return null
    }

    await supabase.rpc('log_admin_audit', {
      action: sendNow ? 'send_mass_message' : 'create_mass_message_draft',
      entity_type: 'mass_messages',
      entity_id: (data as { id: string }).id,
      target_user_id: null,
      reason: form.title,
      metadata: {
        filters: targetFilters(),
        recipient_count: currentEstimate?.recipient_count ?? 0,
        title: form.title,
        content_preview: form.body.slice(0, 160),
      },
    })
    return (data as { id: string }).id
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = await createDraft(false)
    if (!id) return
    await load()
    resetForm()
    setSubmitMessage({ type: 'success', text: 'Brouillon cree avec estimation de cible.' })
  }

  const createAndSendNow = async () => {
    const id = await createDraft(true)
    if (!id) return
    await load()
    resetForm()
    setSubmitMessage({ type: 'success', text: 'Message cree, envoye et visible dans l app pour la cible estimee.' })
  }

  const sendNow = async (msg: MassMessage & { id: string }) => {
    let currentEstimate: Estimate | null = null
    const messageFilters = normalizeTargetFilters((msg.target_filters ?? targetFilters()) as TargetFilters)
    try {
      currentEstimate = await estimateTarget(messageFilters)
    } catch (error) {
      setSubmitMessage({ type: 'error', text: error instanceof Error ? error.message : 'Estimation impossible.' })
      return
    }
    const sentAt = new Date().toISOString()
    const { error } = await supabase
      .from('mass_messages')
      .update({
        sent_at: sentAt,
        recipient_count: currentEstimate?.recipient_count ?? msg.recipient_count ?? 0,
        target_filters: messageFilters,
      })
      .eq('id', msg.id)
    if (error) {
      setSubmitMessage({ type: 'error', text: error.message })
      return
    }
    await supabase.rpc('log_admin_audit', {
      action: 'send_mass_message',
      entity_type: 'mass_messages',
      entity_id: msg.id,
      target_user_id: null,
      reason: msg.title,
      metadata: { filters: messageFilters, recipient_count: currentEstimate?.recipient_count ?? msg.recipient_count ?? 0 },
    })
    await load()
    setSubmitMessage({ type: 'success', text: `Message envoye a ${currentEstimate?.recipient_count ?? msg.recipient_count ?? 0} destinataires estimes.` })
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="mass_messages_enabled">
      <div>
        <PageHeader onRefresh={load} />
        <h1 className="page-title">Messages de masse</h1>
        <p className="page-subtitle">Ciblage avance, estimation avant envoi, bannis/suspendus/archives exclus par defaut.</p>
        {submitMessage && (
          <div className={`dashboard-message ${submitMessage.type === 'error' ? 'dashboard-message-error' : 'dashboard-message-success'}`} role="alert">
            {submitMessage.text}
          </div>
        )}
        <section className="dashboard-section" style={{ marginBottom: 24 }}>
          <h2>Nouveau message</h2>
          <form onSubmit={submit} className="form-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Titre</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
            <div className="form-group"><label>Format</label><select value={form.content_type} onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value as MassMessageContentType }))}>{MESSAGE_CONTENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Message</label><textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required /></div>
            {form.content_type === 'image' && <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Image</label><MediaUpload mediaType="image" kind="mass-messages" value={form.image_url} onChange={(url) => setForm((f) => ({ ...f, image_url: url }))} onError={(msg) => setSubmitMessage(msg ? { type: 'error', text: msg } : null)} /></div>}
            {form.content_type === 'video' && <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Video</label><MediaUpload mediaType="video" kind="mass-messages" value={form.video_url} onChange={(url) => setForm((f) => ({ ...f, video_url: url }))} onError={(msg) => setSubmitMessage(msg ? { type: 'error', text: msg } : null)} /></div>}
            <div className="form-group"><label>Segment</label><select value={form.segment} onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value as MassMessage['segment'] }))}>{SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            <div className="form-group"><label>Valeur segment</label><input value={form.segment_value} onChange={(e) => setForm((f) => ({ ...f, segment_value: e.target.value }))} placeholder="Ville ou commune si necessaire" /></div>
            <div className="form-group"><label>Age min</label><input type="number" value={form.min_age} onChange={(e) => setForm((f) => ({ ...f, min_age: e.target.value }))} /></div>
            <div className="form-group"><label>Age max</label><input type="number" value={form.max_age} onChange={(e) => setForm((f) => ({ ...f, max_age: e.target.value }))} /></div>
            <div className="dashboard-message" style={{ gridColumn: '1 / -1' }}>
              Destinataires estimes : <strong>{estimate?.recipient_count ?? 0}</strong>
              {estimate?.preview_user_ids?.length ? <div>Apercu : {estimate.preview_user_ids.map((id) => `${id.slice(0, 8)}...`).join(', ')}</div> : null}
            </div>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => void previewTarget()}>Previsualiser la cible</button>
              <button type="submit">Creer brouillon</button>
              <button type="button" onClick={() => void createAndSendNow()}>Creer et envoyer maintenant</button>
            </div>
          </form>
        </section>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Titre</th><th>Segment</th><th>Age</th><th>Dest.</th><th>Envoye le</th><th>Actions</th></tr></thead>
            <tbody>
              {messages.map((m) => {
                const filters = (m.target_filters ?? {}) as { min_age?: number; max_age?: number }
                return (
                  <tr key={m.id}>
                    <td>{m.title}</td><td>{m.segment}{m.segment_value ? `: ${m.segment_value}` : ''}</td>
                    <td>{filters.min_age ?? '-'} / {filters.max_age ?? '-'}</td>
                    <td>{m.recipient_count ?? '-'}</td>
                    <td>{m.sent_at ? new Date(m.sent_at).toLocaleString('fr-FR') : 'Non envoye'}</td>
                    <td>{!m.sent_at && <button type="button" className="secondary" onClick={() => void sendNow(m)}>Envoyer</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </FeatureGate>
  )
}
