import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, TextInput, ScrollView } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { ProfileCard } from '@/components/ProfileCard'
import { CITIES_RDC, COMMUNES_KINSHASA, MODES } from '../../../lib/constants'
import type { Profile } from '../../../lib/types'
import { getProfileFeed, type FeedMode } from '../../lib/profileFeedRpc'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'

const PAGE_SIZE = 20
type TargetGender = 'all' | 'M' | 'F'
type ProfileFilters = {
  city: string
  commune: string
  targetGender: TargetGender
  minAge: string
  maxAge: string
  verifiedOnly: boolean
  withPhotoOnly: boolean
  expandScope: boolean
}

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

function oppositeGender(gender?: string | null): TargetGender {
  const normalized = normalizeGender(gender)
  if (normalized === 'M') return 'F'
  if (normalized === 'F') return 'M'
  return 'all'
}

function genderFilterLabel(value: TargetGender) {
  if (value === 'F') return 'Femmes'
  if (value === 'M') return 'Hommes'
  return 'Tous'
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
  const defaultFilters = useMemo<ProfileFilters>(() => ({
    city: myProfile?.city ?? '',
    commune: '',
    targetGender: oppositeGender(myProfile?.gender),
    minAge: '',
    maxAge: '',
    verifiedOnly: false,
    withPhotoOnly: false,
    expandScope: false,
  }), [myProfile?.city, myProfile?.gender])
  const [appliedFilters, setAppliedFilters] = useState<ProfileFilters>(defaultFilters)
  const [draftFilters, setDraftFilters] = useState<ProfileFilters>(defaultFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    setAppliedFilters((prev) => {
      const untouched = !prev.city && !prev.commune && prev.targetGender === 'all' && !prev.expandScope
      return untouched ? defaultFilters : prev
    })
    setDraftFilters((prev) => {
      const untouched = !prev.city && !prev.commune && prev.targetGender === 'all' && !prev.expandScope
      return untouched ? defaultFilters : prev
    })
  }, [defaultFilters])

  const feedMode: FeedMode = mode === 'serieux' ? 'serieux' : 'libre'
  const modeLabel = feedMode === 'serieux' ? MODES.serieux.label : MODES.libre.label
  const reciprocalEnabled = isOn('reciprocal_matching_enabled')

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      setLoadError(null)
      if (replace) setLoading(true)
      else setLoadingMore(true)

      try {
        const result = await getProfileFeed(feedMode, nextPage, PAGE_SIZE, {
          city,
          commune,
          targetGender,
          minAge: minAge ? Number(minAge) : null,
          maxAge: maxAge ? Number(maxAge) : null,
          verifiedOnly,
          withPhotoOnly,
          expandScope,
        })
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
    [feedMode, appliedFilters],
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
  const { city, commune, targetGender, minAge, maxAge, verifiedOnly, withPhotoOnly, expandScope } = appliedFilters
  const updateDraft = <K extends keyof ProfileFilters>(key: K, value: ProfileFilters[K]) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }))
  }
  const applyFilters = () => {
    setAppliedFilters(draftFilters)
    setFiltersOpen(false)
    setRefreshKey((k) => k + 1)
  }
  const resetFilters = () => {
    setDraftFilters(defaultFilters)
    setAppliedFilters(defaultFilters)
    setFiltersOpen(false)
    setRefreshKey((k) => k + 1)
  }
  const expandToCountry = () => {
    const next = { ...appliedFilters, expandScope: true, city: '', commune: '' }
    setDraftFilters(next)
    setAppliedFilters(next)
    setFiltersOpen(false)
    setRefreshKey((k) => k + 1)
  }
  const activeChips = [
    appliedFilters.expandScope ? 'Toute la RDC' : (appliedFilters.city || 'Ville non definie'),
    genderFilterLabel(appliedFilters.targetGender),
    modeLabel,
    appliedFilters.commune,
    appliedFilters.minAge ? `Age min ${appliedFilters.minAge}` : '',
    appliedFilters.maxAge ? `Age max ${appliedFilters.maxAge}` : '',
    appliedFilters.verifiedOnly ? 'Verifies' : '',
    appliedFilters.withPhotoOnly ? 'Avec photo' : '',
  ].filter(Boolean)

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
      <View style={[styles.filterSummary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.summaryTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>
              {appliedFilters.expandScope ? 'Toute la RDC' : (appliedFilters.city || 'Ville non definie')}
            </Text>
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
              {genderFilterLabel(appliedFilters.targetGender)} · {modeLabel}
            </Text>
          </View>
          <Pressable onPress={() => setFiltersOpen((v) => !v)} style={[styles.filterButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.filterButtonText}>{filtersOpen ? 'Fermer' : 'Filtres'}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeChips}>
          {activeChips.map((chip) => (
            <View key={chip} style={[styles.activeChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={[styles.activeChipText, { color: colors.text }]}>{chip}</Text>
            </View>
          ))}
          <Pressable onPress={() => setFiltersOpen(true)} style={[styles.activeChip, { borderColor: colors.primary }]}>
            <Text style={[styles.activeChipText, { color: colors.primary }]}>Modifier</Text>
          </Pressable>
        </ScrollView>
      </View>
      {filtersOpen ? (
        <View style={[styles.filters, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            {CITIES_RDC.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  updateDraft('city', item === 'Autre' ? '' : item)
                  updateDraft('commune', '')
                  updateDraft('expandScope', false)
                }}
                style={[styles.chip, { borderColor: draftFilters.city === item ? colors.primary : colors.border, backgroundColor: draftFilters.city === item ? colors.primarySoft : colors.surfaceElevated }]}
              >
                <Text style={[styles.chipText, { color: colors.text }]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {draftFilters.city === 'Kinshasa' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
              {['Toutes communes', ...COMMUNES_KINSHASA].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => updateDraft('commune', item === 'Toutes communes' ? '' : item)}
                  style={[styles.chip, { borderColor: (draftFilters.commune || 'Toutes communes') === item ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.chipText, { color: colors.text }]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <TextInput
              value={draftFilters.commune}
              onChangeText={(value) => updateDraft('commune', value)}
              placeholder="Commune"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            />
          )}
          <View style={styles.filterRow}>
            {[
              { value: 'all', label: 'Tous' },
              { value: 'F', label: 'Femmes' },
              { value: 'M', label: 'Hommes' },
            ].map((item) => (
              <Pressable
                key={item.value}
                onPress={() => updateDraft('targetGender', item.value as TargetGender)}
                style={[styles.chip, { borderColor: draftFilters.targetGender === item.value ? colors.primary : colors.border }]}
              >
                <Text style={[styles.chipText, { color: colors.text }]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.filterRow}>
            <TextInput value={draftFilters.minAge} onChangeText={(value) => updateDraft('minAge', value)} keyboardType="number-pad" placeholder="Age min" placeholderTextColor={colors.textMuted} style={[styles.smallInput, { borderColor: colors.border, color: colors.text }]} />
            <TextInput value={draftFilters.maxAge} onChangeText={(value) => updateDraft('maxAge', value)} keyboardType="number-pad" placeholder="Age max" placeholderTextColor={colors.textMuted} style={[styles.smallInput, { borderColor: colors.border, color: colors.text }]} />
            <Pressable onPress={() => updateDraft('verifiedOnly', !draftFilters.verifiedOnly)} style={[styles.chip, { borderColor: draftFilters.verifiedOnly ? colors.primary : colors.border }]}>
              <Text style={[styles.chipText, { color: colors.text }]}>Verifies</Text>
            </Pressable>
            <Pressable onPress={() => updateDraft('withPhotoOnly', !draftFilters.withPhotoOnly)} style={[styles.chip, { borderColor: draftFilters.withPhotoOnly ? colors.primary : colors.border }]}>
              <Text style={[styles.chipText, { color: colors.text }]}>Avec photo</Text>
            </Pressable>
          </View>
          <View style={styles.filterRow}>
            <Pressable onPress={applyFilters} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.retryText}>Appliquer</Text>
            </Pressable>
            <Pressable onPress={resetFilters} style={[styles.resetBtn, { borderColor: colors.border }]}>
              <Text style={[styles.chipText, { color: colors.text }]}>Reinitialiser</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
          <View style={styles.emptyBox}>
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {city && !expandScope ? 'Aucun profil disponible dans cette ville pour le moment.' : 'Aucun profil pour le moment.'}
            </Text>
            {city && !expandScope ? (
              <Pressable onPress={expandToCountry} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.retryText}>Elargir a toute la RDC</Text>
              </Pressable>
            ) : null}
          </View>
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
  filterSummary: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, gap: 10 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryTitle: { fontSize: 16, fontWeight: '800' },
  summaryText: { fontSize: 13, marginTop: 3 },
  filterButton: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  filterButtonText: { color: '#FFF', fontWeight: '700' },
  activeChips: { gap: 8, paddingRight: 12 },
  activeChip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  activeChipText: { fontSize: 12, fontWeight: '700' },
  filters: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 16, gap: 10 },
  filterChips: { gap: 8, paddingRight: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  chipText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  smallInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42, minWidth: 96, flexGrow: 1 },
  listContent: { paddingBottom: 100 },
  cardWrap: { flex: 1, maxWidth: '48%' },
  empty: { textAlign: 'center', marginTop: 48 },
  emptyBox: { alignItems: 'center', paddingBottom: 24 },
  retryBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignSelf: 'center' },
  resetBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  retryText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
})
