import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export default function LoginScreen() {
  const router = useRouter()
  const { colors, spacing } = useTheme()
  const [phone, setPhone] = useState('+243')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

  const handleLogin = async () => {
    setErrorText('')
    if (!phone || !password) {
      setErrorText('Téléphone et mot de passe requis.')
      return
    }
    setLoading(true)
    try {
      const digitsOnly = phone.replace(/\D/g, '')
      const cleaned = phone.replace(/\s/g, '')
      const candidateEmails = Array.from(
        new Set([
          `tel_${digitsOnly}@decouverte.auth`,
          `${cleaned}@decouverte.auth`,
        ])
      )
      let lastError: any = null
      let loggedIn = false
      for (const email of candidateEmails) {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          12000
        )
        if (!error) {
          loggedIn = true
          break
        }
        lastError = error
        const status = (error as { status?: number }).status
        const msg = (error.message || '').toLowerCase()
        if (status === 429 || msg.includes('too many requests')) {
          setErrorText('Trop de tentatives. Réessayez dans quelques minutes.')
          return
        }
        // Si ce n'est pas un problème d'identifiants, on arrête et remonte l'erreur.
        const code = (error as { code?: string }).code
        if (!(code === 'invalid_credentials' || msg.includes('invalid login credentials'))) {
          setErrorText(error.message || 'Erreur de connexion.')
          return
        }
      }
      if (!loggedIn) {
        setErrorText('Numéro ou mot de passe incorrect.')
        return
      }
      router.replace('/(app)/home')
    } catch (e) {
      if (e instanceof Error && e.message === 'timeout') {
        setErrorText('Connexion trop longue. Fermez les autres onglets Découverte et réessayez.')
      } else {
        setErrorText(e instanceof Error ? e.message : 'Erreur de connexion.')
      }
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
        <Text style={[styles.title, { color: colors.text }]}>Connexion</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Entrez votre numéro et mot de passe
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
          placeholder="Mot de passe"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={[styles.btn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.btnText}>{loading ? 'Connexion...' : 'Se connecter'}</Text>
        </Pressable>
        {errorText ? <Text style={[styles.error, { color: colors.error ?? '#ff4d4f' }]}>{errorText}</Text> : null}
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
  form: { gap: 16, marginTop: 8 },
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
  error: { marginTop: 12, fontSize: 14 },
})
