import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'

type Stats = {
  profiles: number
  activeProfiles: number
  reports: number
  completedPayments: number
  packPurchases: number
  boosts: number
  publications: number
  messages: number
  conversions: number
}

export function DashboardHome() {
  const [stats, setStats] = useState<Stats>({
    profiles: 0,
    activeProfiles: 0,
    reports: 0,
    completedPayments: 0,
    packPurchases: 0,
    boosts: 0,
    publications: 0,
    messages: 0,
    conversions: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const [
        profiles,
        activeProfiles,
        reports,
        completedPayments,
        packPurchases,
        boosts,
        publications,
        messages,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('provider', 'contact_pack').eq('status', 'completed'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('provider', 'visibility_boost').eq('status', 'completed'),
        supabase.from('public_publications').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
      ])
      const paid = completedPayments.count ?? 0
      const totalProfiles = profiles.count ?? 0
      setStats({
        profiles: totalProfiles,
        activeProfiles: activeProfiles.count ?? 0,
        reports: reports.count ?? 0,
        completedPayments: paid,
        packPurchases: packPurchases.count ?? 0,
        boosts: boosts.count ?? 0,
        publications: publications.count ?? 0,
        messages: messages.count ?? 0,
        conversions: totalProfiles > 0 ? Math.round((paid / totalProfiles) * 100) : 0,
      })
      setLoading(false)
    }
    load()
  }, [])

  const cards = useMemo(
    () => [
      { label: 'Inscriptions / profils', value: stats.profiles },
      { label: 'Profils actifs', value: stats.activeProfiles },
      { label: 'Signalements en attente', value: stats.reports, tone: 'warning' },
      { label: 'Paiements reussis', value: stats.completedPayments, tone: 'success' },
      { label: 'Achats packs', value: stats.packPurchases },
      { label: 'Boosts payes', value: stats.boosts },
      { label: 'Publications actives', value: stats.publications },
      { label: 'Messages envoyes', value: stats.messages },
      { label: 'Conversion simple', value: `${stats.conversions}%`, tone: 'success' },
    ],
    [stats],
  )

  if (loading) return <div className="page-loading">Chargement des statistiques...</div>

  return (
    <div className="dashboard-home">
      <h1 className="page-title">Tableau de bord</h1>
      <p className="page-subtitle">Statistiques operationnelles et conversions simples.</p>
      <div className="stats-grid">
        {cards.map((card) => (
          <div key={card.label} className={`stat-card ${card.tone ?? ''}`}>
            <span className="stat-value">{card.value}</span>
            <span className="stat-label">{card.label}</span>
          </div>
        ))}
      </div>
      <section className="dashboard-section">
        <h2>Actions rapides</h2>
        <p className="text-secondary">
          Surveillez les signalements, achats packs, boosts, publications et messages. Les conversions sont calculees
          simplement: paiements reussis divises par le nombre de profils.
        </p>
      </section>
    </div>
  )
}
