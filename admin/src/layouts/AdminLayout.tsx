import { Outlet, NavLink } from 'react-router-dom'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import './AdminLayout.css'

const nav = [
  { to: '/', label: 'Tableau de bord' },
  { to: '/users', label: 'Utilisateurs' },
  { to: '/profiles', label: 'Profils' },
  { to: '/conversations', label: 'Conversations' },
  { to: '/reports', label: 'Signalements', feature: 'reporting_enabled' as const },
  { to: '/payments', label: 'Paiements' },
  { to: '/contact-packs', label: 'Packs contacts', feature: 'contact_packs_enabled' as const },
  { to: '/boosts', label: 'Mises en avant', feature: 'boost_enabled' as const },
  { to: '/publications', label: 'Publications', feature: 'public_publications_enabled' as const },
  { to: '/campaigns', label: 'Campagnes', feature: 'ad_campaigns_enabled' as const },
  { to: '/mass-messages', label: 'Messages de masse', feature: 'mass_messages_enabled' as const },
  { to: '/settings', label: 'Paramètres' },
]

export function AdminLayout({ children }: { children?: React.ReactNode }) {
  const { signOut } = useAdminAuth()
  const { loading, isEnabled } = useFeatureFlags()
  const quick = [
    { to: '/users', label: 'Utilisateurs' },
    { to: '/conversations', label: 'Conversations' },
    { to: '/settings', label: 'Paramètres' },
  ]

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h1 className="admin-logo">Découverte</h1>
          <span className="admin-badge">Admin</span>
        </div>
        <nav className="admin-nav">
          {nav
            .filter((item) => {
              if (!item.feature) return true
              if (loading) return true
              return isEnabled(item.feature)
            })
            .map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
              >
                {label}
              </NavLink>
            ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button type="button" className="secondary" onClick={() => signOut()}>
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {quick.map((q) => (
            <NavLink key={q.to} to={q.to} className="admin-nav-link" style={{ padding: '6px 10px', borderRadius: 8 }}>
              {q.label}
            </NavLink>
          ))}
        </div>
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
