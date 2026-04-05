import { View, Text, StyleSheet, Image } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import type { Profile } from '../../lib/types'
import { colors } from '@/theme/theme'

type ProfileCardProps = {
  profile: Profile
  canViewFull?: boolean
  onPress?: () => void
}

export function ProfileCard({ profile, canViewFull = true }: ProfileCardProps) {
  const theme = useTheme()
  const showFull = canViewFull
  const avatarSource = showFull && profile.photo ? { uri: profile.photo } : null
  const boosted = !!profile.boost_reason

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
      <View style={styles.avatarWrap}>
        {avatarSource ? (
          <Image source={avatarSource} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.neutralAvatar }]}>
            <Text style={styles.avatarEmoji}>👤</Text>
          </View>
        )}
        {boosted && (
          <View style={[styles.boostBadge, { backgroundColor: theme.colors.gold }]}>
            <Text style={styles.boostText}>★</Text>
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
        {showFull ? profile.username : 'Profil'}
      </Text>
      <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
        {profile.age} ans • {profile.city} • {profile.commune ?? '—'}
      </Text>
      {showFull && profile.bio ? (
        <Text style={[styles.bio, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          {profile.bio}
        </Text>
      ) : null}
      {!showFull && (
        <Text style={[styles.lockHint, { color: theme.colors.textMuted }]}>
          Débloquez l'accès pour voir les photos et le profil
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    minWidth: 160,
    maxWidth: 200,
  },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: '100%', aspectRatio: 0.85, borderRadius: 14 },
  avatarPlaceholder: {
    width: '100%',
    aspectRatio: 0.85,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: { fontSize: 48 },
  boostBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boostText: { color: '#000', fontSize: 12 },
  name: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  meta: { fontSize: 13, marginBottom: 6 },
  bio: { fontSize: 13, lineHeight: 18 },
  lockHint: { fontSize: 12, marginTop: 6, fontStyle: 'italic' },
})
