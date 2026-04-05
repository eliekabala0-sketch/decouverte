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
import { GENDER_LABELS } from '../../../../lib/constants'
import { canUnlockContact, canViewFullProfiles, remainingContacts } from '../../../../lib/access'
import { supabase } from '@/lib/supabase'
import type { Profile } from '../../../../lib/types'

export default function ProfileDetailScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { user, profile: myProfile, profileAccess, refreshProfile } = useAuth()
  const params = useLocalSearchParams<{ id?: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(!!params.id)
  const [unlocking, setUnlocking] = useState(false)
  const [openingChat, setOpeningChat] = useState(false)
  const [reporting, setReporting] = useState(false)

  const canViewFull = canViewFullProfiles(myProfile?.gender, profileAccess)

  useEffect(() => {
    if (!params.id) return
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select(
          'id,created_at,phone,photo,gender,city,commune,bio,status,is_verified,username,age,boost_reason,country,role'
        )
        .eq('id', params.id)
        .single()
      setProfile(data as Profile | null)
      setLoading(false)
    }
    load()
  }, [params.id])

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

  const openConversation = async () => {
    if (!user?.id || !profile) return
    if (!canUnlockContact(profileAccess)) {
      router.push('/(app)/packs')
      return
    }
    setOpeningChat(true)
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .contains('participant_ids', [user.id])
      const convs = (existing ?? []) as { id: string; participant_ids?: string[] }[]
      let convId: string | null = null
      for (const c of convs) {
        const full = await supabase.from('conversations').select('participant_ids').eq('id', c.id).single()
        const ids = (full.data as { participant_ids: string[] } | null)?.participant_ids ?? []
        if (ids.includes(profile.id)) {
          convId = c.id
          break
        }
      }
      if (!convId) {
        const currentUsed = profileAccess?.contact_quota_used ?? 0
        const { data: newConv, error: createErr } = await supabase
          .from('conversations')
          .insert({
            participant_ids: [user.id, profile.id],
          })
          .select('id')
          .single()
        if (createErr) throw createErr
        convId = (newConv as { id: string }).id
        await supabase
          .from('profile_access')
          .update({
            contact_quota_used: currentUsed + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
        await refreshProfile()
      }
      if (convId) router.push({ pathname: '/(app)/conversation/[id]', params: { id: convId } })
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible d\'ouvrir la conversation.')
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

  const unlockContact = async () => {
    if (!user?.id) return
    if (!canUnlockContact(profileAccess)) {
      router.push('/(app)/packs')
      return
    }
    try {
      setUnlocking(true)
      const currentUsed = profileAccess?.contact_quota_used ?? 0
      const { error } = await supabase
        .from('profile_access')
        .update({
          contact_quota_used: currentUsed + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
      if (error) throw error
      await refreshProfile()
      Alert.alert('Contact débloqué', '1 contact a été consommé.')
    } catch (e: any) {
      Alert.alert('Contacts', e?.message ?? 'Impossible de débloquer le contact.')
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retour</Text>
      </Pressable>
      {canViewFull && profile ? (
        <Pressable
          onPress={reportProfile}
          disabled={reporting}
          style={[styles.reportBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.reportBtnText, { color: colors.textMuted }]}>
            {reporting ? 'Envoi…' : 'Signaler ce profil'}
          </Text>
        </Pressable>
      ) : null}
      {canViewFull ? (
        <>
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
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Contact</Text>
            <Text style={[styles.placeholder, { color: contactsLeft > 0 ? colors.textSecondary : colors.warning }]}>
              {contactsLeft > 0 ? `Contacts restants : ${contactsLeft}` : 'Quota atteint : achat requis'}
            </Text>
            <Pressable
              onPress={openConversation}
              disabled={openingChat || !canUnlockContact(profileAccess)}
              style={[styles.ctaBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
            >
              <Text style={styles.ctaBtnText}>
                {openingChat ? 'Ouverture...' : 'Envoyer un message'}
              </Text>
            </Pressable>
            <Pressable
              onPress={unlockContact}
              disabled={unlocking}
              style={[
                styles.ctaBtn,
                { backgroundColor: contactsLeft > 0 ? colors.accent : colors.primary, marginTop: 8 },
              ]}
            >
              <Text style={styles.ctaBtnText}>
                {contactsLeft > 0 ? (unlocking ? 'Déblocage...' : 'Débloquer le contact') : 'Acheter un pack'}
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
            Débloquez l'accès pour voir les photos et le profil complet
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
  reportBtnText: { fontSize: 14 },
})
