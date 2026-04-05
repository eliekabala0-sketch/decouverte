import { useState, useEffect } from 'react'
import { Redirect, useRouter } from 'expo-router'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { GENDER_LABELS, CITIES_RDC, COMMUNES_KINSHASA } from '../../../lib/constants'
import type { Gender } from '../../../lib/types'

export default function EditProfileScreen() {
  const router = useRouter()
  const { colors, spacing } = useTheme()
  const { user, profile, refreshProfile, loading } = useAuth()

  if (!loading && !user) return <Redirect href="/(auth)/welcome" />
  if (!loading && user && !profile) return <Redirect href="/(auth)/create-profile" />
  const [username, setUsername] = useState('')
  const [gender, setGender] = useState<Gender>('M')
  const [ageStr, setAgeStr] = useState('')
  const [city, setCity] = useState('Kinshasa')
  const [commune, setCommune] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('CD')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setUsername(profile.username)
      setGender(profile.gender as Gender)
      setAgeStr(String(profile.age ?? ''))
      setCity(profile.city || 'Kinshasa')
      setCommune(profile.commune || '')
      setBio(profile.bio || '')
      setCountry(profile.country || 'CD')
    }
  }, [profile?.id])

  const age = parseInt(ageStr, 10)
  const isAdult = Number.isFinite(age) && age >= 18

  const handleSave = async () => {
    if (!user?.id || !profile?.id) return
    if (!username.trim()) {
      Alert.alert('Erreur', 'Le pseudo est requis.')
      return
    }
    if (!Number.isFinite(age) || !isAdult) {
      Alert.alert('Erreur', 'Âge requis (18+).')
      return
    }
    if (!city || !commune) {
      Alert.alert('Erreur', 'Ville et commune sont requis.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        username: username.trim(),
        gender,
        age,
        city,
        commune,
        bio: bio.trim() || null,
        country: country.trim() || 'CD',
      })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      Alert.alert('Erreur', error.message)
      return
    }
    await refreshProfile()
    Alert.alert('Profil mis à jour', 'Vos modifications ont été enregistrées.')
    router.back()
  }

  if (!profile) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>Modifier le profil</Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Pseudo *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder="Pseudo"
        placeholderTextColor={colors.textMuted}
        value={username}
        onChangeText={setUsername}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Sexe *</Text>
      <View style={styles.row}>
        {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
          <Pressable
            key={g}
            onPress={() => setGender(g)}
            style={[
              styles.chip,
              { backgroundColor: colors.surface, borderColor: colors.border },
              gender === g && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{GENDER_LABELS[g]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Âge * (18+)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder="Ex: 25"
        placeholderTextColor={colors.textMuted}
        value={ageStr}
        onChangeText={setAgeStr}
        keyboardType="number-pad"
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Ville *</Text>
      <View style={styles.rowWrap}>
        {CITIES_RDC.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCity(c)}
            style={[
              styles.chip,
              { backgroundColor: colors.surface, borderColor: colors.border },
              city === c && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Commune *</Text>
      <View style={styles.rowWrap}>
        {COMMUNES_KINSHASA.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCommune(c)}
            style={[
              styles.chip,
              { backgroundColor: colors.surface, borderColor: colors.border },
              commune === c && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Pays (code)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder="CD"
        placeholderTextColor={colors.textMuted}
        value={country}
        onChangeText={setCountry}
        autoCapitalize="characters"
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Bio</Text>
      <TextInput
        style={[styles.input, styles.bio, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder="Présentez-vous…"
        placeholderTextColor={colors.textMuted}
        value={bio}
        onChangeText={setBio}
        multiline
      />

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.btn, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.btnText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={[styles.btnOutline, { borderColor: colors.border }]}>
        <Text style={[styles.btnOutlineText, { color: colors.text }]}>Annuler</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  label: { fontSize: 14, marginBottom: 8, marginTop: 16 },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  bio: { height: 100, paddingTop: 14 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: { fontSize: 15 },
  btn: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  btnOutline: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  btnOutlineText: { fontSize: 16, fontWeight: '600' },
})
