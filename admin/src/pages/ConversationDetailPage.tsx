import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@lib/supabase'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import './DashboardPage.css'

type Msg = {
  id: string
  sender_id: string
  content: string
  created_at: string
}

type Conv = {
  id: string
  participant_ids: string[]
}

export function ConversationDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user: adminUser } = useAdminAuth()
  const [conversation, setConversation] = useState<Conv | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const canSend = useMemo(() => {
    if (!adminUser?.id || !conversation?.participant_ids) return false
    return conversation.participant_ids.includes(adminUser.id)
  }, [adminUser?.id, conversation?.participant_ids])

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setError(null)
      const { data: c, error: convErr } = await supabase.from('conversations').select('id,participant_ids').eq('id', id).maybeSingle()
      if (convErr || !c) {
        setError(convErr?.message || 'Conversation introuvable.')
        setLoading(false)
        return
      }
      setConversation(c as Conv)
      const { data: m, error: mErr } = await supabase
        .from('messages')
        .select('id,sender_id,content,created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })
      if (mErr) setError(mErr.message)
      setMessages((m ?? []) as Msg[])
      setLoading(false)
    }
    void load()
  }, [id])

  const sendDirect = async () => {
    if (!id || !adminUser?.id || !draft.trim() || !canSend || sending) return
    setSending(true)
    setError(null)
    try {
      const { data, error: mErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: id,
          sender_id: adminUser.id,
          content: `« Équipe Découverte »\n\n${draft.trim()}`,
        })
        .select('id,sender_id,content,created_at')
        .single()
      if (mErr) throw mErr
      setMessages((prev) => [...prev, data as Msg])
      setDraft('')
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="page-loading">Chargement…</div>

  return (
    <div>
      <h1 className="page-title">Conversation</h1>
      <p className="page-subtitle">
        <code>{id}</code> — {conversation?.participant_ids?.length ?? 0} participant(s)
      </p>
      {error ? <div className="dashboard-message dashboard-message-error">{error}</div> : null}
      <div className="form-actions" style={{ marginBottom: 14 }}>
        <button type="button" className="secondary" onClick={() => navigate('/conversations')}>
          Retour conversations
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Expéditeur</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr><td colSpan={3}>Aucun message.</td></tr>
            ) : (
              messages.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.created_at).toLocaleString('fr-FR')}</td>
                  <td><code>{m.sender_id.slice(0, 8)}…</code></td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{m.content}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <section className="dashboard-section" style={{ marginTop: 18 }}>
        <h2>Message direct (admin)</h2>
        <p className="text-secondary">Disponible si l’admin connecté participe à cette conversation.</p>
        <textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="form-actions">
          <button type="button" onClick={() => void sendDirect()} disabled={!canSend || sending || !draft.trim()}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </section>
    </div>
  )
}
