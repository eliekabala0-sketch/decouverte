import { supabase } from '@/lib/supabase'

export async function markConversationRead(conversationId: string): Promise<number> {
  const { data, error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  })
  if (error) throw new Error(error.message || 'Lecture conversation impossible.')
  return Number(data ?? 0)
}
