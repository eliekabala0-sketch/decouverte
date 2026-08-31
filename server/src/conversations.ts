import type { Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import type { AuthedRequest } from './auth.js'
import { db, transaction } from './db.js'
import { appEvents } from './events.js'

async function participant(userId: string, conversationId: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [conversationId, userId],
  )
  return rows.length > 0
}

export async function listConversations(request: AuthedRequest, response: Response) {
  const limit = Math.min(Math.max(Number(request.query.limit) || 30, 1), 100)
  const before = typeof request.query.before === 'string' ? request.query.before : null
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.id, c.created_at, c.last_message_at,
            other.user_id AS other_user_id, p.username AS other_display_name,
            lm.content AS last_content,
            (SELECT COUNT(*) FROM messages unread
             WHERE unread.conversation_id=c.id AND unread.sender_id<>? AND unread.read_at IS NULL) AS unread_count
     FROM conversation_participants mine
     JOIN conversations c ON c.id=mine.conversation_id
     JOIN conversation_participants other ON other.conversation_id=c.id AND other.user_id<>mine.user_id
     LEFT JOIN profiles p ON p.id=other.user_id
     LEFT JOIN messages lm ON lm.id=(SELECT m2.id FROM messages m2 WHERE m2.conversation_id=c.id ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1)
     WHERE mine.user_id=? AND (? IS NULL OR c.last_message_at < ?)
     ORDER BY c.last_message_at DESC, c.id DESC LIMIT ?`,
    [request.user!.id, request.user!.id, before, before, limit],
  )
  response.json({ data: rows, nextCursor: rows.length === limit ? rows[rows.length - 1].last_message_at : null })
}

export async function getConversation(request: AuthedRequest, response: Response) {
  const conversationId = String(request.params.conversationId)
  if (!(await participant(request.user!.id, conversationId))) return response.status(403).json({ error: 'conversation_access_denied' })
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.id, c.created_at, c.last_message_at, other.user_id AS other_user_id,
            COALESCE(p.username, 'Utilisateur') AS other_display_name
     FROM conversations c
     JOIN conversation_participants mine ON mine.conversation_id=c.id AND mine.user_id=?
     JOIN conversation_participants other ON other.conversation_id=c.id AND other.user_id<>?
     LEFT JOIN profiles p ON p.id=other.user_id WHERE c.id=? LIMIT 1`,
    [request.user!.id, request.user!.id, conversationId],
  )
  response.json({ data: rows[0] })
}

export async function listMessages(request: AuthedRequest, response: Response) {
  const conversationId = String(request.params.conversationId)
  if (!(await participant(request.user!.id, conversationId))) return response.status(403).json({ error: 'conversation_access_denied' })
  const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 100)
  const before = typeof request.query.before === 'string' ? request.query.before : null
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, conversation_id, sender_id, content, message_type, media_url, created_at, read_at
     FROM messages WHERE conversation_id=? AND deleted_at IS NULL AND (? IS NULL OR created_at < ?)
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    [conversationId, before, before, limit],
  )
  rows.reverse()
  response.json({ data: rows, nextCursor: rows.length === limit ? rows[0].created_at : null })
}

const messageSchema = z.object({ content: z.string().trim().min(1).max(2000) })

export async function sendMessage(request: AuthedRequest, response: Response) {
  const conversationId = String(request.params.conversationId)
  const parsed = messageSchema.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'invalid_message' })
  if (!(await participant(request.user!.id, conversationId))) return response.status(403).json({ error: 'conversation_access_denied' })
  const id = crypto.randomUUID()
  const createdAt = new Date()
  await transaction(async (connection) => {
    await connection.execute(
      'INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, conversationId, request.user!.id, parsed.data.content, createdAt],
    )
    await connection.execute('UPDATE conversations SET last_message_at=? WHERE id=?', [createdAt, conversationId])
  })
  const message = { id, conversation_id: conversationId, sender_id: request.user!.id, content: parsed.data.content, created_at: createdAt.toISOString(), read_at: null }
  appEvents.emit('message:created', conversationId, message)
  response.status(201).json({ data: message })
}

export async function markRead(request: AuthedRequest, response: Response) {
  const conversationId = String(request.params.conversationId)
  if (!(await participant(request.user!.id, conversationId))) return response.status(403).json({ error: 'conversation_access_denied' })
  await transaction(async (connection) => {
    await connection.execute(
      'UPDATE messages SET read_at=CURRENT_TIMESTAMP(3) WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL',
      [conversationId, request.user!.id],
    )
    await connection.execute(
      'UPDATE conversation_participants SET last_read_at=CURRENT_TIMESTAMP(3) WHERE conversation_id=? AND user_id=?',
      [conversationId, request.user!.id],
    )
  })
  response.status(204).end()
}
