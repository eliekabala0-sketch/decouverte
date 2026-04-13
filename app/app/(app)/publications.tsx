import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Linking, Image, RefreshControl } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { PublicPublication } from '../../../lib/types'

export default function PublicationsScreen() {
  const { colors } = useTheme()
  const { isOn } = useAppFeatureFlags()
  const { user } = useAuth()
  const [publications, setPublications] = useState<PublicPublication[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ratios, setRatios] = useState<Record<string, number>>({})

  const pubsOn = isOn('public_publications_enabled')

  const load = useCallback(async () => {
    if (!pubsOn) {
      setPublications([])
      setLoading(false)
      return
    }
    try {
      setLoadError(null)
      const { data, error } = await supabase
        .from('public_publications')
        .select('*')
        .eq('is_active', true)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setPublications((data ?? []) as PublicPublication[])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement des publications.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [pubsOn])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const images = publications.filter((p) => p.content_type === 'image' && p.image_url)
    images.forEach((p) => {
      if (!p.image_url || ratios[p.id]) return
      Image.getSize(
        p.image_url,
        (w, h) => {
          if (w > 0 && h > 0) {
            setRatios((prev) => ({ ...prev, [p.id]: Math.max(0.6, Math.min(1.6, w / h)) }))
          }
        },
        () => setRatios((prev) => ({ ...prev, [p.id]: 1 }))
      )
    })
  }, [publications, ratios])

  useEffect(() => {
    if (!user?.id || !pubsOn) return
    if (publications.length === 0) return
    const latest = publications[0]?.created_at
    if (!latest) return
    void supabase
      .from('user_publication_read_state')
      .upsert(
        { user_id: user.id, last_read_publications_at: latest },
        { onConflict: 'user_id' }
      )
      .then(({ error }) => {
        if (error) console.warn('[publications] read_state upsert', error.message)
      })
  }, [user?.id, pubsOn, publications])

  const onRefresh = () => {
    setRefreshing(true)
    void load()
  }

  const headerSubtitle = useMemo(
    () => 'Publications publiques — épinglées en premier',
    []
  )

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!pubsOn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Publications</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Module désactivé dans l’administration.</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Publications</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {headerSubtitle}
      </Text>
      {loadError ? (
        <Text style={[styles.error, { color: colors.error }]}>{loadError}</Text>
      ) : null}
      <FlatList
        data={publications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {item.is_pinned && (
              <View style={[styles.pinBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.pinText}>Épinglé</Text>
              </View>
            )}
            <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.cardContent, { color: colors.textSecondary }]}>{item.content}</Text>
            {item.content_type === 'image' && item.image_url ? (
              <View style={[styles.mediaWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Image
                  source={{ uri: item.image_url }}
                  style={[styles.media, { aspectRatio: ratios[item.id] ?? 1 }]}
                  resizeMode="contain"
                />
              </View>
            ) : null}
            {item.content_type === 'video' && item.video_url ? (
              <Pressable
                style={[styles.videoLink, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => Linking.openURL(item.video_url!)}
              >
                <Text style={[styles.videoLinkText, { color: colors.primary }]}>▶ Lire la vidéo</Text>
              </Pressable>
            ) : null}
            <Text style={[styles.cardDate, { color: colors.textMuted }]}>
              {new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>Aucune publication pour l'instant.</Text>
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
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    position: 'relative',
  },
  pinBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pinText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  cardContent: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  mediaWrap: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  media: { width: '100%', maxHeight: 420 },
  videoLink: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: 'center',
  },
  videoLinkText: { fontSize: 15, fontWeight: '600' },
  cardDate: { fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 48 },
  error: { marginBottom: 10 },
})
