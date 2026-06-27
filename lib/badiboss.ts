/**
 * Preparation integration paiement serveur - Decouverte.
 * Ne pas committer de cles reelles. Utiliser les variables d'environnement en production.
 */

import { PAYMENT_PROVIDER_BADIBOSS } from './constants'

export const BADIBOSS_PROVIDER = PAYMENT_PROVIDER_BADIBOSS

/** URL de base de l'API paiement, a configurer via env. */
export const BADIBOSS_API_BASE =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_PAYMENT_API_BASE
    ? process.env.EXPO_PUBLIC_PAYMENT_API_BASE
    : typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BADIBOSS_API_BASE
    ? process.env.EXPO_PUBLIC_BADIBOSS_API_BASE
    : ''

/** Webhook Supabase / Edge pour recevoir les callbacks paiement. */
export const BADIBOSS_WEBHOOK_PATH = '/api/webhooks/badiboss'

/**
 * Pour finaliser l'integration:
 * 1. Configurer l'URL publique app et la cle API cote serveur.
 * 2. Creer une route webhook qui recoit les callbacks, verifie la signature,
 *    met a jour payments et profile_access.
 * 3. Remplacer les appels simules dans payments.tsx et packs.tsx par des appels a l'API serveur.
 */
