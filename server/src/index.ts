import http from 'node:http'
import { createRequire } from 'node:module'
import cors from 'cors'
import express from 'express'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { allowedOrigins, config } from './config.js'
import { db } from './db.js'
import { createCall, endCall, joinCall } from './calls.js'
import { issueAccessToken, issueRefreshToken, refreshSession, requireAdmin, requireAuth, verifyAccessToken, verifyCredentials, type AuthedRequest } from './auth.js'
import { appEvents } from './events.js'
import { getConversation, listConversations, listMessages, markRead, sendMessage } from './conversations.js'

const require = createRequire(import.meta.url)
const rateLimit = require('express-rate-limit') as (options: Record<string, unknown>) => express.RequestHandler
const helmet = require('helmet') as () => express.RequestHandler

const app = express()
const s3 = config.S3_ENDPOINT && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY ? new S3Client({
  endpoint: config.S3_ENDPOINT, region: config.S3_REGION ?? 'auto', forcePathStyle: true,
  credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
}) : null
app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)), credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8' }))

app.get('/health', async (_request, response) => {
  await db.query('SELECT 1')
  response.json({ ok: true, database: 'mysql', timestamp: new Date().toISOString() })
})

app.get('/v1/media/:token', async (request, response) => {
  if (!s3 || !config.S3_BUCKET) return response.status(503).end()
  try {
    const key = Buffer.from(request.params.token, 'base64url').toString('utf8')
    const object = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }))
    if (object.ContentType) response.type(object.ContentType)
    response.setHeader('Cache-Control', 'public,max-age=86400')
    response.send(Buffer.from(await object.Body!.transformToByteArray()))
  } catch { response.status(404).end() }
})

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) })
app.post('/v1/auth/register', rateLimit({ windowMs: 60 * 60_000, limit: 8 }), async (request, response) => {
  const parsed = loginSchema.extend({ phone: z.string().min(8).max(40) }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_registration' })
  const id = crypto.randomUUID()
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12)
    await db.execute('INSERT INTO users (id,email,phone,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,? ,\'user\',\'active\',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))', [id, parsed.data.email.toLowerCase(), parsed.data.phone, passwordHash])
    const user = { id, email: parsed.data.email.toLowerCase(), role: 'user' }
    response.status(201).json({ user, accessToken: issueAccessToken(user), refreshToken: issueRefreshToken(user), expiresIn: 900 })
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'user_already_exists' })
    throw error
  }
})
app.post('/v1/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 10 }), async (request, response) => {
  const parsed = loginSchema.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_credentials' })
  const user = await verifyCredentials(parsed.data.email, parsed.data.password)
  if (!user) return response.status(401).json({ error: 'invalid_credentials' })
  response.json({ user, accessToken: issueAccessToken(user), refreshToken: issueRefreshToken(user), expiresIn: 900 })
})

