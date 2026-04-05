import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { supabase } from '@/lib/supabase'
import { MIN_PASSWORD_LENGTH } from '../../../lib/constants'

export default function RegisterScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const [phone, setPhone] = useState('+243')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!phone || !password) {
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
    setLoading(true)
    // Supabase exige un format email valide : partie locale sans + (lettres, chiffres, ., -, _ uniquement).
    const digitsOnly = phone.replace(/\D/g, '')
    const email = `tel_${digitsOnly}@decouverte.auth`
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { phone } },
    })
    setLoading(false)
    if (error) {
      const msg = error.message || 'Erreur lors de l\'inscription.'
      const code = (error as { code?: string }).code
      const status = (error as { status?: number }).status
      if (status === 429 || msg.toLowerCase().includes('too many requests')) {
        Alert.alert('Trop de tentatives', 'Réessayez dans quelques minutes.')
        return
      }
      if (code === 'user_already_exists' || msg.toLowerCase().includes('already registered')) {
        Alert.alert('Inscription', 'Ce numéro est déjà utilisé. Connectez-vous ou utilisez un autre numéro.')
      } else if (code === 'invalid_email' || msg.toLowerCase().includes('invalid email')) {
        Alert.alert('Inscription', 'Numéro invalide. Utilisez un format international (ex. +243 8XX XXX XXX).')
      } else {
        Alert.alert('Inscription', msg)
      }
      return
    }
    if (data?.user && !data.session) {
      Alert.alert('Inscription', 'Compte créé. Vérifiez votre boîte mail si la confirmation est activée, sinon connectez-vous.')
    }
    router.replace('/(auth)/create-profile')
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
  back: { position: 'absolute', bottom: 40, alignSelf: 'center' },
})
