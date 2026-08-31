import 'dotenv/config'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import mysql from 'mysql2/promise'

const dumpPath = process.argv[2]
const targetUrl = process.env.MYSQL_URL
if (!dumpPath || !targetUrl) throw new Error('Usage: npm run db:migrate:dump -- <dump.sql>; MYSQL_URL is required')

const wanted = new Set([
  'auth.users', 'public.profiles', 'public.profile_access', 'public.profile_photos',
  'public.profile_access_entitlements', 'public.profile_access_events', 'public.contact_packs',
  'public.payments', 'public.payment_events', 'public.user_credit_balances', 'public.user_subscriptions',
  'public.conversations', 'public.messages', 'public.public_publications', 'public.ad_campaigns',
  'public.reports', 'public.blocked_profiles', 'public.mass_messages', 'public.admin_settings',
  'public.user_announcement_read_state', 'public.user_publication_read_state', 'public.audit_events',
  'public.app_settings', 'public.matches', 'public.subscriptions',
])
const arrayJsonColumns = new Set(['profiles.admin_test_reasons', 'mass_messages.target_filters', 'mass_messages.preview_user_ids'])
const my = await mysql.createConnection({ uri: targetUrl, timezone: 'Z', multipleStatements: true })
const targetColumns = new Map<string, Set<string>>()
const dateColumns = new Set<string>()
const booleanColumns = new Set<string>()
const counts = new Map<string, number>()
const runId = crypto.randomUUID()

async function ensureColumn(table: string, column: string, definition: string) {
  const [rows] = await my.query<mysql.RowDataPacket[]>(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
    [table, column],
  )
  if (!rows.length) await my.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
}

async function ensureTombstoneUser(userId: string | null, createdAt: string | null) {
  if (!userId) return
  const timestamp = mysqlDate(createdAt) ?? '1970-01-01 00:00:00.000'
  await my.execute(
    "INSERT IGNORE INTO users (id,email,password_hash,role,status,created_at,updated_at) VALUES (?,CONCAT('deleted+',?,'@invalid.local'),'','user','deleted',?,?)",
    [userId, userId, timestamp, timestamp],
  )
}

async function ensureTombstoneProfile(userId: string | null, createdAt: string | null) {
  if (!userId) return
  await ensureTombstoneUser(userId, createdAt)
  const timestamp = mysqlDate(createdAt) ?? '1970-01-01 00:00:00.000'
  await my.execute(
    "INSERT IGNORE INTO profiles (id,gender,city,username,age,status,admin_test_reasons,created_at,updated_at) VALUES (?,'unknown','',CONCAT('deleted-',LEFT(?,8)),1,'deleted','[]',?,?)",
    [userId, userId, timestamp, timestamp],
  )
}

function decodeCopy(value: string): string | null {
  if (value === String.raw`\N`) return null
  return value.replace(/\\([btnrfv\\])/g, (_match, code: string) => ({
    b: '\b', t: '\t', n: '\n', r: '\r', f: '\f', v: '\v', '\\': '\\',
  }[code] ?? code))
}

function parsePgArray(value: string | null) {
  if (!value || value === '{}') return []
  return value.slice(1, -1).match(/(?:"(?:\\.|[^"])*"|[^,])+/g)?.map((item) =>
    item.replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
  ) ?? []
}

function mysqlDate(value: string | null) {
  if (!value) return value
  const normalized = value.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) throw new Error(`Date PostgreSQL invalide: ${value}`)
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

async function columnsFor(table: string) {
  let columns = targetColumns.get(table)
  if (!columns) {
    const [rows] = await my.query<mysql.RowDataPacket[]>(
      'SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table],
    )
    columns = new Set(rows.map((row) => String(row.COLUMN_NAME)))
    for (const row of rows) if (['date', 'datetime', 'timestamp'].includes(String(row.DATA_TYPE))) dateColumns.add(`${table}.${row.COLUMN_NAME}`)
    for (const row of rows) if (String(row.COLUMN_TYPE) === 'tinyint(1)') booleanColumns.add(`${table}.${row.COLUMN_NAME}`)
    targetColumns.set(table, columns)
  }
  return columns
}

async function upsert(table: string, row: Record<string, string | null>) {
  const target = await columnsFor(table)
  const ignored = table === 'conversations' ? new Set(['participant_ids']) : new Set<string>()
  const unmapped = Object.entries(row).filter(([key, value]) => value != null && !target.has(key) && !ignored.has(key))
  if (unmapped.length) throw new Error(`${table}: colonnes non mappees: ${unmapped.map(([key]) => key).join(', ')}`)
  const entries = Object.entries(row).filter(([key]) => target.has(key)).map(([key, raw]) => {
    const value = arrayJsonColumns.has(`${table}.${key}`)
      ? JSON.stringify(parsePgArray(raw))
      : dateColumns.has(`${table}.${key}`) ? mysqlDate(raw)
        : booleanColumns.has(`${table}.${key}`) && raw != null ? (raw === 't' ? '1' : '0') : raw
    return [key, value] as const
  })
  const names = entries.map(([key]) => `\`${key}\``).join(',')
  const updates = entries.filter(([key]) => key !== 'id' && key !== 'user_id').map(([key]) => `\`${key}\`=VALUES(\`${key}\`)`).join(',')
  await my.execute(
    `INSERT INTO \`${table}\` (${names}) VALUES (${entries.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${updates || `${entries[0][0]}=${entries[0][0]}`}`,
    entries.map(([, value]) => value),
  )
}

