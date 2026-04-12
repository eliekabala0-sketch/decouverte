/**
 * Visibilité « boost » en listes : priorité à boosted_until si présent (fin d’effet),
 * sinon boost_reason non vide (données historiques, rétrocompat).
 */

export function isProfileBoostedForListing(p: {
  boost_reason?: string | null
  boosted_until?: string | null
}): boolean {
  const until = p.boosted_until?.trim()
  if (until) {
    const t = new Date(until).getTime()
    if (!Number.isNaN(t)) return t > Date.now()
  }
  return !!p.boost_reason?.trim()
}

/** Prolonge à partir de max(now, boosted_until) pour ne pas raccourcir une campagne en cours. */
export function extendBoostedUntil(
  profile: { boosted_until?: string | null },
  durationDays: number
): string {
  const now = Date.now()
  let baseMs = now
  const cur = profile.boosted_until?.trim()
  if (cur) {
    const t = new Date(cur).getTime()
    if (!Number.isNaN(t) && t > now) baseMs = t
  }
  return new Date(baseMs + durationDays * 24 * 60 * 60 * 1000).toISOString()
}

export function formatBoostStatusLabel(p: {
  boost_reason?: string | null
  boosted_until?: string | null
}): string {
  const until = p.boosted_until?.trim()
  if (until) {
    const t = new Date(until).getTime()
    if (!Number.isNaN(t) && t > Date.now()) {
      return `actif jusqu’au ${new Date(t).toLocaleDateString('fr-FR')}`
    }
    return 'expiré'
  }
  if (p.boost_reason?.trim()) return 'actif (ancienne formule)'
  return 'inactif'
}
