/**
 * Constantes partagées - Découverte
 *
 * Règles métier :
 * - Homme (M) : accès profils/photos conditionné par paiement.
 * - Femme (F) : inscription libre.
 * - Paiement 1 = accès profils 30 jours (PROFILES_ACCESS_DAYS).
 * - Paiement 2 = packs contacts, quotas modifiables par l'admin (DEFAULT_CONTACT_QUOTAS).
 * - Moteur paiement prévu : Badiboss Pay.
 */

export const APP_NAME = 'Découverte'

/** Genre(s) pour lesquels l'accès aux profils/photos est conditionné par un paiement (paiement 1). */
export const GENDER_REQUIRES_PROFILES_ACCESS_PAYMENT: readonly string[] = ['M']

/** Moteur de paiement prévu (Badiboss Pay). */
export const PAYMENT_PROVIDER_BADIBOSS = 'badiboss_pay' as const

/** Devise unique pour tous les prix (packs, paiements, boosts). */
export const DEFAULT_CURRENCY = 'USD' as const

export const MODES = {
  libre: { label: 'Mode Libre', key: 'mode_libre' },
  serieux: { label: 'Mode Sérieux', key: 'mode_serieux' },
} as const

export const SERIEUX_INTENTIONS = [
  { value: 'amitie', label: 'Amitié' },
  { value: 'copinage', label: 'Copinage' },
  { value: 'amour', label: 'Amour' },
  { value: 'mariage', label: 'Mariage' },
] as const

export const GENDER_LABELS: Record<string, string> = {
  M: 'Homme',
  F: 'Femme',
  other: 'Autre',
}

export const CITIES_RDC = [
  'Kinshasa', 'Lubumbashi', 'Mbuji-Mayi', 'Kananga', 'Kisangani',
  'Bukavu', 'Goma', 'Matadi', 'Kolwezi', 'Likasi', 'Autre',
]

export const COMMUNES_KINSHASA = [
  'Barumbu', 'Bumbu', 'Gombe', 'Kalamu', 'Kasa-Vubu', 'Kimbanseke',
  'Kinshasa', 'Kisenso', 'Lemba', 'Limete', 'Lingwala', 'Makala',
  'Maluku', 'Masina I', 'Masina II', 'Matete', 'Mont Ngafula',
  'Ndjili', 'Ngaba', 'Ngaliema', 'Ngiri-Ngiri', 'Selembao', 'Autre',
]

export const DEFAULT_CONTACT_QUOTAS = [1, 3, 5, 10]
/** Longueur minimale du mot de passe à l'inscription. */
export const MIN_PASSWORD_LENGTH = 6
/** Chiffres minimum dans le numéro (hors espaces) : au-delà du seul indicatif +243. */
export const MIN_PHONE_DIGITS_SIGNUP = 10
/** Durée en jours de l'accès profils/photos après paiement 1. */
export const PROFILES_ACCESS_DAYS = 30

/** Discrimine les paiements boost via public.payments.provider. */
export const PAYMENT_PROVIDER_VISIBILITY_BOOST = 'visibility_boost' as const

/** Offres mise en avant (boost) : durée + prix USD. */
export const VISIBILITY_BOOST_TIERS = [
  { days: 7, label: '7 jours', amount: 9.99 },
  { days: 14, label: '14 jours', amount: 17.99 },
  { days: 30, label: '30 jours', amount: 29.99 },
] as const
