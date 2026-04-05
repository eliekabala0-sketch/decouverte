import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { GENDER_LABELS, GENDER_REQUIRES_PROFILES_ACCESS_PAYMENT } from '../../../lib/constants'
import { canViewFullProfiles, remainingContacts } from '../../../lib/access'

export default function AccountScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { profile, profileAccess, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
      router.replace('/(auth)/welcome')
    } finally {
      setSigningOut(false)
    }
  }

  const requiresPayment = profile && GENDER_REQUIRES_PROFILES_ACCESS_PAYMENT.includes(profile.gender)
  const hasProfilesAccess = profile ? canViewFullProfiles(profile.gender, profileAccess) : false
  const accessLabel = !requiresPayment
    ? 'Inscription libre'
    : hasProfilesAccess
      ? profileAccess?.all_profiles_access
        ? 'Accès complet (premium)'
        : `Quota photos : ${profileAccess?.photo_quota_used ?? 0} / ${profileAccess?.photo_quota ?? 0}`
      : 'Accès profils / photos non actif'
  const contactQuota = profileAccess
    ? remainingContacts(profileAccess)
    : 0

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Mon compte</Text>
      {profile && (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.name, { color: colors.text }]}>{profile.username}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {GENDER_LABELS[profile.gender]} • {profile.city} • {profile.commune ?? '—'}
          </Text>
          <Text style={[styles.accessLabel, { color: hasProfilesAccess ? colors.success : colors.textSecondary }]}>
            {accessLabel}
          </Text>
          {requiresPayment && (
            <Text style={[styles.quotaLabel, { color: colors.textMuted }]}>
              Contacts restants : {contactQuota}
            </Text>
          )}
        </View>
      )}
      <Pressable
        onPress={() => router.push('/(auth)/edit-profile')}
        style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.menuText, { color: colors.text }]}>Modifier le profil</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/(app)/payments')}
        style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.menuText, { color: colors.text }]}>Paiements & Packs</Text>
      </Pressable>
      <Pressable
        onPress={handleSignOut}
        disabled={signingOut}
        style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.error }]}
      >
        {signingOut ? (
          <ActivityIndicator color={colors.error} />
        ) : (
          <Text style={[styles.menuText, { color: colors.error }]}>Déconnexion</Text>
        )}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 24 },
  card: { padding: 20, borderRadius: 16, marginBottom: 20 },
  name: { fontSize: 20, fontWeight: '600' },
  meta: { fontSize: 15, marginTop: 4 },
  accessLabel: { fontSize: 14, marginTop: 8 },
  quotaLabel: { fontSize: 13, marginTop: 4 },
  menuItem: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  menuText: { fontSize: 16, fontWeight: '500' },
})
