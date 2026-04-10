import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { ProfileCard } from '@/components/ProfileCard'
import { MODES } from '../../../lib/constants'
import { canViewFullProfiles } from '../../../lib/access'
import { supabase } from '@/lib/supabase'
import type { Profile } from '../../../lib/types'

export default function ProfilesScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { profile: myProfile, profileAccess } = useAuth()
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [reciprocalEnabled, setReciprocalEnabled] = useState(false)

  const modeLabel = mode === 'serieux' ? MODES.serieux.label : MODES.libre.label

  useEffect(() => {
    setLoadError(null)
    const load = async () => {
      try {
        const { data: setting } = await supabase
          .from('admin_settings')
          .select('value')
          .eq('key', 'reciprocal_matching_enabled')
          .maybeSingle()
        const reciprocal = Boolean((setting as { value?: boolean } | null)?.value)
        setReciprocalEnabled(reciprocal)

        const { data, error } = await supabase
          .from('profiles')
          .select(
            'id,created_at,phone,photo,gender,city,commune,bio,status,is_verified,username,age,boost_reason,country,role'
          )
          .eq('status', 'active')
          .order('created_at', { ascending: false })
        if (error) throw error
        const list = (data ?? []) as Profile[]
        const filteredSelf = list
          .filter((p) => p.id !== myProfile?.id)
          .filter((p) => {
            const libre = p.mode_libre_active ?? true
            const serieux = p.mode_serieux_active ?? true
            return mode === 'serieux' ? serieux : libre
          })
        if (!myProfile?.gender) {
          setProfiles(filteredSelf)
          return
        }
        if (myProfile.gender === 'M') {
          // Mode standard: les hommes voient les profils femmes.
          setProfiles(filteredSelf.filter((p) => p.gender === 'F'))
          return
        }
        if (myProfile.gender === 'F' && !reciprocal) {
          // Non réciproque par défaut.
          setProfiles([])
          return
        }
        if (myProfile.gender === 'F' && reciprocal) {
          setProfiles(filteredSelf.filter((p) => p.gender === 'M'))
          return
        }
        setProfiles(filteredSelf)
      } catch (e: unknown) {
        setLoadError(e instanceof Error ? e.message : 'Erreur de chargement')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [myProfile?.id, myProfile?.gender, refreshKey])

  const canViewFull = canViewFullProfiles(myProfile?.gender, profileAccess)
  const onPressProfile = (id: string) => router.push(`/(app)/profile/${id}`)

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
        <Pressable onPress={() => { setLoadError(null); setLoading(true); setRefreshKey((k) => k + 1); }} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{modeLabel}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {profiles.length} profil{profiles.length !== 1 ? 's' : ''}
      </Text>
      {myProfile?.gender === 'F' && !reciprocalEnabled ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          La recherche réciproque est désactivée pour le moment.
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
                canViewFull &&
                !(
                  myProfile?.gender === 'F' &&
                  item.gender === 'M' &&
                  !reciprocalEnabled
                )
              }
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>Aucun profil pour le moment.</Text>
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
