import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { GENDER_LABELS } from '../../../../lib/constants'
import { canViewFullProfiles, remainingContacts } from '../../../../lib/access'
import { supabase } from '@/lib/supabase'
import type { Profile } from '../../../../lib/types'
import { getProfilePrivateDetails } from '../../../lib/profilePrivateDetailsRpc'
import { listProfilePhotos, type ProfilePhotoRow } from '../../../lib/profilePhotos'
import { unlockProfileContact, unlockProfilePhoto } from '../../../lib/profileAccessRpc'
import { blockProfile } from '../../../lib/profileModerationRpc'

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

export default function ProfileDetailScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { user, profile: myProfile, profileAccess, refreshProfile } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const reportOn = isOn('reporting_enabled')
  const reciprocalEnabled = isOn('reciprocal_matching_enabled')
  const params = useLocalSearchParams<{ id?: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(!!params.id)
  const [openingChat, setOpeningChat] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [photos, setPhotos] = useState<ProfilePhotoRow[]>([])
  const [photoAccessReady, setPhotoAccessReady] = useState(false)
  const [photoAccessChecking, setPhotoAccessChecking] = useState(false)
  const [photoAccessMessage, setPhotoAccessMessage] = useState<string | null>(null)

  const canViewFull = canViewFullProfiles(myProfile?.gender, profileAccess)

  useEffect(() => {
    if (!params.id) return
    const load = async () => {
      const core =
        'id,created_at,gender,city,commune,status,is_verified,username,age,boost_reason,boosted_until,is_boosted,country,role'
      const { data: coreRow, error: coreErr } = await supabase.from('profiles').select(core).eq('id', params.id).single()
      if (coreErr) {
        setProfile(null)
        return
      }
      const merged = coreRow as Profile | null
      setProfile(merged ? { ...merged, photo: null, bio: null } : null)
      setPhotos([])
      setLoading(false)
    }
    load()
  }, [params.id])

  useEffect(() => {
    if (!profile?.id || !photoAccessReady) {
      setPhotos([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const sensitive = await getProfilePrivateDetails(profile.id)
        if (!cancelled && sensitive) {
          setProfile((prev) => (prev ? { ...prev, photo: sensitive.photo, bio: sensitive.bio } : prev))
        }
      } catch {
        if (!cancelled) {
          setProfile((prev) => (prev ? { ...prev, photo: null, bio: null } : prev))
        }
      }
      try {
        const rows = await listProfilePhotos(profile.id)
        if (!cancelled) setPhotos(rows)
      } catch {
        if (!cancelled) setPhotos([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile?.id, photoAccessReady])

  useEffect(() => {
    if (!user?.id || !profile?.id) {
      setPhotoAccessReady(false)
      setPhotoAccessChecking(false)
      setPhotoAccessMessage(null)
      return
    }

    const canUseLegacyAccess =
      user.id === profile.id ||
      (canViewFull &&
        !(
          normalizeGender(myProfile?.gender) === 'F' &&
          normalizeGender(profile.gender) === 'M' &&
          !reciprocalEnabled
        ))

    if (!canUseLegacyAccess) {
      setPhotoAccessReady(false)
      setPhotoAccessChecking(false)
      setPhotoAccessMessage(null)
      return
    }

    if (user.id === profile.id) {
      setPhotoAccessReady(true)
      setPhotoAccessChecking(false)
      setPhotoAccessMessage(null)
      return
    }

    let cancelled = false
    setPhotoAccessChecking(true)
    setPhotoAccessMessage(null)
    void unlockProfilePhoto(profile.id, 'global')
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          setPhotoAccessReady(true)
          setPhotoAccessMessage(null)
        } else {
          setPhotoAccessReady(false)
          setPhotoAccessMessage(res.message ?? 'Acces photo non autorise.')
        }
      })
      .finally(() => {
        if (!cancelled) setPhotoAccessChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.id, profile?.id, profile?.gender, myProfile?.gender, canViewFull, reciprocalEnabled])

  if (!params.id) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Profil</Text>
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>ID manquant.</Text>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>Retour</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Profil</Text>
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
          Chargement ou profil non trouvé.
        </Text>
      </View>
    )
  }

  const contactsLeft = remainingContacts(profileAccess)
  const canViewTargetFull =
    canViewFull &&
    photoAccessReady &&
    !(
      normalizeGender(myProfile?.gender) === 'F' &&
      normalizeGender(profile.gender) === 'M' &&
      !reciprocalEnabled
    )

  const openConversation = async () => {
    if (!user?.id || !profile) return
    setOpeningChat(true)
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id,participant_ids')
        .contains('participant_ids', [user.id])
      const convs = (existing ?? []) as { id: string; participant_ids?: string[] }[]
      let convId: string | null = null
      for (const c of convs) {
        const ids = c.participant_ids ?? []
        if (ids.includes(profile.id)) {
          convId = c.id
          break
        }
      }
      if (!convId) {
        const unlock = await unlockProfileContact(profile.id, 'global')
        if (!unlock.ok) {
          throw new Error(unlock.message || 'Acces contact non autorise.')
        }
        const { data: newConv, error: createErr } = await supabase
          .from('conversations')
          .insert({
            participant_ids: [user.id, profile.id],
          })
          .select('id')
          .single()
        if (createErr) throw createErr
        convId = (newConv as { id: string }).id
        await refreshProfile()
      }
      if (convId) router.push({ pathname: '/(app)/conversation/[id]', params: { id: convId } })
    } catch (e: any) {
      const message = e?.message ?? 'Impossible d\'ouvrir la conversation.'
      if (String(message).toLowerCase().includes('quota')) {
        router.push('/(app)/packs')
        return
      }
      Alert.alert('Erreur', message)
    } finally {
      setOpeningChat(false)
    }
  }

  const reportProfile = async () => {
    if (!user?.id || !profile) return
    Alert.alert(
      'Signaler ce profil',
      'Voulez-vous signaler ce profil pour modération ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Signaler',
          style: 'destructive',
          onPress: async () => {
            setReporting(true)
            try {
              const { error } = await supabase.from('reports').insert({
                reporter_id: user.id,
                reported_id: profile.id,
                type: 'inappropriate',
                reason: 'Signalé depuis l\'app par l\'utilisateur',
                status: 'pending',
              })
              if (error) throw error
              Alert.alert('Merci', 'Votre signalement a été enregistré. L\'équipe le traitera.')
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Impossible d\'envoyer le signalement.')
            } finally {
              setReporting(false)
            }
          },
        },
      ]
    )
  }

  const hideProfile = async () => {
    if (!profile?.id || blocking) return
    Alert.alert(
      'Masquer ce profil',
      "Ce profil n'apparaitra plus dans votre recherche. Vous pouvez aussi le signaler si necessaire.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Masquer',
          style: 'destructive',
          onPress: async () => {
            setBlocking(true)
            try {
              await blockProfile(profile.id)
              Alert.alert('Profil masque', "Ce profil n'apparaitra plus dans votre feed.")
              router.back()
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Impossible de masquer ce profil.')
            } finally {
              setBlocking(false)
            }
          },
        },
      ]
    )
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retour</Text>
      </Pressable>
      {profile && reportOn ? (
        <View style={styles.moderationRow}>
          <Pressable
            onPress={hideProfile}
            disabled={blocking}
            style={[styles.reportBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.reportBtnText, { color: colors.textMuted }]}>
              {blocking ? 'Masquage...' : 'Masquer'}
            </Text>
          </Pressable>
          {canViewTargetFull ? (
            <Pressable
              onPress={reportProfile}
              disabled={reporting}
              style={[styles.reportBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.reportBtnText, { color: colors.textMuted }]}>
                {reporting ? 'Envoi...' : 'Signaler'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {canViewTargetFull ? (
        <>
          {photoAccessChecking ? (
            <ActivityIndicator color={colors.primary} style={{ marginBottom: 16 }} />
          ) : null}
          {profile.photo ? (
            <Image source={{ uri: profile.photo }} style={styles.heroPhoto} resizeMode="cover" />
          ) : null}
          <Text style={[styles.name, { color: colors.text }]}>{profile.username}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {profile.age} ans • {GENDER_LABELS[profile.gender]} • {profile.city}, {profile.commune ?? '—'}
          </Text>
          {profile.bio ? (
            <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>
          ) : null}
          {photos.length > 0 ? (
            <View style={[styles.section, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Galerie</Text>
              <View style={styles.gallery}>
                {photos.map((p) => (
                  <Image key={p.id} source={{ uri: p.photo_url }} style={styles.galleryPhoto} resizeMode="cover" />
                ))}
              </View>
            </View>
          ) : null}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Contact</Text>
            <Text style={[styles.placeholder, { color: contactsLeft > 0 ? colors.textSecondary : colors.warning }]}>
              {contactsLeft > 0 ? `Contacts restants : ${contactsLeft}` : 'Quota atteint : achat requis'}
            </Text>
            <Pressable
              onPress={openConversation}
              disabled={openingChat}
              style={[styles.ctaBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
            >
              <Text style={styles.ctaBtnText}>
                {openingChat ? 'Ouverture...' : 'Débloquer et envoyer un message'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.card }]}>
            <Text style={styles.avatarEmoji}>👤</Text>
          </View>
          <Text style={[styles.name, { color: colors.text }]}>Profil</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {profile.age} ans • {profile.city}, {profile.commune ?? '—'}
          </Text>
          <Text style={[styles.lockHint, { color: colors.textMuted }]}>
            {photoAccessMessage ?? "Débloquez l'accès pour voir les photos et le profil complet"}
          </Text>
          <Pressable
            onPress={() => router.push('/(app)/payments')}
            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.ctaBtnText}>Débloquer l'accès</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 56 },
  back: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '700' },
  name: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  meta: { fontSize: 16, marginBottom: 4 },
  bio: { fontSize: 16, lineHeight: 24, marginBottom: 24 },
  section: { padding: 20, borderRadius: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 14, marginBottom: 12 },
  placeholder: { fontSize: 14 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  heroPhoto: { width: '100%', aspectRatio: 1, borderRadius: 16, marginBottom: 16 },
  avatarPlaceholder: {
    width: '100%',
    aspectRatio: 0.9,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarEmoji: { fontSize: 64 },
  lockHint: { fontSize: 15, marginTop: 8, marginBottom: 24, fontStyle: 'italic' },
  ctaBtn: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  reportBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  moderationRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 16 },
  reportBtnText: { fontSize: 14 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galleryPhoto: { width: 90, height: 90, borderRadius: 8 },
})
