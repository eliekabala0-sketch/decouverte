import { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Conversation } from '../../../lib/types'
import { remainingContacts } from '../../../lib/access'

type ConversationWithOther = Conversation & {
  otherUserId: string
  otherDisplayName: string
  lastContent?: string
  unreadCount: number
}

export default function MessagesScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { user, profile, profileAccess } = useAuth()
  const [conversations, setConversations] = useState<ConversationWithOther[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const contactsLeft = remainingContacts(profileAccess)

  const loadConversations = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    setLoadError(null)
    try {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .contains('participant_ids', [user.id])
        .order('last_message_at', { ascending: false })
      if (convError) throw convError
      const convs = (convData ?? []) as Conversation[]
      const ids = convs.map((c) => c.id)
      const others = convs
        .map((c) => c.participant_ids?.find((id) => id !== user.id))
        .filter(Boolean) as string[]

      const { data: profData } = others.length
        ? await supabase.from('profiles').select('id,username').in('id', others)
        : { data: [] as unknown[] }
      const profileMap = new Map<string, string>()
      ;((profData ?? []) as { id: string; username: string }[]).forEach((p) => profileMap.set(p.id, p.username))

      const { data: msgData } = ids.length
        ? await supabase
            .from('messages')
            .select('id,conversation_id,content,created_at,sender_id,read_at')
            .in('conversation_id', ids)
            .order('created_at', { ascending: false })
        : { data: [] as unknown[] }

      const grouped = new Map<string, { last?: string; unread: number }>()
      ;((msgData ?? []) as { conversation_id: string; content: string; sender_id: string; read_at?: string | null }[]).forEach((m) => {
        const g = grouped.get(m.conversation_id) ?? { unread: 0 }
        if (g.last === undefined) g.last = m.content
        if (m.sender_id !== user.id && !m.read_at) g.unread += 1
        grouped.set(m.conversation_id, g)
      })

      const withOther: ConversationWithOther[] = convs
        .map((c) => {
          const otherId = c.participant_ids?.find((id) => id !== user.id)
          if (!otherId) return null
          const g = grouped.get(c.id)
          return {
            ...c,
            otherUserId: otherId,
            otherDisplayName: profileMap.get(otherId) ?? 'Utilisateur',
            lastContent: g?.last,
            unreadCount: g?.unread ?? 0,
          }
        })
        .filter(Boolean) as ConversationWithOther[]

      setConversations(withOther)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadConversations()
    if (!user?.id) return
    const channel = supabase
      .channel(`messages-list:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void loadConversations()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, refreshKey, loadConversations])

  const onRefresh = () => {
    setLoading(true)
    setLoadError(null)
    setRefreshKey((k) => k + 1)
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (loadError) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.empty, { color: colors.textMuted }]}>{loadError}</Text>
        <Pressable
          onPress={() => { setLoadError(null); setLoading(true); setRefreshKey((k) => k + 1); }}
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Messages</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {contactsLeft >= 0 ? `Contacts restants : ${contactsLeft}` : 'Conversations — débloquez des contacts depuis un profil'}
      </Text>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={() => router.push({ pathname: '/(app)/conversation/[id]', params: { id: item.id } })}
          >
            <View style={styles.rowContent}>
              <Text style={[styles.rowName, { color: colors.text }]}>{item.otherDisplayName}</Text>
              <Text style={[styles.rowPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.lastContent ?? 'Aucun message'}
              </Text>
              {item.unreadCount > 0 ? (
                <Text style={[styles.unread, { color: colors.primary }]}>{item.unreadCount} nouveau(x)</Text>
              ) : null}
            </View>
            <Text style={[styles.rowDate, { color: colors.textMuted }]}>
              {new Date(item.last_message_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            Aucune conversation. Débloquez un contact depuis un profil pour envoyer un message.
          </Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 56 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { marginTop: 8, marginBottom: 20 },
  listContent: { paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  rowContent: { flex: 1, marginRight: 12 },
  rowName: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  rowPreview: { fontSize: 14 },
  unread: { fontSize: 12, marginTop: 4, fontWeight: '700' },
  rowDate: { fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 48, paddingHorizontal: 24 },
  retryBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignSelf: 'center' },
  retryText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
})
