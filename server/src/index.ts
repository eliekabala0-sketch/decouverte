import http from 'node:http'
import { createRequire } from 'node:module'
import cors from 'cors'
import express from 'express'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { z } from 'zod'
import { allowedOrigins, config } from './config.js'
import { db } from './db.js'
import { createCall, endCall, joinCall } from './calls.js'
import { issueAccessToken, issueRefreshToken, refreshSession, requireAuth, verifyAccessToken, verifyCredentials, type AuthedRequest } from './auth.js'
import { appEvents } from './events.js'
import { getConversation, listConversations, listMessages, markRead, sendMessage } from './conversations.js'

const require = createRequire(import.meta.url)
const rateLimit = require('express-rate-limit') as (options: Record<string, unknown>) => express.RequestHandler
const helmet = require('helmet') as () => express.RequestHandler

const app = express()
app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)), credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8' }))

app.get('/health', async (_request, response) => {
  await db.query('SELECT 1')
  response.json({ ok: true, database: 'mysql', timestamp: new Date().toISOString() })
})

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) })
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
