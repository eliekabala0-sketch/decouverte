import { Routes, Route, Navigate } from 'react-router-dom'
import { AdminLayout } from './layouts/AdminLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardHome } from './pages/DashboardHome'
import { UsersPage } from './pages/UsersPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { ConversationsPage } from './pages/ConversationsPage'
import { ConversationDetailPage } from './pages/ConversationDetailPage'
import { ReportsPage } from './pages/ReportsPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { ContactPacksPage } from './pages/ContactPacksPage'
import { BoostsPage } from './pages/BoostsPage'
import { SettingsPage } from './pages/SettingsPage'
import { PublicationsPage } from './pages/PublicationsPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { MassMessagesPage } from './pages/MassMessagesPage'
import { UserDetailPage } from './pages/UserDetailPage'
import { useAdminAuth } from './contexts/AdminAuthContext'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, loading, authError } = useAdminAuth()
  if (loading) {
    return (
      <div className="fullscreen center">
        <p>Chargement du tableau de bord…</p>
        <p className="text-secondary" style={{ fontSize: '0.9rem', marginTop: 8 }}>
          Si cet écran reste bloqué plus de ~20 s, vérifiez la console (F12) et la connexion à Supabase.
        </p>
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ authError }} />
  if (!isAdmin) return <Navigate to="/login" replace state={{ authError }} />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Routes>
                <Route path="/" element={<DashboardHome />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="users/:userId" element={<UserDetailPage />} />
                <Route path="profiles" element={<ProfilesPage />} />
                <Route path="conversations" element={<ConversationsPage />} />
                <Route path="conversations/:id" element={<ConversationDetailPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="contact-packs" element={<ContactPacksPage />} />
                <Route path="boosts" element={<BoostsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="publications" element={<PublicationsPage />} />
                <Route path="campaigns" element={<CampaignsPage />} />
                <Route path="mass-messages" element={<MassMessagesPage />} />
              </Routes>
            </AdminLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
