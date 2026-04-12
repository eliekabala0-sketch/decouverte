import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import type { Profile } from '@shared/types'
import { GENDER_LABELS } from '@shared/constants'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setProfiles((data ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateStatus = async (id: string, status: 'active' | 'suspended' | 'banned') => {
    await supabase.from('profiles').update({ status }).eq('id', id)
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <div>
      <PageHeader onRefresh={load} />
      <h1 className="page-title">Profils</h1>
      <p className="page-subtitle">Voir, modifier, suspendre, bannir ou restaurer les profils.</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pseudo</th>
              <th>Sexe</th>
              <th>Ville / Commune</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && (
              <tr><td colSpan={5}>Aucun profil.</td></tr>
            )}
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.username}</td>
                <td>{GENDER_LABELS[p.gender] ?? p.gender}</td>
                <td>{p.city}, {p.commune}</td>
                <td>{p.status}</td>
                <td>
                  {p.status === 'active' && (
                    <>
                      <button type="button" className="secondary" onClick={() => updateStatus(p.id, 'suspended')}>Suspendre</button>
                      <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={() => updateStatus(p.id, 'banned')}>Bannir</button>
                    </>
                  )}
                  {(p.status === 'suspended' || p.status === 'banned') && (
                    <button type="button" onClick={() => updateStatus(p.id, 'active')}>Restaurer</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
