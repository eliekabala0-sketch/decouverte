import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'

const PAGE_SIZE = 150

type Conv = { id: string; participant_ids: string[]; last_message_at: string; created_at: string }

export function ConversationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const filterUserId = searchParams.get('user_id')
  const [conversations, setConversations] = useState<Conv[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setError(null)
      let query = supabase
        .from('conversations')
        .select('id,participant_ids,last_message_at,created_at')
        .order('last_message_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (filterUserId) query = query.contains('participant_ids', [filterUserId])
      const { data, error } = await query
      if (error) {
        setError(error.message)
        setConversations([])
      } else {
        setConversations((data ?? []) as Conv[])
      }
      setLoading(false)
    }
    void load()
  }, [filterUserId])

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <div>
      <h1 className="page-title">Conversations</h1>
      <p className="page-subtitle">
        Voir les conversations et ouvrir le détail. {filterUserId ? `Filtre utilisateur: ${filterUserId}` : ''}
      </p>
      {error ? <div className="dashboard-message dashboard-message-error" role="alert">{error}</div> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Participants</th>
              <th>Dernier message</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {conversations.length === 0 && (
              <tr><td colSpan={4}>Aucune conversation.</td></tr>
            )}
            {conversations.map((c) => (
              <tr key={c.id}>
                <td><code>{c.id.slice(0, 8)}…</code></td>
                <td>{c.participant_ids?.length ?? 0} participant(s)</td>
                <td>{c.last_message_at ? new Date(c.last_message_at).toLocaleString('fr-FR') : '—'}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => navigate(`/conversations/${encodeURIComponent(c.id)}`)}>
                    Ouvrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
