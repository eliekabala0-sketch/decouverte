import { useEffect, useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Message } from '../../../../lib/types'

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [otherName, setOtherName] = useState<string>('')
  const [accessDenied, setAccessDenied] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const flatListRef = useRef<FlatList>(null)

  const markConversationAsRead = useCallback(async () => {
    if (!id || !user?.id) return
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .neq('sender_id', user.id)
      .is('read_at', null)
  }, [id, user?.id])

  useEffect(() => {
    if (!id || !user?.id) {
      setLoading(false)
      return
    }
    const load = async () => {
      const { data: conv } = await supabase.from('conversations').select('participant_ids').eq('id', id).single()
      if (conv && Array.isArray((conv as { participant_ids: string[] }).participant_ids)) {
        const ids = (conv as { participant_ids: string[] }).participant_ids
        if (!ids.includes(user.id)) {
          setAccessDenied(true)
          setLoading(false)
          return
        }
        const otherId = ids.find((uid) => uid !== user.id)
        if (otherId) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', otherId)
            .maybeSingle()
          setOtherName((profileData as { username: string } | null)?.username ?? 'Utilisateur')
        }
      }
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })
      setMessages((data ?? []) as Message[])
      await markConversationAsRead()
      setLoading(false)
    }
    void load()

    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as Message
            if (prev.some((m) => m.id === next.id)) return prev
            return [...prev, next]
          })
          void markConversationAsRead()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, user?.id, markConversationAsRead])

  const send = async () => {
    const text = input.trim()
    if (!text || !user?.id || !id || sending || accessDenied) return
    setSending(true)
    setSendError(null)
    setInput('')
    try {
      const { data: msg, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: id,
          sender_id: user.id,
          content: text,
        })
        .select()
        .single()
      if (error) throw error
      setMessages((prev) => {
        const next = msg as Message
        if (prev.some((m) => m.id === next.id)) return prev
        return [...prev, next]
      })
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', id)
      flatListRef.current?.scrollToEnd({ animated: true })
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Envoi impossible.')
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (accessDenied) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Accès refusé à cette conversation.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Retour</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.primary }]}>Retour</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{otherName}</Text>
      </View>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMe = item.sender_id === user?.id
          return (
            <View style={[styles.bubbleWrap, isMe ? styles.bubbleMe : styles.bubbleOther]}>
              <View
                style={[
                  styles.bubble,
                  { backgroundColor: isMe ? colors.primary : colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.bubbleText, { color: isMe ? '#fff' : colors.text }]}>{item.content}</Text>
                <Text style={[styles.bubbleTime, { color: isMe ? 'rgba(255,255,255,0.8)' : colors.textMuted }]}>
                  {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          )
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>Aucun message. Envoyez le premier.</Text>
        }
      />
      {sendError ? (
        <Text style={{ color: colors.error, paddingHorizontal: 16, paddingBottom: 6 }}>{sendError}</Text>
      ) : null}
      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
          editable={!sending}
        />
        <Pressable
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          onPress={send}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendBtnText}>{sending ? '…' : 'Envoyer'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 56,
    borderBottomWidth: 1,
  },
  backBtn: { marginRight: 12 },
  backText: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  messagesList: { padding: 16, paddingBottom: 24 },
  bubbleWrap: { marginBottom: 12 },
  bubbleMe: { alignItems: 'flex-end' },
  bubbleOther: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  bubbleText: { fontSize: 15, marginBottom: 4 },
  bubbleTime: { fontSize: 11 },
  empty: { textAlign: 'center', marginTop: 24 },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
  },
  sendBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
