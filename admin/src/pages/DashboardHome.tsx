import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'

export function DashboardHome() {
  const [stats, setStats] = useState({
    profiles: 0,
    users: 0,
    reports: 0,
    payments: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const [p, r, pay] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      ])
      setStats({
        profiles: p.count ?? 0,
        users: p.count ?? 0,
        reports: r.count ?? 0,
        payments: pay.count ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="page-loading">Chargement des statistiques...</div>

  return (
    <div className="dashboard-home">
      <h1 className="page-title">Tableau de bord</h1>
      <p className="page-subtitle">Vue d'ensemble et statistiques globales</p>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats.profiles}</span>
          <span className="stat-label">Profils</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.users}</span>
          <span className="stat-label">Utilisateurs</span>
        </div>
        <div className="stat-card warning">
          <span className="stat-value">{stats.reports}</span>
          <span className="stat-label">Signalements en attente</span>
        </div>
        <div className="stat-card success">
          <span className="stat-value">{stats.payments}</span>
          <span className="stat-label">Paiements réussis</span>
        </div>
      </div>
      <section className="dashboard-section">
        <h2>Actions rapides</h2>
        <p className="text-secondary">
          Utilisez le menu pour gérer les utilisateurs, profils, conversations, signalements,
          paiements, packs contacts, mises en avant, publications, campagnes, messages de masse
          et les paramètres dynamiques.
        </p>
      </section>
    </div>
  )
}
