import { useFeatureFlags, type FeatureKey } from '../hooks/useFeatureFlags'

export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: FeatureKey
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { loading, isEnabled } = useFeatureFlags()
  if (loading) return <div className="page-loading">Chargement...</div>
  if (!isEnabled(feature)) {
    return (
      <div className="dashboard-section">
        <h2>Module désactivé</h2>
        <p className="text-secondary">
          Cette fonctionnalité est désactivée dans les paramètres dynamiques.
        </p>
        {fallback}
      </div>
    )
  }
  return <>{children}</>
}

