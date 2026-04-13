import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { supabase } from '@/lib/supabase'
import { MODES } from '../../../lib/constants'
import type { PublicPublication } from '../../../lib/types'

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const { profile, user } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const [announcementDot, setAnnouncementDot] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [newPublications, setNewPublications] = useState(0)
  const [recentPublications, setRecentPublications] = useState<PublicPublication[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const previousCountersRef = useRef({ msg: 0, pub: 0 })

  const modeLibre = isOn('mode_libre_enabled')
  const modeSerieux = isOn('mode_serieux_enabled')
  const massOn = isOn('mass_messages_enabled')
  const campaignsOn = isOn('ad_campaigns_enabled')
  const pubsOn = isOn('public_publications_enabled')
  const packsOn = isOn('contact_packs_enabled')
  const reciprocal = isOn('reciprocal_matching_enabled')
  const boostOn = isOn('boost_enabled')
  const showPacksQuickLink =
    packsOn && profile && (profile.gender === 'M' || (profile.gender === 'F' && reciprocal))
  const showBoostQuickLink = boostOn && profile?.gender === 'F' && !reciprocal

  const runMassMessageDot = async () => {
    if (!user?.id || !massOn) {
      setAnnouncementDot(false)
      return
    }
    const { data: last } = await supabase
      .from('mass_messages')
      .select('sent_at')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data: st } = await supabase
      .from('user_announcement_read_state')
      .select('last_read_announcements_at')
      .eq('user_id', user.id)
      .maybeSingle()
    const lr = (st as { last_read_announcements_at?: string } | null)?.last_read_announcements_at ?? '1970-01-01T00:00:00Z'
    const sent = (last as { sent_at?: string } | null)?.sent_at
    setAnnouncementDot(!!sent && new Date(sent) > new Date(lr))
  }

  const runUnreadMessages = async () => {
    if (!user?.id) {
      setUnreadMessages(0)
      return
    }
    const { data: convData } = await supabase
      .from('conversations')
      .select('id')
      .contains('participant_ids', [user.id])
    const ids = ((convData ?? []) as { id: string }[]).map((c) => c.id)
    if (ids.length === 0) {
      setUnreadMessages(0)
      return
    }
    const { count } = await supabase
      .from('messages')
      .select('id', { head: true, count: 'exact' })
      .in('conversation_id', ids)
      .neq('sender_id', user.id)
      .is('read_at', null)
    setUnreadMessages(count ?? 0)
  }

  const runPublicationsState = async () => {
    if (!pubsOn) {
      setRecentPublications([])
      setNewPublications(0)
      return
    }
    const { data: recent } = await supabase
      .from('public_publications')
      .select('*')
      .eq('is_active', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3)
    setRecentPublications((recent ?? []) as PublicPublication[])
    if (!user?.id) return
    const { data: st } = await supabase
      .from('user_publication_read_state')
      .select('last_read_publications_at')
      .eq('user_id', user.id)
      .maybeSingle()
    const lastRead = (st as { last_read_publications_at?: string } | null)?.last_read_publications_at ?? '1970-01-01T00:00:00Z'
    const { count } = await supabase
      .from('public_publications')
      .select('id', { head: true, count: 'exact' })
      .eq('is_active', true)
      .gt('created_at', lastRead)
    setNewPublications(count ?? 0)
  }

  const refreshAll = async () => {
    setRefreshing(true)
    try {
      await Promise.all([runMassMessageDot(), runUnreadMessages(), runPublicationsState()])
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void refreshAll()
  }, [user?.id, massOn, pubsOn])

  useEffect(() => {
    if (!user?.id) return
    const convChannel = supabase
      .channel(`home-msg:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void runUnreadMessages()
      })
      .subscribe()
    const pubChannel = supabase
      .channel('home-pubs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'public_publications' }, () => {
        void runPublicationsState()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(pubChannel)
    }
  }, [user?.id, pubsOn])

  useEffect(() => {
    if (unreadMessages > previousCountersRef.current.msg || newPublications > previousCountersRef.current.pub) {
      // Signal visuel fort : les compteurs changent instantanément sur l'accueil.
    }
    previousCountersRef.current = { msg: unreadMessages, pub: newPublications }
  }, [unreadMessages, newPublications])

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshAll()} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={[styles.greeting, { color: colors.textSecondary }]}>
          Bonjour{profile?.username ? `, ${profile.username}` : ''}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>Choisissez votre mode</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Explorez les profils selon votre intention
        </Text>
      </View>

      <View style={styles.cards}>
        {modeLibre ? (
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/profiles', params: { mode: 'libre' } })}
            style={({ pressed }) => [
              styles.modeCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                opacity: pressed ? 0.95 : 1,
              },
            ]}
          >
            <View style={[styles.modeIcon, { backgroundColor: colors.accentSoft }]}>
              <Text style={{ fontSize: 32 }}>✨</Text>
            </View>
            <Text style={[styles.modeTitle, { color: colors.text }]}>{MODES.libre.label}</Text>
            <Text style={[styles.modeDesc, { color: colors.textSecondary }]}>
              Rencontres libres, en toute transparence
            </Text>
          </Pressable>
        ) : null}

        {modeSerieux ? (
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/profiles', params: { mode: 'serieux' } })}
            style={({ pressed }) => [
              styles.modeCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                opacity: pressed ? 0.95 : 1,
              },
            ]}
          >
            <View style={[styles.modeIcon, { backgroundColor: colors.primarySoft }]}>
              <Text style={{ fontSize: 32 }}>💝</Text>
            </View>
            <Text style={[styles.modeTitle, { color: colors.text }]}>{MODES.serieux.label}</Text>
            <Text style={[styles.modeDesc, { color: colors.textSecondary }]}>
              Amitié, amour, mariage — une intention claire
            </Text>
          </Pressable>
        ) : null}

        {!modeLibre && !modeSerieux ? (
          <Text style={[styles.modeDesc, { color: colors.textMuted }]}>Les deux modes sont désactivés côté administration.</Text>
        ) : null}
      </View>

      <View style={styles.quickLinks}>
        {massOn ? (
          <Pressable
            onPress={() => router.push('/(app)/announcements')}
            style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
          >
            <Text style={styles.linkEmoji}>📢</Text>
            <Text style={[styles.linkTitle, { color: colors.text }]}>
              Annonces{announcementDot ? ' ●' : ''}
            </Text>
            <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Messages de l'équipe</Text>
          </Pressable>
        ) : null}
        {campaignsOn ? (
          <Pressable
            onPress={() => router.push('/(app)/campaigns')}
            style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
          >
            <Text style={styles.linkEmoji}>🎯</Text>
            <Text style={[styles.linkTitle, { color: colors.text }]}>Campagnes</Text>
            <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Annonces et offres</Text>
          </Pressable>
        ) : null}
        {showPacksQuickLink ? (
          <Pressable
            onPress={() => router.push('/(app)/packs')}
            style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
          >
            <Text style={styles.linkEmoji}>💬</Text>
            <Text style={[styles.linkTitle, { color: colors.text }]}>Packs contacts</Text>
            <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Débloquer des échanges</Text>
          </Pressable>
        ) : null}
        {showBoostQuickLink ? (
          <Pressable
            onPress={() => router.push('/(app)/payments')}
            style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
          >
            <Text style={styles.linkEmoji}>⭐</Text>
            <Text style={[styles.linkTitle, { color: colors.text }]}>Mise en avant</Text>
            <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Booster votre visibilité</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push('/(app)/messages')}
          style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
        >
          <Text style={styles.linkEmoji}>✉️</Text>
          <Text style={[styles.linkTitle, { color: colors.text }]}>
            Messages {unreadMessages > 0 ? `(${unreadMessages})` : ''}
          </Text>
          <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
            {unreadMessages > 0 ? 'Nouveaux messages non lus' : 'Aucun nouveau message'}
          </Text>
        </Pressable>
        {pubsOn ? (
          <Pressable
            onPress={() => router.push('/(app)/publications')}
            style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
          >
            <Text style={styles.linkEmoji}>📰</Text>
            <Text style={[styles.linkTitle, { color: colors.text }]}>
              Publications {newPublications > 0 ? `(${newPublications} nouvelles)` : ''}
            </Text>
            <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Flux public récent</Text>
          </Pressable>
        ) : null}
      </View>
      {pubsOn ? (
        <View style={styles.recentSection}>
          <Text style={[styles.recentTitle, { color: colors.text }]}>Publications récentes</Text>
          {recentPublications.length === 0 ? (
            <Text style={[styles.modeDesc, { color: colors.textMuted }]}>Aucune publication récente pour le moment.</Text>
          ) : (
            recentPublications.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push('/(app)/publications')}
                style={[styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {p.image_url ? <Image source={{ uri: p.image_url }} style={styles.recentMedia} resizeMode="cover" /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recentCardTitle, { color: colors.text }]} numberOfLines={1}>{p.title}</Text>
                  <Text style={[styles.linkSub, { color: colors.textSecondary }]} numberOfLines={2}>{p.content}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  greeting: { fontSize: 15, marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16 },
  cards: { gap: 20 },
  modeCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
  },
  modeIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modeTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  modeDesc: { fontSize: 15 },
  quickLinks: { marginTop: 32, gap: 12 },
  linkCard: {
    padding: 18,
    borderRadius: 16,
  },
  linkEmoji: { fontSize: 24, marginBottom: 6 },
  linkTitle: { fontSize: 17, fontWeight: '600' },
  linkSub: { fontSize: 14, marginTop: 2 },
  recentSection: { marginTop: 24, gap: 10 },
  recentTitle: { fontSize: 18, fontWeight: '700' },
  recentCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  recentMedia: { width: 70, height: 70, borderRadius: 10 },
  recentCardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
})
