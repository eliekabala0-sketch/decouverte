/**
 * Identifiants email factices pour auth mot de passe Supabase (GoTrue valide le format via checkmail).
 * - tel_*@decouverte.auth → 400 « Unable to validate email address »
 * - tel_*@example.com → peut être refusé par la config hébergée Supabase (email_address_invalid)
 *
 * Défaut gmail.com : identifiant technique seulement (pas une vraie boîte). Surcharge possible via
 * EXPO_PUBLIC_SYNTHETIC_EMAIL_DOMAIN (Expo injecte process.env au build).
 */

function envSyntheticDomain(): string {
  try {
    const env = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env
    const v = env?.EXPO_PUBLIC_SYNTHETIC_EMAIL_DOMAIN?.trim()
    if (v && v.includes('.')) return v
  } catch {
    /* ignore */
  }
  return ''
}

/** Domaine pour la partie après @ (doit être accepté par ton projet Supabase). */
export const SYNTHETIC_AUTH_EMAIL_DOMAIN = envSyntheticDomain() || 'gmail.com'

const LEGACY_SYNTHETIC_DOMAIN = 'decouverte.auth'

/** Inscription : une seule forme canonique (nouveaux comptes). */
export function syntheticEmailForSignUp(digitsOnly: string): string {
  return `tel_${digitsOnly}@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`
}

/**
 * Connexion : domaine actuel, puis anciens (example.com, decouverte.auth).
 */
export function syntheticEmailsForSignIn(phone: string): string[] {
  const digitsOnly = phone.replace(/\D/g, '')
  const cleanedNoSpaces = phone.replace(/\s/g, '')
  return Array.from(
    new Set([
      syntheticEmailForSignUp(digitsOnly),
      `tel_${digitsOnly}@example.com`,
      `tel_${digitsOnly}@${LEGACY_SYNTHETIC_DOMAIN}`,
      `${cleanedNoSpaces}@${LEGACY_SYNTHETIC_DOMAIN}`,
    ])
  )
}
