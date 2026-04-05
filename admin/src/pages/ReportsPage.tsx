import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'
import { FeatureGate } from '../components/FeatureGate'

type ReportRow = { id: string; reporter_id: string; reported_id: string; type: string; reason: string; status: string; created_at: string }

export function ReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('reports').select('*').order('created_at', { ascending: false })
      setReports((data ?? []) as ReportRow[])
      setLoading(false)
    }
    load()
  }, [])

  const setStatus = async (id: string, status: string) => {
    await supabase.from('reports').update({
      status,
      resolved_at: status !== 'pending' ? new Date().toISOString() : null,
    }).eq('id', id)
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <FeatureGate feature="reporting_enabled">
      <div>
        <h1 className="page-title">Signalements</h1>
        <p className="page-subtitle">Modérer les signalements.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Raison</th>
                <th>Statut</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 && (
                <tr><td colSpan={5}>Aucun signalement.</td></tr>
              )}
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.type || '—'}</td>
                  <td>{r.reason || '—'}</td>
                  <td>{r.status}</td>
                  <td>{new Date(r.created_at).toLocaleString('fr-FR')}</td>
                  <td>
                    {r.status === 'pending' && (
                      <>
                        <button type="button" onClick={() => setStatus(r.id, 'resolved')}>Résoudre</button>
                        <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={() => setStatus(r.id, 'dismissed')}>Rejeter</button>
                      </>
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