try {
  const schema = await fsp.readFile(path.resolve('sql/001_mysql_schema.sql'), 'utf8')
  await my.query(schema)
  for (const [table, column, definition] of [
    ['profiles', 'looking_for', 'VARCHAR(80) NULL'], ['profiles', 'subscription_status', 'VARCHAR(80) NULL'],
    ['profile_access', 'id', 'CHAR(36) NULL'], ['profile_access', 'profiles_access', 'BOOLEAN NULL'],
    ['profile_access', 'created_at', 'DATETIME(3) NULL'], ['messages', 'sender', 'CHAR(36) NULL'],
    ['messages', 'receiver', 'CHAR(36) NULL'], ['reports', 'reported_user_id', 'CHAR(36) NULL'],
    ['reports', 'details', 'TEXT NULL'],
  ]) await ensureColumn(table, column, definition)
  await my.execute("INSERT INTO migration_runs (id,source,started_at,status) VALUES (?,'supabase-backup',CURRENT_TIMESTAMP(3),'running')", [runId])
  const input = readline.createInterface({ input: fs.createReadStream(dumpPath), crlfDelay: Infinity })
  let sourceTable: string | null = null
  let columns: string[] = []
  for await (const line of input) {
    if (!sourceTable) {
      const match = line.match(/^COPY (auth\.users|public\.[a-z0-9_]+) \((.+)\) FROM stdin;$/)
      if (match && wanted.has(match[1])) { sourceTable = match[1]; columns = match[2].split(', ') }
      continue
    }
    if (line === String.raw`\.`) { sourceTable = null; columns = []; continue }
    const values = line.split('\t').map(decodeCopy)
    if (values.length !== columns.length) throw new Error(`${sourceTable}: ligne COPY invalide`)
    const source = Object.fromEntries(columns.map((column, index) => [column, values[index]]))
    const table = sourceTable === 'auth.users' ? 'users' : sourceTable.slice(7)
    if (sourceTable === 'auth.users') {
      await upsert('users', {
        id: source.id, email: source.email?.toLowerCase() ?? null, phone: source.phone,
        password_hash: source.encrypted_password ?? '', role: 'user', status: source.deleted_at ? 'deleted' : 'active',
        email_confirmed_at: source.email_confirmed_at, last_sign_in_at: source.last_sign_in_at,
        created_at: source.created_at, updated_at: source.updated_at,
      })
    } else {
      if (table === 'profile_access_entitlements') {
        await ensureTombstoneUser(source.user_id, source.created_at)
        await ensureTombstoneProfile(source.target_profile_id, source.created_at)
      }
      await upsert(table, source)
      if (table === 'conversations') for (const userId of parsePgArray(source.participant_ids)) {
        const joinedAt = mysqlDate(source.created_at)
        await ensureTombstoneUser(userId, source.created_at)
        await my.execute('INSERT INTO conversation_participants (conversation_id,user_id,joined_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)', [source.id, userId, mysqlDate(source.created_at)])
      }
    }
    counts.set(table, (counts.get(table) ?? 0) + 1)
  }
  await my.execute(`UPDATE users u JOIN profiles p ON p.id=u.id SET u.role=COALESCE(NULLIF(p.role,''),'user'), u.status=CASE WHEN p.status IN ('suspended','banned','deleted') THEN p.status ELSE 'active' END`)
  const targetSnapshot: Record<string, number> = {}
  for (const [table, sourceCount] of counts) {
    const [rows] = await my.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS total FROM \`${table}\``)
    const targetCount = Number(rows[0].total)
    targetSnapshot[table] = targetCount
    if (targetCount < sourceCount) throw new Error(`${table}: verification echouee (${targetCount}/${sourceCount})`)
  }
  const sourceSnapshot = Object.fromEntries(counts)
  await my.execute(
    "UPDATE migration_runs SET completed_at=CURRENT_TIMESTAMP(3),status='verified',source_snapshot=?,target_snapshot=? WHERE id=?",
    [JSON.stringify(sourceSnapshot), JSON.stringify(targetSnapshot), runId],
  )
  console.log(JSON.stringify({ runId, verified: true, source: sourceSnapshot, target: targetSnapshot }))
} catch (error) {
  await my.execute("UPDATE migration_runs SET completed_at=CURRENT_TIMESTAMP(3),status='failed',error_text=? WHERE id=?", [String(error), runId]).catch(() => {})
  throw error
} finally {
  await my.end()
}
