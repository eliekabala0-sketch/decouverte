import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@lib/supabase'
import { PageHeader } from '../components/PageHeader'
import './DashboardPage.css'

type Setting = { id: string; key: string; value: boolean | number | string }

/** Clés réellement lues par l’app mobile (ou admin FeatureGate). */
const WIRED_KEYS = new Set([
  'mode_libre_enabled',
  'mode_serieux_enabled',
  'reciprocal_matching_enabled',
  'public_publications_enabled',
  'ad_campaigns_enabled',
  'mass_messages_enabled',
  'boost_enabled',
  'reporting_enabled',
  'contact_packs_enabled',
])

const LABELS: Record<string, string> = {
  mode_libre_enabled: 'Mode Libre',
  mode_serieux_enabled: 'Mode Sérieux',
  reciprocal_matching_enabled: 'Recherche réciproque (symétrie homme/femme)',
  public_publications_enabled: 'Publications publiques',
  ad_campaigns_enabled: 'Campagnes publicitaires',
  mass_messages_enabled: 'Messages de masse',
  boost_enabled: 'Mise en avant (boost)',
  reporting_enabled: 'Signalement de profils',
  display_photos_enabled: 'Affichage photos',
  direct_contact_access_enabled: 'Accès direct contacts',
  match_required_enabled: 'Obligation de match',
  badges_enabled: 'Badges',
  profile_verification_enabled: 'Vérification profil',
  contact_packs_enabled: 'Packs contacts',
  promo_offers_enabled: 'Offres promotionnelles',
}

const HELP: Record<string, string> = {
  mode_libre_enabled: 'Masque l’entrée Mode Libre sur l’accueil app si désactivé.',
  mode_serieux_enabled: 'Masque l’entrée Mode Sérieux sur l’accueil app si désactivé.',
  reciprocal_matching_enabled:
    'Si activé : les femmes voient les hommes dans Profils ; options type boost peuvent s’aligner homme/femme. Si désactivé : comportement par défaut (homme → femmes ; femme sans miroir complet).',
  public_publications_enabled: 'Onglet Publications app + module admin ; lecture `public_publications`.',
  ad_campaigns_enabled: 'Raccourci Campagnes + écran `ad_campaigns` dans l’app.',
  mass_messages_enabled: 'Module admin + écran Annonces (`mass_messages` avec `sent_at`).',
  boost_enabled: 'Contrôle l’affichage des actions de boost / mise en avant dans Paiements (app).',
  reporting_enabled: 'Bouton signaler sur la fiche profil (app).',
  contact_packs_enabled: 'Packs contacts app + module admin.',
  display_photos_enabled: 'Non branché dans l’app actuelle (réservé).',
  direct_contact_access_enabled: 'Non branché dans l’app actuelle (réservé).',
  match_required_enabled: 'Non branché dans l’app actuelle (réservé).',
  badges_enabled: 'Non branché dans l’app actuelle (réservé).',
  profile_verification_enabled: 'Non branché dans l’app actuelle (réservé).',
  promo_offers_enabled: 'Non branché dans l’app actuelle (réservé).',
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('admin_settings').select('*')
    setSettings((data ?? []) as Setting[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { wired, other } = useMemo(() => {
    const w: Setting[] = []
    const o: Setting[] = []
    settings.forEach((s) => (WIRED_KEYS.has(s.key) ? w.push(s) : o.push(s)))
    w.sort((a, b) => a.key.localeCompare(b.key))
    o.sort((a, b) => a.key.localeCompare(b.key))
    return { wired: w, other: o }
  }, [settings])

  const toggle = async (key: string, value: boolean) => {
    await supabase.from('admin_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))
  }

  if (loading) return <div className="page-loading">Chargement...</div>

  const renderRow = (s: Setting) => {
    const isBool = typeof s.value === 'boolean'
    const wired = WIRED_KEYS.has(s.key)
    return (
      <li key={s.id} className="toggle-item">
        <div>
          <label>{LABELS[s.key] ?? s.key}</label>
          {!wired ? (
            <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
              Hors périmètre applicatif actuel — préférez ne pas supposer un effet côté utilisateur.
            </p>
          ) : HELP[s.key] ? (
            <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
              {HELP[s.key]}
            </p>
          ) : null}
        </div>
        {isBool ? (
          <input type="checkbox" checked={s.value as boolean} onChange={(e) => toggle(s.key, e.target.checked)} />
        ) : (
          <span>{String(s.value)}</span>
        )}
      </li>
    )
  }

  return (
    <div>
      <PageHeader onRefresh={load} />
      <h1 className="page-title">Paramètres dynamiques</h1>
      <p className="page-subtitle">Effet réel sur l’app pour les clés listées en premier ; le reste est conservé en base mais n’est pas relié au client mobile.</p>

      <h2 className="page-subtitle" style={{ marginTop: 24, fontSize: 18 }}>
        Branchés application / admin
      </h2>
      <ul className="toggle-list">{wired.map(renderRow)}</ul>

      <h2 className="page-subtitle" style={{ marginTop: 32, fontSize: 18 }}>
        Autres clés (base seulement)
      </h2>
      <ul className="toggle-list">{other.map(renderRow)}</ul>
    </div>
  )
}
