/**
 * Logique métier d'accès - Découverte
 * Homme : accès complet si all_profiles_access ou quota photo ; femme : toujours.
 */

import type { Gender, ProfileAccess } from './types'

export function remainingContacts(profileAccess: ProfileAccess | null): number {
  if (!profileAccess) return 0
  return Math.max(0, (profileAccess.contact_quota ?? 0) - (profileAccess.contact_quota_used ?? 0))
}

export function canUnlockContact(profileAccess: ProfileAccess | null): boolean {
  return remainingContacts(profileAccess) > 0
}

export function canViewFullProfiles(
  viewerGender: Gender | string | undefined,
  profileAccess: ProfileAccess | null
): boolean {
  if (viewerGender === 'F') {
    // Confidentialité renforcée: les femmes ne voient pas automatiquement les photos.
    // L'accès passe aussi par les droits pack/quotas.
  }
  if (!profileAccess) return false
  if (profileAccess.all_profiles_access) return true

  const quota = profileAccess.photo_quota ?? 0
  const used = profileAccess.photo_quota_used ?? 0
  return quota > used
}
