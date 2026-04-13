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
  const [boostOffersText, setBoostOffersText] = useState('[]')
  const [boostOffers, setBoostOffers] = useState<Array<{ id: string; label: string; days: number; amount: number; active: boolean }>>([])
  const [savingOffers, setSavingOffers] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('admin_settings').select('*')
    setSettings((data ?? []) as Setting[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const current = settings.find((s) => s.key === 'visibility_boost_offers')
    if (!current || !Array.isArray(current.value)) return
    const parsed = (current.value as unknown[])
      .map((x, i) => {
        const r = x as { id?: unknown; label?: unknown; days?: unknown; amount?: unknown; active?: unknown }
        const days = Number(r.days)
        const amount = Number(r.amount)
        if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(amount) || amount < 0) return null
        return {
          id: typeof r.id === 'string' && r.id.trim() ? r.id : `offer_${i + 1}`,
          label: typeof r.label === 'string' ? r.label : `${days} jours`,
          days,
          amount,
          active: typeof r.active === 'boolean' ? r.active : true,
        }
      })
      .filter(Boolean) as Array<{ id: string; label: string; days: number; amount: number; active: boolean }>
    setBoostOffers(parsed)
    setBoostOffersText(JSON.stringify(parsed, null, 2))
  }, [settings])

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

  const saveBoostOffers = async () => {
    const normalized = boostOffers
      .map((r) => ({
        id: r.id.trim() || `offer_${Math.random().toString(36).slice(2, 7)}`,
        label: r.label.trim() || `${r.days} jours`,
        days: Number(r.days),
        amount: Number(r.amount),
        active: !!r.active,
      }))
      .filter((r) => Number.isFinite(r.days) && r.days > 0 && Number.isFinite(r.amount) && r.amount >= 0)
    if (normalized.length === 0) {
      alert('Aucune offre valide.')
      return
    }
    setSavingOffers(true)
    const { error } = await supabase
      .from('admin_settings')
      .upsert(
        { key: 'visibility_boost_offers', value: normalized, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
    setSavingOffers(false)
    if (error) {
      alert(`Erreur enregistrement offres boost: ${error.message}`)
      return
    }
    setBoostOffersText(JSON.stringify(normalized, null, 2))
    await load()
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

      <section className="dashboard-section" style={{ marginTop: 28 }}>
        <h2>Offres boost (effet immédiat côté app)</h2>
        <p className="text-secondary" style={{ marginTop: 6 }}>Prix/durée modifiables sans redéploiement. Les offres inactives restent en historique mais ne s’affichent plus côté app.</p>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Libellé</th>
                <th>Durée (jours)</th>
                <th>Prix (USD)</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {boostOffers.map((o, idx) => (
                <tr key={`${o.id}-${idx}`}>
                  <td><input value={o.id} onChange={(e) => setBoostOffers((prev) => prev.map((x, i) => i === idx ? { ...x, id: e.target.value } : x))} /></td>
                  <td><input value={o.label} onChange={(e) => setBoostOffers((prev) => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} /></td>
                  <td><input type="number" min={1} value={o.days} onChange={(e) => setBoostOffers((prev) => prev.map((x, i) => i === idx ? { ...x, days: Number(e.target.value) } : x))} /></td>
                  <td><input type="number" min={0} step="0.01" value={o.amount} onChange={(e) => setBoostOffers((prev) => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))} /></td>
                  <td><input type="checkbox" checked={o.active} onChange={(e) => setBoostOffers((prev) => prev.map((x, i) => i === idx ? { ...x, active: e.target.checked } : x))} /></td>
                  <td><button type="button" className="secondary" onClick={() => setBoostOffers((prev) => prev.filter((_, i) => i !== idx))}>Retirer</button></td>
                </tr>
              ))}
              {boostOffers.length === 0 ? (
                <tr><td colSpan={6}>Aucune offre.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setBoostOffers((prev) => [...prev, { id: `offer_${Date.now()}`, label: 'Nouvelle offre', days: 7, amount: 9.99, active: true }])}
          >
            Ajouter une offre
          </button>
          <button type="button" onClick={() => void saveBoostOffers()} disabled={savingOffers}>
            {savingOffers ? 'Enregistrement…' : 'Enregistrer les offres boost'}
          </button>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary>JSON généré (debug)</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{boostOffersText}</pre>
        </details>
      </section>
    </div>
  )
}
