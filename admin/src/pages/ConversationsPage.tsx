import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'

type Conv = { id: string; participant_ids: string[]; last_message_at: string; created_at: string }

export function ConversationsPage() {
  const [conversations, setConversations] = useState<Conv[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false })
      setConversations((data ?? []) as Conv[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <div>
      <h1 className="page-title">Conversations</h1>
      <p className="page-subtitle">Voir les conversations (lecture seule).</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Participants</th>
              <th>Dernier message</th>
            </tr>
          </thead>
          <tbody>
            {conversations.length === 0 && (
              <tr><td colSpan={3}>Aucune conversation.</td></tr>
            )}
            {conversations.map((c) => (
              <tr key={c.id}>
                <td><code>{c.id.slice(0, 8)}…</code></td>
                <td>{c.participant_ids?.length ?? 0} participant(s)</td>
                <td>{c.last_message_at ? new Date(c.last_message_at).toLocaleString('fr-FR') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
