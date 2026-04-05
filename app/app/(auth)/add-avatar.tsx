import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export default function AddAvatarScreen() {
  const router = useRouter()
  const { colors, spacing } = useTheme()
  const { user, profile, refreshProfile, loading } = useAuth()

  if (!loading && !user) return <Redirect href="/(auth)/welcome" />
  if (!loading && user && !profile) return <Redirect href="/(auth)/create-profile" />
  if (!loading && user && profile?.photo) return <Redirect href="/(app)/home" />

  const [photoUrl, setPhotoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorText, setErrorText] = useState('')

  const save = async () => {
    setErrorText('')
    if (!user?.id) return
    const url = photoUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      setErrorText('Ajoutez une URL d’image valide (http/https).')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({ photo: url }).eq('id', user.id)
      if (error) {
        setErrorText(error.message || 'Erreur lors de l’enregistrement de la photo.')
        return
      }
      await refreshProfile()
      router.replace('/(app)/home')
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Erreur lors de l’enregistrement de la photo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.lg }]}>
      <Text style={[styles.title, { color: colors.text }]}>Photo de profil</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Ajoutez une photo principale pour finaliser votre profil.
      </Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>URL de la photo *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder="https://..."
        placeholderTextColor={colors.textMuted}
        value={photoUrl}
        onChangeText={setPhotoUrl}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        onPress={save}
        disabled={saving}
        style={[styles.btn, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.btnText}>{saving ? 'Enregistrement...' : 'Continuer'}</Text>
      </Pressable>
      {errorText ? <Text style={[styles.error, { color: colors.error ?? '#ff4d4f' }]}>{errorText}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, marginBottom: 24 },
  label: { fontSize: 14, marginBottom: 8, marginTop: 16 },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  btn: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  error: { marginTop: 12, fontSize: 14 },
})
