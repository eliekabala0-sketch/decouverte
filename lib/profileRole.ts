/** Rôle admin en base (texte, cas / espaces possibles). */
export function roleIsAdmin(value: unknown): boolean {
  if (value == null) return false
  return String(value).trim().toLowerCase() === 'admin'
}
