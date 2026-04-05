import { View, Text, StyleSheet, Pressable } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { APP_NAME } from '../../../lib/constants'

export default function WelcomeScreen() {
  const router = useRouter()
  const { colors, spacing } = useTheme()
  const { user, profile, loading } = useAuth()

  if (!loading && user && profile) return profile.photo ? <Redirect href="/(app)/home" /> : <Redirect href="/(auth)/add-avatar" />
  if (!loading && user && !profile) return <Redirect href="/(auth)/create-profile" />

  return (
    <View style={[styles.container, { paddingBottom: spacing.xl + 40 }]}>
      <View style={styles.content}>
        <Text style={[styles.logo, { color: colors.text }]}>{APP_NAME}</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          Rencontres locales en RDC{'\n'}Mode Libre • Mode Sérieux
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/(auth)/login')}
          style={({ pressed }) => [
            styles.btnPrimary,
            { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={styles.btnPrimaryText}>Se connecter</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(auth)/register')}
          style={({ pressed }) => [
            styles.btnSecondary,
            { borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={[styles.btnSecondaryText, { color: colors.text }]}>
            Créer un compte
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0F',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    gap: 14,
  },
  btnPrimary: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  btnSecondary: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 17,
    fontWeight: '600',
  },
})
