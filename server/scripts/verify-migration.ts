import 'dotenv/config'
import { Client as PostgresClient } from 'pg'
import mysql from 'mysql2/promise'

const sourceUrl = process.env.SUPABASE_DATABASE_URL
const targetUrl = process.env.MYSQL_URL
if (!sourceUrl || !targetUrl) throw new Error('SUPABASE_DATABASE_URL and MYSQL_URL are required')
const pg = new PostgresClient({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } })
const my = await mysql.createConnection({ uri: targetUrl, timezone: 'Z' })
const tables = ['users', 'profiles', 'profile_access', 'profile_photos', 'profile_access_entitlements', 'profile_access_events', 'contact_packs', 'payments', 'payment_events', 'user_credit_balances', 'user_subscriptions', 'conversations', 'messages', 'public_publications', 'ad_campaigns', 'reports', 'blocked_profiles', 'mass_messages', 'admin_settings', 'user_announcement_read_state', 'user_publication_read_state', 'audit_events']
let failed = false

try {
  await pg.connect()
  for (const table of tables) {
    const sourceTable = table === 'users' ? 'auth.users' : `public.${table}`
    const sourceWhere = table === 'users' ? ' WHERE deleted_at IS NULL' : ''
    const source = await pg.query(`SELECT count(*)::bigint AS count FROM ${sourceTable}${sourceWhere}`)
    const [targetRows] = await my.query<mysql.RowDataPacket[]>(`SELECT count(*) AS count FROM \`${table}\``)
    const sourceCount = Number(source.rows[0].count)
    const targetCount = Number(targetRows[0].count)
    const ok = sourceCount === targetCount
    console.log(`${ok ? 'OK' : 'ECHEC'} ${table}: Supabase=${sourceCount} MySQL=${targetCount}`)
    if (!ok) failed = true
  }

  const sourceOrphans = await pg.query(`SELECT count(*)::bigint AS count FROM public.messages m LEFT JOIN public.conversations c ON c.id=m.conversation_id WHERE c.id IS NULL`)
  const [targetOrphans] = await my.query<mysql.RowDataPacket[]>('SELECT count(*) AS count FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id WHERE c.id IS NULL')
  if (Number(sourceOrphans.rows[0].count) !== Number(targetOrphans[0].count)) failed = true
  if (failed) throw new Error('Verification echouee: aucun cutover ne doit etre effectue')
  console.log('Verification reussie. Les comptages concordent; effectuer ensuite un test fonctionnel en lecture seule.')
} finally {
  await pg.end().catch(() => {})
  await my.end()
}
