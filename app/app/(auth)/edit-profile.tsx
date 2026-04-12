import { useState, useEffect } from 'react'
import { Redirect, useRouter } from 'expo-router'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { GENDER_LABELS, CITIES_RDC, COMMUNES_KINSHASA } from '../../../lib/constants'
import type { Gender } from '../../../lib/types'
import { deleteProfilePhoto, listProfilePhotos, setPrimaryPhoto, type ProfilePhotoRow, uploadProfilePhoto, insertProfilePhoto } from '../../lib/profilePhotos'

export default function EditProfileScreen() {
  const router = useRouter()
  const { colors, spacing } = useTheme()
  const { user, profile, refreshProfile, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [gender, setGender] = useState<Gender>('M')
  const [ageStr, setAgeStr] = useState('')
  const [city, setCity] = useState('Kinshasa')
  const [commune, setCommune] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('CD')
  const [modeLibre, setModeLibre] = useState(true)
  const [modeSerieux, setModeSerieux] = useState(false)
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState<ProfilePhotoRow[]>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryBusyId, setGalleryBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setUsername(profile.username)
      setGender(profile.gender as Gender)
      setAgeStr(String(profile.age ?? ''))
      setCity(profile.city || 'Kinshasa')
      setCommune(profile.commune || '')
      setBio(profile.bio || '')
      setCountry(profile.country || 'CD')
      setModeLibre(profile.mode_libre_active ?? true)
      setModeSerieux(profile.mode_serieux_active ?? false)
    }
  }, [profile?.id])

  const loadPhotos = async () => {
    if (!user?.id) return
    setGalleryLoading(true)
    try {
      const rows = await listProfilePhotos(user.id)
      setPhotos(rows)
    } catch (e: any) {
      Alert.alert('Galerie', e?.message ?? 'Impossible de charger les photos.')
    } finally {
      setGalleryLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id) loadPhotos()
  }, [user?.id])

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
    if (!modeLibre && !modeSerieux) {
      Alert.alert('Erreur', 'Choisissez au moins un mode (Libre, Sérieux, ou les deux).')
      return
    }
    setSaving(true)
    const updateWithModes = {
      username: username.trim(),
      gender,
      age,
      city,
      commune,
      mode_libre_active: modeLibre,
      mode_serieux_active: modeSerieux,
      bio: bio.trim() || null,
      country: country.trim() || 'CD',
    }
    const updateBase = {
      username: username.trim(),
      gender,
      age,
      city,
      commune,
      bio: bio.trim() || null,
      country: country.trim() || 'CD',
    }
    let { error } = await supabase.from('profiles').update(updateWithModes).eq('id', profile.id)
    if (error) {
      const msg = (error.message || '').toLowerCase()
      const missingModeCols = msg.includes('mode_libre_active') || msg.includes('mode_serieux_active')
      if (missingModeCols && msg.includes('could not find')) {
        const retry = await supabase.from('profiles').update(updateBase).eq('id', profile.id)
        error = retry.error
      }
    }
    setSaving(false)
    if (error) {
      Alert.alert('Erreur', error.message)
      return
    }
    await refreshProfile()
    Alert.alert('Profil mis à jour', 'Vos modifications ont été enregistrées.')
    router.back()
  }

  const pickAndAddPhoto = async (asPrimary = false) => {
    if (!user?.id) return
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Galerie', 'Autorisez l’accès aux photos.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      setGalleryBusyId('upload')
      const url = await uploadProfilePhoto(user.id, asset.uri, asset.mimeType)
      const id = await insertProfilePhoto(user.id, url, asPrimary || photos.length === 0)
      if (asPrimary || photos.length === 0) await setPrimaryPhoto(user.id, id, url)
      await refreshProfile()
      await loadPhotos()
    } catch (e: any) {
      Alert.alert('Galerie', e?.message ?? 'Upload photo impossible.')
    } finally {
      setGalleryBusyId(null)
    }
  }

  const makePrimary = async (p: ProfilePhotoRow) => {
    if (!user?.id) return
    try {
      setGalleryBusyId(p.id)
      await setPrimaryPhoto(user.id, p.id, p.photo_url)
      await refreshProfile()
      await loadPhotos()
    } catch (e: any) {
      Alert.alert('Galerie', e?.message ?? 'Impossible de définir la photo principale.')
    } finally {
      setGalleryBusyId(null)
    }
  }

  const removePhoto = async (p: ProfilePhotoRow) => {
    if (!user?.id) return
    try {
      setGalleryBusyId(p.id)
      await deleteProfilePhoto(user.id, p)
      await refreshProfile()
      await loadPhotos()
    } catch (e: any) {
      Alert.alert('Galerie', e?.message ?? 'Suppression impossible.')
    } finally {
      setGalleryBusyId(null)
    }
  }

  if (!loading && !user) return <Redirect href="/(auth)/welcome" />
  if (!loading && user && !profile) return <Redirect href="/(auth)/create-profile" />

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

      <Text style={[styles.label, { color: colors.textSecondary }]}>Mode de rencontre *</Text>
      <View style={styles.rowWrap}>
        <Pressable
          onPress={() => setModeLibre((v) => !v)}
          style={[
            styles.chip,
            { backgroundColor: colors.surface, borderColor: colors.border },
            modeLibre && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
          ]}
        >
          <Text style={[styles.chipText, { color: colors.text }]}>Mode Libre</Text>
        </Pressable>
        <Pressable
          onPress={() => setModeSerieux((v) => !v)}
          style={[
            styles.chip,
            { backgroundColor: colors.surface, borderColor: colors.border },
            modeSerieux && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
          ]}
        >
          <Text style={[styles.chipText, { color: colors.text }]}>Mode Sérieux</Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Photos</Text>
      <View style={styles.photosHeader}>
        <Pressable onPress={() => pickAndAddPhoto(false)} disabled={galleryBusyId !== null} style={[styles.photoBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text }}>Ajouter une photo</Text>
        </Pressable>
        <Pressable onPress={() => pickAndAddPhoto(true)} disabled={galleryBusyId !== null} style={[styles.photoBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text }}>Remplacer principale</Text>
        </Pressable>
      </View>
      {galleryLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
      ) : (
        <View style={styles.galleryGrid}>
          {photos.map((p) => (
            <View key={p.id} style={[styles.photoCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Image source={{ uri: p.photo_url }} style={styles.photo} contentFit="cover" />
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                {p.is_primary ? 'Principale' : 'Secondaire'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {!p.is_primary ? (
                  <Pressable onPress={() => makePrimary(p)} disabled={galleryBusyId !== null} style={[styles.smallBtn, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.text, fontSize: 12 }}>Définir principale</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => removePhoto(p)} disabled={galleryBusyId !== null} style={[styles.smallBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.error ?? '#ff4d4f', fontSize: 12 }}>{galleryBusyId === p.id ? '...' : 'Supprimer'}</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {photos.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>Aucune photo secondaire pour le moment.</Text>
          ) : null}
        </View>
      )}

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
  photosHeader: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  photoBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  galleryGrid: { marginTop: 12, gap: 10 },
  photoCard: { borderWidth: 1, borderRadius: 12, padding: 10 },
  photo: { width: '100%', height: 180, borderRadius: 10, marginBottom: 8 },
  smallBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
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