// Pont temporaire supprimable après le cutover. GoTrue valide le jeton
// Supabase, puis notre API émet son propre JWT court.
app.post('/v1/auth/exchange', async (request, response) => {
  const sourceToken = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!sourceToken || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    return response.status(401).json({ error: 'exchange_unavailable' })
  }
  const upstream = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${sourceToken}`, apikey: config.SUPABASE_ANON_KEY },
  })
  if (!upstream.ok) return response.status(401).json({ error: 'invalid_source_session' })
  const sourceUser = await upstream.json() as { id: string }
  const [rows] = await db.query<import('mysql2').RowDataPacket[]>(
    'SELECT id, email, role, status FROM users WHERE id = ? LIMIT 1', [sourceUser.id],
  )
  const row = rows[0]
  if (!row || row.status !== 'active') return response.status(403).json({ error: 'user_not_migrated_or_inactive' })
  const user = { id: String(row.id), email: String(row.email), role: String(row.role) }
  response.json({ user, accessToken: issueAccessToken(user), expiresIn: 900 })
})

app.post('/v1/auth/refresh', async (request, response) => {
  const parsed = z.object({ refreshToken: z.string().min(1) }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_refresh_token' })
  try {
    const user = await refreshSession(parsed.data.refreshToken)
    if (!user) return response.status(401).json({ error: 'invalid_refresh_token' })
    response.json({ user, accessToken: issueAccessToken(user), refreshToken: issueRefreshToken(user), expiresIn: 900 })
  } catch {
    response.status(401).json({ error: 'invalid_refresh_token' })
  }
})

app.get('/v1/me', requireAuth, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const [[users], [profiles], [access]] = await Promise.all([
    db.query<import('mysql2').RowDataPacket[]>('SELECT id,email,phone,role,status,created_at FROM users WHERE id=? LIMIT 1', [userId]),
    db.query<import('mysql2').RowDataPacket[]>('SELECT * FROM profiles WHERE id=? LIMIT 1', [userId]),
    db.query<import('mysql2').RowDataPacket[]>('SELECT * FROM profile_access WHERE user_id=? LIMIT 1', [userId]),
  ])
  if (!users[0]) return response.status(404).json({ error: 'user_not_found' })
  response.json({ user: users[0], profile: profiles[0] ?? null, profileAccess: access[0] ?? null })
})

app.put('/v1/me/profile', requireAuth, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const parsed = z.object({
    username: z.string().trim().min(2).max(120), gender: z.string().max(16), age: z.number().int().min(18).max(120),
    city: z.string().trim().min(1).max(120), commune: z.string().trim().min(1).max(120), bio: z.string().max(5000).nullable().optional(),
    phone: z.string().max(40).nullable().optional(), mode_libre_active: z.boolean(), mode_serieux_active: z.boolean(),
  }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_profile' })
  const p = parsed.data
  await db.execute(`INSERT INTO profiles (id,phone,username,gender,age,city,commune,bio,status,is_verified,country,role,photo,boost_reason,mode_libre_active,mode_serieux_active,admin_test_reasons,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'active',0,'CD','user',NULL,NULL,?,?,'[]',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE phone=VALUES(phone),username=VALUES(username),gender=VALUES(gender),age=VALUES(age),city=VALUES(city),commune=VALUES(commune),bio=VALUES(bio),mode_libre_active=VALUES(mode_libre_active),mode_serieux_active=VALUES(mode_serieux_active),updated_at=CURRENT_TIMESTAMP(3)`, [userId, p.phone ?? null, p.username, p.gender, p.age, p.city, p.commune, p.bio ?? null, p.mode_libre_active, p.mode_serieux_active])
  const [rows] = await db.query<import('mysql2').RowDataPacket[]>('SELECT * FROM profiles WHERE id=?', [userId])
  response.json({ profile: rows[0] })
})

app.put('/v1/me/profile/photo-upload', requireAuth, express.raw({ type: 'image/*', limit: '10mb' }), async (request, response) => {
  if (!s3 || !config.S3_BUCKET || !Buffer.isBuffer(request.body)) return response.status(503).json({ error: 'media_unavailable' })
  const userId = (request as AuthedRequest).user!.id
  const extension = request.headers['content-type'] === 'image/png' ? 'png' : request.headers['content-type'] === 'image/webp' ? 'webp' : 'jpg'
  const key = `profile-media/${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`
  await s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: request.body, ContentType: request.headers['content-type'] }))
  response.status(201).json({ url: `${config.PUBLIC_API_URL}/v1/media/${Buffer.from(key).toString('base64url')}` })
})

app.get('/v1/profiles/:profileId/photos', requireAuth, async (request, response) => {
  const [rows] = await db.query<import('mysql2').RowDataPacket[]>('SELECT * FROM profile_photos WHERE user_id=? ORDER BY is_primary DESC,sort_order,created_at', [request.params.profileId])
  response.json({ data: rows })
})

app.post('/v1/me/profile/photos', requireAuth, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const parsed = z.object({ photoUrl: z.string().url(), isPrimary: z.boolean().default(false) }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_photo' })
  const id = crypto.randomUUID()
  await db.execute('INSERT INTO profile_photos (id,user_id,photo_url,is_primary,sort_order,created_at) VALUES (?,?,?,?,0,CURRENT_TIMESTAMP(3))', [id, userId, parsed.data.photoUrl, parsed.data.isPrimary])
  response.status(201).json({ id })
})

app.post('/v1/me/profile/photos/:photoId/primary', requireAuth, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query<import('mysql2').RowDataPacket[]>('SELECT photo_url FROM profile_photos WHERE id=? AND user_id=?', [request.params.photoId, userId])
    if (!rows[0]) { await connection.rollback(); return response.status(404).json({ error: 'photo_not_found' }) }
    await connection.execute('UPDATE profile_photos SET is_primary=0 WHERE user_id=?', [userId])
    await connection.execute('UPDATE profile_photos SET is_primary=1 WHERE id=? AND user_id=?', [request.params.photoId, userId])
    await connection.execute('UPDATE profiles SET photo=? WHERE id=?', [rows[0].photo_url, userId])
    await connection.commit(); response.json({ ok: true })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
})

app.get('/v1/settings', requireAuth, async (_request, response) => {
  const [rows] = await db.query<import('mysql2').RowDataPacket[]>('SELECT `key`,value FROM admin_settings')
  response.json({ data: rows })
})

app.get('/v1/publications', requireAuth, async (request, response) => {
  const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? 20)))
  const [rows] = await db.query<import('mysql2').RowDataPacket[]>(
    'SELECT * FROM public_publications WHERE is_active=1 ORDER BY is_pinned DESC,created_at DESC LIMIT ?', [limit],
  )
  response.json({ data: rows })
})

app.get('/v1/profiles/feed', requireAuth, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const page = Math.max(0, Number(request.query.page ?? 0))
  const pageSize = Math.min(50, Math.max(1, Number(request.query.pageSize ?? 20)))
  const clauses = ['status=?', 'id<>?']
  const params: unknown[] = ['active', userId]
  const mode = request.query.mode === 'serieux' ? 'mode_serieux_active' : 'mode_libre_active'
  clauses.push(`${mode}=1`)
  for (const [key, column] of [['city', 'city'], ['commune', 'commune'], ['gender', 'gender']] as const) {
    const value = String(request.query[key] ?? '').trim()
    if (value) { clauses.push(`${column}=?`); params.push(value) }
  }
  if (request.query.minAge) { clauses.push('age>=?'); params.push(Number(request.query.minAge)) }
  if (request.query.maxAge) { clauses.push('age<=?'); params.push(Number(request.query.maxAge)) }
  if (request.query.verified === 'true') clauses.push('is_verified=1')
  if (request.query.withPhoto === 'true') clauses.push("photo IS NOT NULL AND photo<>''")
  const where = clauses.join(' AND ')
  const [[count], [rows]] = await Promise.all([
    db.query<import('mysql2').RowDataPacket[]>(`SELECT COUNT(*) total FROM profiles WHERE ${where}`, params),
    db.query<import('mysql2').RowDataPacket[]>(`SELECT id,created_at,gender,city,commune,status,is_verified,username,age,mode_libre_active,mode_serieux_active,boost_reason,boosted_until,is_boosted,country,role,photo,bio FROM profiles WHERE ${where} ORDER BY is_boosted DESC,boosted_until DESC,created_at DESC LIMIT ? OFFSET ?`, [...params, pageSize, page * pageSize]),
  ])
  response.json({ profiles: rows, totalCount: Number(count[0].total) })
})

app.get('/v1/profiles/:profileId', requireAuth, async (request, response) => {
  const [rows] = await db.query<import('mysql2').RowDataPacket[]>('SELECT * FROM profiles WHERE id=? AND status=? LIMIT 1', [request.params.profileId, 'active'])
  if (!rows[0]) return response.status(404).json({ error: 'profile_not_found' })
  response.json({ profile: rows[0] })
})

app.post('/v1/conversations', requireAuth, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const parsed = z.object({ participantId: z.string().uuid() }).safeParse(request.body)
  if (!parsed.success || parsed.data.participantId === userId) return response.status(400).json({ error: 'invalid_participant' })
  const [existing] = await db.query<import('mysql2').RowDataPacket[]>(`SELECT cp1.conversation_id id FROM conversation_participants cp1 JOIN conversation_participants cp2 ON cp2.conversation_id=cp1.conversation_id AND cp2.user_id=? WHERE cp1.user_id=? LIMIT 1`, [parsed.data.participantId, userId])
  if (existing[0]) return response.json({ id: existing[0].id })
  const id = crypto.randomUUID()
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('INSERT INTO conversations (id,last_message_at,created_at) VALUES (?,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))', [id])
    await connection.execute('INSERT INTO conversation_participants (conversation_id,user_id) VALUES (?,?),(?,?)', [id, userId, id, parsed.data.participantId])
    await connection.commit()
    response.status(201).json({ id })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
})

app.post('/v1/reports', requireAuth, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const parsed = z.object({ reportedId: z.string().uuid(), type: z.string().max(80), reason: z.string().max(2000) }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_report' })
  await db.execute('INSERT INTO reports (id,reporter_id,reported_id,type,reason,status,created_at) VALUES (?,?,?,?,?,\'pending\',CURRENT_TIMESTAMP(3))', [crypto.randomUUID(), userId, parsed.data.reportedId, parsed.data.type, parsed.data.reason])
  response.status(201).json({ ok: true })
})

app.get('/v1/admin/me', requireAdmin, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const [rows] = await db.query<import('mysql2').RowDataPacket[]>('SELECT u.id,u.email,u.role,u.status,p.username,p.is_admin FROM users u LEFT JOIN profiles p ON p.id=u.id WHERE u.id=?', [userId])
  response.json({ user: rows[0] })
})

app.get('/v1/admin/users', requireAdmin, async (request, response) => {
  const limit = Math.min(500, Math.max(1, Number(request.query.limit ?? 150)))
  const [rows] = await db.query<import('mysql2').RowDataPacket[]>(`SELECT u.id,u.email,u.phone,u.role,u.status,u.created_at,p.username,p.gender,p.city,p.commune,p.is_admin FROM users u LEFT JOIN profiles p ON p.id=u.id ORDER BY FIELD(u.role,'super_admin','admin','user'),u.created_at DESC LIMIT ?`, [limit])
  response.json({ data: rows })
})

app.patch('/v1/admin/users/:userId/status', requireAdmin, async (request, response) => {
  const parsed = z.object({ status: z.enum(['active', 'suspended', 'banned']), reason: z.string().max(2000).optional() }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_status' })
  const actorId = (request as AuthedRequest).user!.id
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('UPDATE users SET status=? WHERE id=?', [parsed.data.status, request.params.userId])
    await connection.execute('UPDATE profiles SET status=? WHERE id=?', [parsed.data.status, request.params.userId])
    await connection.execute('INSERT INTO audit_events (id,actor_id,target_user_id,action,entity_type,entity_id,reason,metadata,created_at) VALUES (?,?,?,?,?,?,?,\'{}\',CURRENT_TIMESTAMP(3))', [crypto.randomUUID(), actorId, request.params.userId, `profile_${parsed.data.status}`, 'profile', request.params.userId, parsed.data.reason ?? null])
    await connection.commit(); response.json({ ok: true })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
})

app.get('/v1/notifications/counts', requireAuth, async (request, response) => {
  const userId = (request as AuthedRequest).user!.id
  const [[unread], [announcement], [publications]] = await Promise.all([
    db.query<import('mysql2').RowDataPacket[]>(`SELECT COUNT(*) total FROM messages m JOIN conversation_participants cp ON cp.conversation_id=m.conversation_id AND cp.user_id=? WHERE m.sender_id<>? AND m.read_at IS NULL`, [userId, userId]),
    db.query<import('mysql2').RowDataPacket[]>(`SELECT EXISTS(SELECT 1 FROM mass_messages m LEFT JOIN user_announcement_read_state s ON s.user_id=? WHERE m.sent_at IS NOT NULL AND m.sent_at>COALESCE(s.last_read_announcements_at,'1970-01-01') LIMIT 1) total`, [userId]),
    db.query<import('mysql2').RowDataPacket[]>(`SELECT COUNT(*) total FROM public_publications p LEFT JOIN user_publication_read_state s ON s.user_id=? WHERE p.is_active=1 AND p.created_at>COALESCE(s.last_read_publications_at,'1970-01-01')`, [userId]),
  ])
  response.json({ unreadMessages: Number(unread[0].total), announcementDot: Boolean(announcement[0].total), newPublications: Number(publications[0].total) })
})

app.post('/v1/calls', requireAuth, createCall)
app.post('/v1/calls/:callId/join', requireAuth, joinCall)
app.post('/v1/calls/:callId/end', requireAuth, endCall)
app.get('/v1/conversations', requireAuth, listConversations)
app.get('/v1/conversations/:conversationId', requireAuth, getConversation)
app.get('/v1/conversations/:conversationId/messages', requireAuth, listMessages)
app.post('/v1/conversations/:conversationId/messages', requireAuth, sendMessage)
app.post('/v1/conversations/:conversationId/read', requireAuth, markRead)

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error)
  response.status(500).json({ error: 'internal_error' })
})

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: [...allowedOrigins], credentials: true },
  transports: ['websocket'],
  pingInterval: 25_000,
  pingTimeout: 20_000,
})

if (config.REDIS_URL) {
  const publisher = createClient({ url: config.REDIS_URL })
  const subscriber = publisher.duplicate()
  await Promise.all([publisher.connect(), subscriber.connect()])
  io.adapter(createAdapter(publisher, subscriber))
}

io.use((socket, next) => {
  try {
    socket.data.user = verifyAccessToken(String(socket.handshake.auth?.token ?? ''))
    next()
  } catch {
    next(new Error('authentication_required'))
  }
})

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.user.id}`)
  socket.on('conversation:join', async (conversationId: string) => {
    const [rows] = await db.query<import('mysql2').RowDataPacket[]>(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [conversationId, socket.data.user.id],
    )
    if (rows.length) socket.join(`conversation:${conversationId}`)
  })
})

appEvents.on('call:incoming', (userId, payload) => io.to(`user:${userId}`).emit('call:incoming', payload))
appEvents.on('message:created', (conversationId, payload) => io.to(`conversation:${conversationId}`).emit('message:created', payload))

server.listen(config.PORT, '0.0.0.0', () => console.log(`Découverte API listening on ${config.PORT}`))
