import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const BUCKET = 'admin-media'

async function readImageForUpload(uri: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const res = await fetch(uri)
  const blob = await res.blob()
  const contentType = blob.type && blob.type !== '' ? blob.type : 'image/jpeg'
  const data = await blob.arrayBuffer()
  return { data, contentType }
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
        allowsEditing: true,
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
      const { data: bytes, contentType } = await readImageForUpload(localUri)
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
      const path = `avatars/${user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      })
      if (upErr) {
        setErrorText(upErr.message || 'Échec de l’envoi de l’image.')
        return
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = pub.publicUrl
      const { error: dbErr } = await supabase.from('profiles').update({ photo: publicUrl }).eq('id', user.id)
      if (dbErr) {
        setErrorText(dbErr.message || 'Erreur lors de l’enregistrement du profil.')
        return
      }
      await refreshProfile()
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
