import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { MODES } from '../../../lib/constants'

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const { profile } = useAuth()

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
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
      </View>

      <View style={styles.quickLinks}>
        <Pressable
          onPress={() => router.push('/(app)/announcements')}
          style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
        >
          <Text style={styles.linkEmoji}>📢</Text>
          <Text style={[styles.linkTitle, { color: colors.text }]}>Annonces</Text>
          <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Messages de l'équipe</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(app)/campaigns')}
          style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
        >
          <Text style={styles.linkEmoji}>🎯</Text>
          <Text style={[styles.linkTitle, { color: colors.text }]}>Campagnes</Text>
          <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Annonces et offres</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(app)/packs')}
          style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
        >
          <Text style={styles.linkEmoji}>💬</Text>
          <Text style={[styles.linkTitle, { color: colors.text }]}>Packs contacts</Text>
          <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Débloquer des échanges</Text>
        </Pressable>
      </View>
    </View>
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
})
