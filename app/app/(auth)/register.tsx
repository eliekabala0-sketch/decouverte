import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { apiRegister } from '@/lib/api'
import { MIN_PASSWORD_LENGTH, MIN_PHONE_DIGITS_SIGNUP } from '../../../lib/constants'
import { syntheticEmailForSignUp } from '../../../lib/authSyntheticEmail'

function formatSignUpError(error: { message?: string; code?: string; status?: number }): string {
  const msg = (error.message || '').trim()
  const code = error.code
  const parts = [msg, code ? `(${code})` : '', error.status ? `[${error.status}]` : ''].filter(Boolean)
  return parts.join(' ').trim() || 'Erreur lors de l’inscription.'
}

export default function RegisterScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const [phone, setPhone] = useState('+243')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [progressText, setProgressText] = useState('')

  const handleRegister = async () => {
    setErrorText('')
    if (!phone?.trim() || !password) {
      Alert.alert('Erreur', 'Téléphone et mot de passe requis.')
      return
    }
    if (password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Erreur', `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`)
      return
    }
    const digitsOnly = phone.replace(/\D/g, '')
    if (digitsOnly.length < MIN_PHONE_DIGITS_SIGNUP) {
      const hint = 'Saisissez le numéro complet avec l’indicatif (ex. +243 8XX XXX XXX).'
      setErrorText(hint)
      Alert.alert('Numéro incomplet', hint)
      return
    }

    const email = syntheticEmailForSignUp(digitsOnly)

    setLoading(true)
    setProgressText('Creation du compte securisee...')
    const slowTimer = setTimeout(() => {
      setProgressText('Connexion au serveur en cours. Vous pouvez patienter, la creation continue.')
    }, 4500)
    try {
      await apiRegister(email, phone.replace(/\s/g, ''), password)
      setProgressText('Compte cree. Preparation du profil...')
      router.replace('/(auth)/create-profile')
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErrorText(m)
      Alert.alert('Inscription', m)
    } finally {
      clearTimeout(slowTimer)
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Créer un compte</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Numéro de téléphone et mot de passe
        </Text>
      </View>
      <View style={styles.form}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="+243 8XX XXX XXX"
          placeholderTextColor={colors.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
        <View style={[styles.passwordRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.passwordInput, { color: colors.text }]}
            placeholder={`Mot de passe (min. ${MIN_PASSWORD_LENGTH} caractères)`}
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPasswords}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={showPasswords ? 'Masquer les mots de passe' : 'Afficher les mots de passe'} onPress={() => setShowPasswords((value) => !value)} style={styles.passwordToggle}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{showPasswords ? 'Masquer' : 'Afficher'}</Text>
          </Pressable>
        </View>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="Confirmer le mot de passe"
          placeholderTextColor={colors.textMuted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPasswords}
        />
        <Pressable
          onPress={handleRegister}
          disabled={loading}
          style={[styles.btn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.btnText}>{loading ? 'Inscription...' : 'S\'inscrire'}</Text>
        </Pressable>
        {errorText ? (
          <Text style={[styles.error, { color: colors.error ?? '#ff4d4f' }]}>{errorText}</Text>
        ) : null}
        {progressText && loading ? (
          <Text style={[styles.progress, { color: colors.textSecondary }]}>{progressText}</Text>
        ) : null}
      </View>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={{ color: colors.textSecondary }}>Retour</Text>
      </Pressable>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  header: { marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16 },
  form: { gap: 16 },
  input: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    fontSize: 16,
  },
  passwordRow: { height: 56, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: 18, fontSize: 16 },
  passwordToggle: { height: '100%', justifyContent: 'center', paddingHorizontal: 16 },
  btn: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  error: { marginTop: 4, fontSize: 14 },
  progress: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  back: { position: 'absolute', bottom: 40, alignSelf: 'center' },
})
