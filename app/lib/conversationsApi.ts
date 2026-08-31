import { io, type Socket } from 'socket.io-client'
import { apiAccessToken, apiBaseUrl, apiRequest } from './api'
import type { Message } from '../../lib/types'

export const mysqlApiEnabled = apiBaseUrl.length > 0

export async function getApiConversation(id: string) {
  return apiRequest<{ data: { id: string; other_user_id: string; other_display_name: string } }>(`/v1/conversations/${id}`)
}

export async function getApiMessages(id: string) {
  return apiRequest<{ data: Message[] }>(`/v1/conversations/${id}/messages?limit=100`)
}

export async function sendApiMessage(id: string, content: string) {
  return apiRequest<{ data: Message }>(`/v1/conversations/${id}/messages`, {
    method: 'POST', body: JSON.stringify({ content }),
  })
}

export async function markApiConversationRead(id: string) {
  return apiRequest<void>(`/v1/conversations/${id}/read`, { method: 'POST' })
}

export async function listApiConversations() {
  return apiRequest<{ data: Array<{
    id: string; created_at: string; last_message_at: string; other_user_id: string;
    other_display_name: string; last_content?: string; unread_count: number
  }> }>('/v1/conversations?limit=100')
}

export async function subscribeApiConversation(id: string, onMessage: (message: Message) => void): Promise<Socket> {
  const token = await apiAccessToken()
  const socket = io(apiBaseUrl, { transports: ['websocket'], auth: { token } })
  socket.on('connect', () => socket.emit('conversation:join', id))
  socket.on('message:created', onMessage)
  return socket
}
