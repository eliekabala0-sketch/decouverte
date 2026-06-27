import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

type ReportRow = {
  id: string
  reporter_id: string
  reported_id: string
  type: string
  reason: string
  status: string
  created_at: string
}

type ProfileLite = { id: string; username: string; status: string }

export function ReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('reports').select('*').order('created_at', { ascending: false })
    const rows = (data ?? []) as ReportRow[]
    setReports(rows)
    const ids = Array.from(new Set(rows.flatMap((r) => [r.reporter_id, r.reported_id]).filter(Boolean)))
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id,username,status').in('id', ids)
      const map: Record<string, ProfileLite> = {}
      ;((profs ?? []) as ProfileLite[]).forEach((p) => {
        map[p.id] = p
      })
      setProfiles(map)
    } else {
      setProfiles({})
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('reports').update({
      status,
      resolved_at: status !== 'pending' ? new Date().toISOString() : null,
    }).eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    setMessage('Signalement mis a jour.')
  }

  const moderateProfile = async (report: ReportRow, status: 'suspended' | 'banned') => {
    const reason = `${status === 'banned' ? 'Ban' : 'Suspension'} depuis signalement: ${report.reason || report.type || report.id}`
    const { error } = await supabase.rpc('set_profile_moderation_status', {
      p_profile_id: report.reported_id,
      p_status: status,
      p_reason: reason,
    })
    if (error) {
      setMessage(error.message || 'Moderation impossible.')
      return
    }
    await setStatus(report.id, 'resolved')
    setProfiles((prev) => ({
      ...prev,
      [report.reported_id]: { ...(prev[report.reported_id] ?? { id: report.reported_id, username: report.reported_id }), status },
    }))
    setMessage('Profil modere et action historisee.')
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="reporting_enabled">
      <div>
        <h1 className="page-title">Signalements</h1>
        <p className="page-subtitle">Moderation des signalements avec suspension ou ban audite.</p>
        {message ? <div className="dashboard-message dashboard-message-success">{message}</div> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Profil signale</th>
                <th>Signale par</th>
                <th>Type</th>
                <th>Raison</th>
                <th>Statut</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr><td colSpan={7}>Aucun signalement.</td></tr>
              ) : null}
              {reports.map((r) => {
                const target = profiles[r.reported_id]
                const reporter = profiles[r.reporter_id]
                return (
                  <tr key={r.id}>
                    <td>{target?.username ?? r.reported_id.slice(0, 8)} ({target?.status ?? '-'})</td>
                    <td>{reporter?.username ?? r.reporter_id.slice(0, 8)}</td>
                    <td>{r.type || '-'}</td>
                    <td>{r.reason || '-'}</td>
                    <td>{r.status}</td>
                    <td>{new Date(r.created_at).toLocaleString('fr-FR')}</td>
                    <td>
                      {r.status === 'pending' ? (
                        <>
                          <button type="button" onClick={() => setStatus(r.id, 'resolved')}>Resoudre</button>
                          <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={() => setStatus(r.id, 'dismissed')}>Rejeter</button>
                          <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={() => moderateProfile(r, 'suspended')}>Suspendre profil</button>
                          <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={() => moderateProfile(r, 'banned')}>Bannir profil</button>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
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
