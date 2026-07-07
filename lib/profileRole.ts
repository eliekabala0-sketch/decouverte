/** Role admin en base (texte, cas / espaces possibles). */
export function roleIsAdmin(value: unknown, isAdminFlag?: unknown): boolean {
  if (isAdminFlag === true) return true
  if (typeof isAdminFlag === 'string' && isAdminFlag.trim().toLowerCase() === 'true') return true
  if (value == null) return false
  const role = String(value).trim().toLowerCase()
  return role === 'admin' || role === 'super_admin' || role === 'superadmin'
}

export function roleIsSuperAdmin(value: unknown): boolean {
  if (value == null) return false
  const role = String(value).trim().toLowerCase()
  return role === 'super_admin' || role === 'superadmin'
}
