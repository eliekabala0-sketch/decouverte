import { useCallback, useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { ProfileCard } from '@/components/ProfileCard'
import { MODES } from '../../../lib/constants'
import type { Profile } from '../../../lib/types'
import { getProfileFeed, type FeedMode } from '../../lib/profileFeedRpc'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'

const PAGE_SIZE = 20

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

export default function ProfilesScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { profile: myProfile } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [fallbackMode, setFallbackMode] = useState(false)

  const feedMode: FeedMode = mode === 'serieux' ? 'serieux' : 'libre'
  const modeLabel = feedMode === 'serieux' ? MODES.serieux.label : MODES.libre.label
  const reciprocalEnabled = isOn('reciprocal_matching_enabled')

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      setLoadError(null)
      if (replace) setLoading(true)
      else setLoadingMore(true)

      try {
        const result = await getProfileFeed(feedMode, nextPage, PAGE_SIZE)
        setFallbackMode(!!result.missingRpc)
        setTotalCount(result.totalCount)
        setPage(nextPage)
        setProfiles((prev) => {
          const next = replace ? result.profiles : [...prev, ...result.profiles]
          setHasMore(next.length < result.totalCount && result.profiles.length > 0)
          return next
        })
      } catch (e: unknown) {
        setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [feedMode],
  )

  useEffect(() => {
    setProfiles([])
    setPage(0)
    setHasMore(false)
    void loadPage(0, true)
  }, [loadPage, myProfile?.id, myProfile?.gender, refreshKey])

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return
    void loadPage(page + 1, false)
  }

  const onPressProfile = (id: string) => router.push(`/(app)/profile/${id}`)

  if (loading && profiles.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (loadError && profiles.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.empty, { color: colors.textMuted }]}>{loadError}</Text>
        <Pressable onPress={() => setRefreshKey((k) => k + 1)} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.retryText}>Reessayer</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{modeLabel}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {totalCount || profiles.length} profil{(totalCount || profiles.length) !== 1 ? 's' : ''}
      </Text>
      {normalizeGender(myProfile?.gender) === 'F' && !reciprocalEnabled ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          La recherche reciproque est desactivee : apercu limite, details complets et echanges controles.
        </Text>
      ) : null}
      {fallbackMode ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Mode compatibilite : affichage limite sans donnees sensibles.
        </Text>
      ) : null}
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPressProfile(item.id)} style={styles.cardWrap}>
            <ProfileCard
              profile={item}
              canViewFull={
                !!item.can_view_full &&
                !(normalizeGender(myProfile?.gender) === 'F' && item.gender === 'M' && !reciprocalEnabled)
              }
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>Aucun profil pour le moment.</Text>
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshing={loading}
        onRefresh={() => setRefreshKey((k) => k + 1)}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 56 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 15, marginBottom: 16 },
  row: { gap: 16, marginBottom: 16 },
  listContent: { paddingBottom: 100 },
  cardWrap: { flex: 1, maxWidth: '48%' },
  empty: { textAlign: 'center', marginTop: 48 },
  retryBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignSelf: 'center' },
  retryText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
})
