import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, Image, Pressable, ActivityIndicator, Linking } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { supabase } from '@/lib/supabase'
import { canViewFullProfiles, remainingContacts } from '../../../lib/access'
import type { MassMessage, ProfileAccess } from '../../../lib/types'

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

function matchesSegment(
  msg: MassMessage,
  profile: { gender: string; city: string; commune: string | null; age?: number | null; is_verified?: boolean | null; mode_libre_active?: boolean | null; mode_serieux_active?: boolean | null; boosted_until?: string | null; is_boosted?: boolean | null } | null,
  profileAccess: ProfileAccess | null,
): boolean {
  if (!profile) return msg.segment === 'all'
  const gender = normalizeGender(profile.gender)
  const filters = (msg.target_filters ?? {}) as { min_age?: number; max_age?: number }
  if (filters.min_age && (profile.age ?? 0) < filters.min_age) return false
  if (filters.max_age && (profile.age ?? 0) > filters.max_age) return false
  if (msg.segment === 'all') return true
  if (msg.segment === 'men' && gender === 'M') return true
  if (msg.segment === 'women' && gender === 'F') return true
  if (msg.segment === 'paying') {
    const hasAccess = canViewFullProfiles(gender, profileAccess) || remainingContacts(profileAccess) > 0
    return !!hasAccess
  }
  if (msg.segment === 'non_paying') {
    const hasAccess = canViewFullProfiles(gender, profileAccess) || remainingContacts(profileAccess) > 0
    return !hasAccess
  }
  if (msg.segment === 'city' && msg.segment_value) return profile.city === msg.segment_value
  if (msg.segment === 'commune' && msg.segment_value) return (profile.commune ?? '') === msg.segment_value
  if (msg.segment === 'mode_libre') return !!profile.mode_libre_active
  if (msg.segment === 'mode_serieux') return !!profile.mode_serieux_active
  if (msg.segment === 'verified') return !!profile.is_verified
  if (msg.segment === 'unverified') return !profile.is_verified
  if (msg.segment === 'boosted') return !!profile.is_boosted || (!!profile.boosted_until && new Date(profile.boosted_until) > new Date())
  if (msg.segment === 'with_pack') return canViewFullProfiles(gender, profileAccess) || remainingContacts(profileAccess) > 0
  if (msg.segment === 'without_pack') return !(canViewFullProfiles(gender, profileAccess) || remainingContacts(profileAccess) > 0)
  if (msg.segment === 'new_users') return true
  return false
}

export default function AnnouncementsScreen() {
  const { colors } = useTheme()
  const { profile, profileAccess, user } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const [messages, setMessages] = useState<MassMessage[]>([])
  const [loading, setLoading] = useState(true)

  const massOn = isOn('mass_messages_enabled')

  useEffect(() => {
    if (!massOn) {
      setMessages([])
      setLoading(false)
      return
    }
    const load = async () => {
      const { data } = await supabase
        .from('mass_messages')
        .select('*')
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
      const list = (data ?? []) as MassMessage[]
      const filtered = list.filter((m) => matchesSegment(m, profile ?? null, profileAccess ?? null))
      setMessages(filtered)
      setLoading(false)
    }
    void load()
  }, [profile?.id, profile?.gender, profileAccess?.user_id, massOn])

  useEffect(() => {
    if (!user?.id || !massOn || loading) return
    const mark = async () => {
      const now = new Date().toISOString()
      await supabase.from('user_announcement_read_state').upsert(
        { user_id: user.id, last_read_announcements_at: now },
        { onConflict: 'user_id' },
      )
    }
    void mark()
  }, [user?.id, massOn, loading])

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!massOn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Annonces</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Module desactive dans l'administration.</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Annonces</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Messages envoyes par l'equipe Decouverte</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{item.body}</Text>
            {item.content_type === 'image' && item.image_url ? (
              <View style={[styles.mediaWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Image source={{ uri: item.image_url }} style={styles.media} resizeMode="contain" />
              </View>
            ) : null}
            {item.content_type === 'video' && item.video_url ? (
              <Pressable
                style={[styles.videoBtn, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => Linking.openURL(item.video_url!)}
              >
                <Text style={[styles.videoBtnText, { color: colors.primary }]}>Voir la video</Text>
              </Pressable>
            ) : null}
            <Text style={[styles.date, { color: colors.textMuted }]}>
              {item.sent_at ? new Date(item.sent_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>Aucune annonce pour vous pour l'instant.</Text>
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
  list: { paddingBottom: 100 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  cardBody: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  mediaWrap: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: { width: '100%', height: '100%' },
  videoBtn: { padding: 12, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  videoBtnText: { fontSize: 15, fontWeight: '600' },
  date: { fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 48 },
})
