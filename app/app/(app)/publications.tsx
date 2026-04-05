import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Linking, Image } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { supabase } from '@/lib/supabase'
import type { PublicPublication } from '../../../lib/types'

export default function PublicationsScreen() {
  const { colors } = useTheme()
  const [publications, setPublications] = useState<PublicPublication[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('public_publications')
        .select('*')
        .eq('is_active', true)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
      setPublications((data ?? []) as PublicPublication[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Publications</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Publications publiques — épinglées en premier
      </Text>
      <FlatList
        data={publications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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
              <Image source={{ uri: item.image_url }} style={styles.media} resizeMode="cover" />
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
  media: { width: '100%', height: 200, borderRadius: 12, marginBottom: 12 },
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
})
