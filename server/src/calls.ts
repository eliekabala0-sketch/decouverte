import { AccessToken } from 'livekit-server-sdk'
import type { Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { config } from './config.js'
import { db, one, transaction } from './db.js'
import type { AuthedRequest } from './auth.js'
import { appEvents } from './events.js'

const requestSchema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(['audio', 'video']),
})

type ParticipantRow = RowDataPacket & { allowed: number }

async function ensureParticipant(userId: string, conversationId: string) {
  const row = await one<ParticipantRow>(
    'SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?) AS allowed',
    [conversationId, userId],
  )
  if (!row?.allowed) throw new Error('conversation_access_denied')
}

export async function createCall(request: AuthedRequest, response: Response) {
  const parsed = requestSchema.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_call_request' })
  if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) {
    return response.status(503).json({ error: 'calls_not_configured' })
  }

  const user = request.user!
  await ensureParticipant(user.id, parsed.data.conversationId)
  const room = `conversation-${parsed.data.conversationId}`
  const callId = crypto.randomUUID()

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO call_sessions (id, conversation_id, initiated_by, kind, room_name, status)
       VALUES (?, ?, ?, ?, ?, 'ringing')`,
      [callId, parsed.data.conversationId, user.id, parsed.data.kind, room],
    )
    await connection.execute(
      `INSERT INTO call_participants (call_id, user_id, joined_at)
       VALUES (?, ?, CURRENT_TIMESTAMP(3))`,
      [callId, user.id],
    )
  })

  const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: user.id,
    name: user.email,
    ttl: '10m',
  })
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true })

  const [participants] = await db.query<(RowDataPacket & { user_id: string })[]>(
    'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id <> ?',
    [parsed.data.conversationId, user.id],
  )
  for (const participant of participants) {
    appEvents.emit('call:incoming', participant.user_id, {
      callId, conversationId: parsed.data.conversationId, kind: parsed.data.kind, fromUserId: user.id,
    })
  }

  response.status(201).json({
    callId,
    kind: parsed.data.kind,
    room,
    url: config.LIVEKIT_URL,
    token: await token.toJwt(),
  })
}

export async function joinCall(request: AuthedRequest, response: Response) {
  if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) {
    return response.status(503).json({ error: 'calls_not_configured' })
  }
  const callId = String(request.params.callId)
  const [rows] = await db.query<(RowDataPacket & { conversation_id: string; room_name: string; kind: string; status: string })[]>(
    'SELECT conversation_id, room_name, kind, status FROM call_sessions WHERE id = ? LIMIT 1',
    [callId],
  )
  const call = rows[0]
  if (!call || call.status === 'ended' || call.status === 'missed') return response.status(404).json({ error: 'call_unavailable' })
  await ensureParticipant(request.user!.id, call.conversation_id)
  await db.execute(
    `INSERT INTO call_participants (call_id, user_id, joined_at) VALUES (?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE joined_at = COALESCE(joined_at, VALUES(joined_at))`,
    [callId, request.user!.id],
  )
  await db.execute("UPDATE call_sessions SET status = 'active', started_at = COALESCE(started_at, CURRENT_TIMESTAMP(3)) WHERE id = ?", [callId])
  const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, { identity: request.user!.id, ttl: '10m' })
  token.addGrant({ room: call.room_name, roomJoin: true, canPublish: true, canSubscribe: true })
  response.json({ callId, kind: call.kind, room: call.room_name, url: config.LIVEKIT_URL, token: await token.toJwt() })
}

export async function endCall(request: AuthedRequest, response: Response) {
  const callId = String(request.params.callId)
  await db.execute(
    `UPDATE call_sessions cs
     JOIN conversation_participants cp ON cp.conversation_id = cs.conversation_id
     SET cs.status = 'ended', cs.ended_at = CURRENT_TIMESTAMP(3)
     WHERE cs.id = ? AND cp.user_id = ?`,
    [callId, request.user!.id],
  )
  await db.execute('UPDATE call_participants SET left_at = CURRENT_TIMESTAMP(3) WHERE call_id = ? AND user_id = ?', [callId, request.user!.id])
  response.status(204).end()
}
