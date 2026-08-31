import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Client as PostgresClient } from 'pg'
import mysql from 'mysql2/promise'

const sourceUrl = process.env.SUPABASE_DATABASE_URL
const targetUrl = process.env.MYSQL_URL
if (!sourceUrl || !targetUrl) throw new Error('SUPABASE_DATABASE_URL and MYSQL_URL are required')

const pg = new PostgresClient({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } })
const my = await mysql.createConnection({ uri: targetUrl, timezone: 'Z', multipleStatements: true })
const runId = crypto.randomUUID()

const publicTables = [
  'profiles', 'profile_access', 'profile_photos', 'profile_access_entitlements', 'profile_access_events', 'contact_packs',
  'payments', 'payment_events', 'user_credit_balances', 'user_subscriptions', 'conversations', 'messages',
  'public_publications', 'ad_campaigns', 'reports', 'blocked_profiles', 'mass_messages', 'admin_settings',
  'user_announcement_read_state', 'user_publication_read_state', 'audit_events',
] as const

const targetColumns = new Map<string, Set<string>>()
const jsonColumns = new Set([
  'profile_access_entitlements.metadata', 'profile_access_events.metadata', 'payments.metadata',
  'payment_events.payload', 'user_subscriptions.metadata', 'admin_settings.value', 'audit_events.metadata',
  'profiles.admin_test_reasons', 'mass_messages.target_filters', 'mass_messages.preview_user_ids',
])

function jsonValue(table: string, column: string, value: unknown) {
  if (value == null) return value
  if (jsonColumns.has(`${table}.${column}`)) return JSON.stringify(value)
  if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date))) return JSON.stringify(value)
  return value
}

async function upsert(table: string, row: Record<string, unknown>) {
  let columns = targetColumns.get(table)
  if (!columns) {
    const [rows] = await my.query<mysql.RowDataPacket[]>(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table],
    )
    columns = new Set(rows.map((item) => String(item.COLUMN_NAME)))
    targetColumns.set(table, columns)
  }
  const ignored = table === 'conversations' ? new Set(['participant_ids']) : new Set<string>()
  const unmapped = Object.entries(row).filter(([key, value]) => !columns!.has(key) && !ignored.has(key) && value != null)
  if (unmapped.length) throw new Error(`${table}: colonnes non mappees avec donnees: ${unmapped.map(([key]) => key).join(', ')}`)
  const entries = Object.entries(row).filter(([key]) => columns!.has(key))
  const columnSql = entries.map(([key]) => `\`${key}\``).join(',')
  const placeholders = entries.map(() => '?').join(',')
  const updates = entries.filter(([key]) => key !== 'id' && key !== 'user_id').map(([key]) => `\`${key}\`=VALUES(\`${key}\`)`).join(',')
  await my.execute(
    `INSERT INTO \`${table}\` (${columnSql}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates || `${entries[0][0]}=${entries[0][0]}`}`,
    entries.map(([column, value]) => jsonValue(table, column, value) ?? null) as Array<string | number | boolean | Date | Buffer | null>,
  )
}

try {
  await pg.connect()
  const schema = await fs.readFile(path.resolve('sql/001_mysql_schema.sql'), 'utf8')
  await my.query(schema)
  await my.execute(
    "INSERT INTO migration_runs (id, source, started_at, status) VALUES (?, 'supabase', CURRENT_TIMESTAMP(3), 'running')",
    [runId],
  )

  // Conserver les UUID et les hashes bcrypt de GoTrue permet aux utilisateurs de
  // garder leur mot de passe. Aucune réinitialisation massive n'est nécessaire.
  const authUsers = await pg.query(`
    SELECT u.id::text, lower(u.email) AS email, u.phone, coalesce(u.encrypted_password, '') AS password_hash,
           COALESCE(p.role, 'user') AS role,
           CASE WHEN p.status IN ('suspended','banned','deleted') THEN p.status ELSE 'active' END AS status,
           u.email_confirmed_at, u.last_sign_in_at, u.created_at, u.updated_at
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.deleted_at IS NULL
  `)
  for (const row of authUsers.rows) await upsert('users', row)

  for (const table of publicTables) {
    const result = await pg.query(`SELECT * FROM public.${table} ORDER BY 1`)
    for (const row of result.rows) {
      await upsert(table, row)
      if (table === 'conversations') {
        for (const userId of row.participant_ids ?? []) {
          await my.execute(
            `INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
             VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)`,
            [row.id, userId, row.created_at],
          )
        }
      }
    }
    console.log(`${table}: ${result.rowCount ?? 0}`)
  }
  await my.execute("UPDATE migration_runs SET completed_at=CURRENT_TIMESTAMP(3), status='verified' WHERE id=?", [runId])
  console.log(`Migration ${runId} terminee. Executez npm run db:verify avant tout cutover.`)
} catch (error) {
  await my.execute("UPDATE migration_runs SET completed_at=CURRENT_TIMESTAMP(3), status='failed', error_text=? WHERE id=?", [String(error), runId]).catch(() => {})
  throw error
} finally {
  await pg.end().catch(() => {})
  await my.end()
}
