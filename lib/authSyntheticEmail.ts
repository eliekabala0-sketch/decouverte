/**
 * Identifiants email factices pour auth mot de passe Supabase (GoTrue valide le format via checkmail).
 * tel_*@decouverte.auth provoque un 400 « Unable to validate email address » en production.
 */

/** Domaine accepté par validateEmail côté serveur (RFC / bibliothèque checkmail). */
export const SYNTHETIC_AUTH_EMAIL_DOMAIN = 'example.com'

const LEGACY_SYNTHETIC_DOMAIN = 'decouverte.auth'

/** Inscription : une seule forme canonique (nouveaux comptes). */
export function syntheticEmailForSignUp(digitsOnly: string): string {
  return `tel_${digitsOnly}@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`
}

/**
 * Connexion : essayer le domaine actuel puis l’ancien (comptes déjà créés avec decouverte.auth).
 */
export function syntheticEmailsForSignIn(phone: string): string[] {
  const digitsOnly = phone.replace(/\D/g, '')
  const cleanedNoSpaces = phone.replace(/\s/g, '')
  return Array.from(
    new Set([
      syntheticEmailForSignUp(digitsOnly),
      `tel_${digitsOnly}@${LEGACY_SYNTHETIC_DOMAIN}`,
      `${cleanedNoSpaces}@${LEGACY_SYNTHETIC_DOMAIN}`,
    ])
  )
}
