import { useCallback, useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { useNotificationCounters } from '@/lib/useNotificationCounters'
import { supabase } from '@/lib/supabase'
import { MODES } from '../../../lib/constants'
import type { PublicPublication } from '../../../lib/types'

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const { profile } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const { announcementDot, unreadMessages, newPublications, refreshCounters } = useNotificationCounters()
  const [recentPublications, setRecentPublications] = useState<PublicPublication[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const modeLibre = isOn('mode_libre_enabled')
  const modeSerieux = isOn('mode_serieux_enabled')
  const massOn = isOn('mass_messages_enabled')
  const campaignsOn = isOn('ad_campaigns_enabled')
  const pubsOn = isOn('public_publications_enabled')
  const packsOn = isOn('contact_packs_enabled')
  const reciprocal = isOn('reciprocal_matching_enabled')
  const boostOn = isOn('boost_enabled')
  const maleBoostRequiresReciprocity = isOn('male_boost_requires_reciprocity')
  const gender = normalizeGender(profile?.gender)
  const showPacksQuickLink = packsOn && profile && (gender === 'M' || (gender === 'F' && reciprocal))
  const showBoostQuickLink =
    boostOn && !!profile && (gender !== 'M' || reciprocal || !maleBoostRequiresReciprocity)

  const loadRecentPublications = useCallback(async () => {
    if (!pubsOn) {
      setRecentPublications([])
      return
    }
    const { data } = await supabase
      .from('public_publications')
      .select('*')
      .eq('is_active', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3)
    setRecentPublications((data ?? []) as PublicPublication[])
  }, [pubsOn])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshCounters(), loadRecentPublications()])
    } finally {
      setRefreshing(false)
    }
  }, [refreshCounters, loadRecentPublications])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

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
          <ModeCard
            icon="sparkles"
            label={MODES.libre.label}
            description="Discussion, amitie et rencontre libre"
            iconBackground={colors.accentSoft}
            colors={colors}
            onPress={() => router.push({ pathname: '/(app)/profiles', params: { mode: 'libre' } })}
          />
        ) : null}

        {modeSerieux ? (
          <ModeCard
            icon="heart"
            label={MODES.serieux.label}
            description="Mariage, relation durable et intention claire"
            iconBackground={colors.primarySoft}
            colors={colors}
            onPress={() => router.push({ pathname: '/(app)/profiles', params: { mode: 'serieux' } })}
          />
        ) : null}

        {!modeLibre && !modeSerieux ? (
          <Text style={[styles.modeDesc, { color: colors.textMuted }]}>
            Les deux modes sont desactives par l'administration.
          </Text>
        ) : null}
      </View>

      <View style={styles.quickLinks}>
        {massOn ? (
          <QuickLink
            icon="megaphone"
            title={`Annonces${announcementDot ? ' •' : ''}`}
            subtitle="Messages de l'equipe"
            colors={colors}
            onPress={() => router.push('/(app)/announcements')}
          />
        ) : null}
        {campaignsOn ? (
          <QuickLink
            icon="radio"
            title="Campagnes"
            subtitle="Annonces et offres"
            colors={colors}
            onPress={() => router.push('/(app)/campaigns')}
          />
        ) : null}
        {showPacksQuickLink ? (
          <QuickLink
            icon="chatbubble-ellipses"
            title="Packs contacts"
            subtitle="Debloquer des echanges"
            colors={colors}
            onPress={() => router.push('/(app)/packs')}
          />
        ) : null}
        {showBoostQuickLink ? (
          <QuickLink
            icon="trending-up"
            title="Mise en avant"
            subtitle="Booster votre visibilite"
            colors={colors}
            onPress={() => router.push('/(app)/payments')}
          />
        ) : null}
        <QuickLink
          icon="chatbubbles"
          title={`Messages${unreadMessages > 0 ? ` (${unreadMessages})` : ''}`}
          subtitle={unreadMessages > 0 ? 'Nouveaux messages non lus' : 'Aucun nouveau message'}
          colors={colors}
          onPress={() => router.push('/(app)/messages')}
        />
        {pubsOn ? (
          <QuickLink
            icon="newspaper"
            title={`Publications${newPublications > 0 ? ` (${newPublications})` : ''}`}
            subtitle="Flux public recent"
            colors={colors}
            onPress={() => router.push('/(app)/publications')}
          />
        ) : null}
      </View>

      {pubsOn ? (
        <View style={styles.recentSection}>
          <Text style={[styles.recentTitle, { color: colors.text }]}>Publications recentes</Text>
          {recentPublications.length === 0 ? (
            <Text style={[styles.modeDesc, { color: colors.textMuted }]}>Aucune publication recente pour le moment.</Text>
          ) : (
            recentPublications.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push('/(app)/publications')}
                style={[styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {p.image_url ? (
                  <View style={[styles.recentMediaWrap, { backgroundColor: colors.surfaceElevated }]}>
                    <Image source={{ uri: p.image_url }} style={styles.recentMedia} resizeMode="contain" />
                  </View>
                ) : null}
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

type AppColors = ReturnType<typeof useTheme>['colors']

function ModeCard(props: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  description: string
  iconBackground: string
  colors: AppColors
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.modeCard,
        {
          backgroundColor: props.colors.surfaceElevated,
          borderColor: props.colors.border,
          opacity: pressed ? 0.95 : 1,
        },
      ]}
    >
      <View style={[styles.modeIcon, { backgroundColor: props.iconBackground }]}>
        <Ionicons name={props.icon} size={30} color={props.colors.primary} />
      </View>
      <Text style={[styles.modeTitle, { color: props.colors.text }]}>{props.label}</Text>
      <Text style={[styles.modeDesc, { color: props.colors.textSecondary }]}>{props.description}</Text>
    </Pressable>
  )
}

function QuickLink(props: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle: string
  colors: AppColors
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [styles.linkCard, { backgroundColor: props.colors.card, opacity: pressed ? 0.9 : 1 }]}
    >
      <Ionicons name={props.icon} size={24} color={props.colors.primary} style={styles.linkIcon} />
      <Text style={[styles.linkTitle, { color: props.colors.text }]}>{props.title}</Text>
      <Text style={[styles.linkSub, { color: props.colors.textSecondary }]}>{props.subtitle}</Text>
    </Pressable>
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
  linkIcon: { marginBottom: 6 },
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
  recentMediaWrap: {
    width: 70,
    height: 70,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentMedia: { width: '100%', height: '100%' },
  recentCardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
})
