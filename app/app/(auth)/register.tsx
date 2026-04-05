import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { supabase } from '@/lib/supabase'
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
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

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
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { phone: phone.replace(/\s/g, '') } },
      })
      if (error) {
        const full = formatSignUpError(error as { message?: string; code?: string; status?: number })
        setErrorText(full)
        const msg = (error.message || '').toLowerCase()
        const code = (error as { code?: string }).code
        const status = (error as { status?: number }).status
        if (status === 429 || msg.includes('too many requests')) {
          Alert.alert('Trop de tentatives', 'Réessayez dans quelques minutes.')
          return
        }
        if (code === 'user_already_exists' || msg.includes('already registered')) {
          Alert.alert('Inscription', 'Ce numéro est déjà utilisé. Connectez-vous ou utilisez un autre numéro.')
        } else if (code === 'email_provider_disabled' || msg.includes('email signups are disabled')) {
          Alert.alert(
            'Inscription',
            'Les inscriptions par e-mail sont désactivées sur le projet Supabase. Activez le fournisseur Email (Auth → Providers).'
          )
        } else if (code === 'invalid_email' || msg.includes('invalid email') || msg.includes('validate email')) {
          Alert.alert('Inscription', full)
        } else {
          Alert.alert('Inscription', full)
        }
        return
      }
      if (data?.user && !data.session) {
        Alert.alert(
          'Inscription',
          'Compte créé. Si la confirmation e-mail est activée dans Supabase, vérifiez votre boîte ; sinon vous pouvez continuer.'
        )
      }
      router.replace('/(auth)/create-profile')
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErrorText(m)
      Alert.alert('Inscription', m)
    } finally {
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
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder={`Mot de passe (min. ${MIN_PASSWORD_LENGTH} caractères)`}
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="Confirmer le mot de passe"
          placeholderTextColor={colors.textMuted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
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
  btn: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  error: { marginTop: 4, fontSize: 14 },
  back: { position: 'absolute', bottom: 40, alignSelf: 'center' },
})
