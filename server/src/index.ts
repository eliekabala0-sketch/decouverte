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
import { issueAccessToken, issueRefreshToken, refreshSession, requireAuth, verifyAccessToken, verifyCredentials } from './auth.js'
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
