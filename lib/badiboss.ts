/**
 * Préparation intégration Badiboss Pay — Découverte
 * Ne pas commiter de clés réelles. Utiliser les variables d'environnement en production.
 */

import { PAYMENT_PROVIDER_BADIBOSS } from './constants'

export const BADIBOSS_PROVIDER = PAYMENT_PROVIDER_BADIBOSS

/** URL de base de l'API Badiboss Pay (à configurer via env). */
export const BADIBOSS_API_BASE =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BADIBOSS_API_BASE
    ? process.env.EXPO_PUBLIC_BADIBOSS_API_BASE
    : ''

/** Webhook Supabase / Edge pour recevoir les callbacks Badiboss (à configurer). */
export const BADIBOSS_WEBHOOK_PATH = '/api/webhooks/badiboss'

/**
 * Pour finaliser l'intégration :
 * 1. Configurer EXPO_PUBLIC_BADIBOSS_API_BASE (app) et clé API côté serveur.
 * 2. Créer une route webhook (Supabase Edge ou backend) qui reçoit les callbacks,
 *    vérifie la signature, met à jour payments et profile_access (contact_quota ou profiles_access_until).
 * 3. Remplacer les appels simulés dans payments.tsx et packs.tsx par des appels à l'API Badiboss.
 */
