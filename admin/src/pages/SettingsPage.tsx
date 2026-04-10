import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabase'
import './DashboardPage.css'

type Setting = { id: string; key: string; value: boolean | number | string }

const LABELS: Record<string, string> = {
  mode_libre_enabled: 'Mode Libre',
  mode_serieux_enabled: 'Mode Sérieux',
  reciprocal_matching_enabled: 'Recherche réciproque (femmes voient aussi les hommes)',
  public_publications_enabled: 'Publications publiques',
  ad_campaigns_enabled: 'Campagnes publicitaires',
  mass_messages_enabled: 'Messages de masse',
  boost_enabled: 'Mise en avant',
  reporting_enabled: 'Signalement',
  display_photos_enabled: 'Affichage photos',
  direct_contact_access_enabled: 'Accès direct contacts',
  match_required_enabled: 'Obligation de match',
  badges_enabled: 'Badges',
  profile_verification_enabled: 'Vérification profil',
  contact_packs_enabled: 'Packs contacts',
  promo_offers_enabled: 'Offres promotionnelles',
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('admin_settings').select('*')
      setSettings((data ?? []) as Setting[])
      setLoading(false)
    }
    load()
  }, [])

  const toggle = async (key: string, value: boolean) => {
    await supabase.from('admin_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  return (
    <div>
      <h1 className="page-title">Paramètres dynamiques</h1>
      <p className="page-subtitle">Activer/désactiver des fonctionnalités sans toucher au code.</p>
      <ul className="toggle-list">
        {settings.map((s) => {
          const isBool = typeof s.value === 'boolean'
          return (
            <li key={s.id} className="toggle-item">
              <label>{LABELS[s.key] ?? s.key}</label>
              {isBool ? (
                <input
                  type="checkbox"
                  checked={s.value as boolean}
                  onChange={(e) => toggle(s.key, e.target.checked)}
                />
              ) : (
                <span>{String(s.value)}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
