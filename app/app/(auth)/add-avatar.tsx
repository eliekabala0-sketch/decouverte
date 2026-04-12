import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { insertProfilePhoto, setPrimaryPhoto, uploadProfilePhoto } from '../../lib/profilePhotos'
const REFRESH_MS = 8000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} (délai ${ms / 1000}s dépassé)`)), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

export default function AddAvatarScreen() {
  const router = useRouter()
  const { colors, spacing } = useTheme()
  const { user, profile, refreshProfile, loading } = useAuth()

  const [localUri, setLocalUri] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorText, setErrorText] = useState('')

  const pickImage = async () => {
    setErrorText('')
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        setErrorText('Accès à la galerie refusé. Autorisez les photos dans les paramètres.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // Web : le recadrage produit souvent une URI où fetch() ne se termine jamais → pas de crop sur web.
        allowsEditing: Platform.OS !== 'web',
        aspect: [1, 1],
        quality: 0.85,
      })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      setLocalUri(asset.uri)
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Impossible d’ouvrir la galerie.')
    }
  }

  const uploadAndSave = async () => {
    setErrorText('')
    if (!user?.id || !localUri) return
    setSaving(true)
    try {
      const publicUrl = await uploadProfilePhoto(user.id, localUri)
      const photoId = await insertProfilePhoto(user.id, publicUrl, true)
      await setPrimaryPhoto(user.id, photoId, publicUrl)

      try {
        await withTimeout(refreshProfile(), REFRESH_MS, 'Actualisation du profil')
      } catch {
        // La ligne DB est à jour ; évite de bloquer la navigation si refresh réseau/Auth reste en attente.
      }
      router.replace('/(app)/home')
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Erreur lors de l’upload.')
    } finally {
      setSaving(false)
    }
  }

  if (!loading && !user) return <Redirect href="/(auth)/welcome" />
  if (!loading && user && !profile) return <Redirect href="/(auth)/create-profile" />
  if (!loading && user && profile?.photo) return <Redirect href="/(app)/home" />

  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.lg }]}>
      <Text style={[styles.title, { color: colors.text }]}>Photo de profil</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Choisissez une photo dans votre galerie. Elle sera votre photo principale.
      </Text>

      {localUri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: localUri }} style={styles.preview} contentFit="cover" />
          <Pressable
            onPress={pickImage}
            disabled={saving}
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Choisir une autre photo</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={pickImage}
          disabled={saving}
          style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.pickBtnText, { color: colors.text }]}>Choisir une photo</Text>
        </Pressable>
      )}

      <Pressable
        onPress={uploadAndSave}
        disabled={saving || !localUri}
        style={[
          styles.btn,
          { backgroundColor: colors.primary, opacity: saving || !localUri ? 0.5 : 1 },
        ]}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Enregistrer et continuer</Text>
        )}
      </Pressable>

      {errorText ? <Text style={[styles.error, { color: colors.error ?? '#ff4d4f' }]}>{errorText}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, marginBottom: 24 },
  previewWrap: { marginBottom: 20, alignItems: 'center' },
  preview: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginBottom: 16,
  },
  pickBtn: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pickBtnText: { fontSize: 17, fontWeight: '600' },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  btn: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  error: { marginTop: 16, fontSize: 14 },
})
