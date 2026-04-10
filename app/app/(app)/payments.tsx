import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { canViewFullProfiles, remainingContacts } from '../../../lib/access'
import { supabase } from '@/lib/supabase'
import { GENDER_REQUIRES_PROFILES_ACCESS_PAYMENT, PAYMENT_PROVIDER_BADIBOSS, PROFILES_ACCESS_DAYS } from '../../../lib/constants'

export default function PaymentsScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const { user, profile, profileAccess, refreshProfile } = useAuth()

  const requiresProfilesPayment = profile
    ? GENDER_REQUIRES_PROFILES_ACCESS_PAYMENT.includes(profile.gender)
    : false
  const hasProfilesAccess = profile ? canViewFullProfiles(profile.gender, profileAccess) : false
  const contactsLeft = remainingContacts(profileAccess)
  const canBuyBoost = profile?.gender === 'F'

  const buyProfilesAccess = async () => {
    if (!user?.id || !profile) return
    try {
      const until = new Date(Date.now() + PROFILES_ACCESS_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const { error: payErr } = await supabase.from('payments').insert({
        user_id: user.id,
        type: 'profiles_access',
        provider: PAYMENT_PROVIDER_BADIBOSS,
        amount_cents: 0,
        currency: 'USD',
        status: 'completed',
        metadata: { days: PROFILES_ACCESS_DAYS, until },
      })
      if (payErr) throw new Error(payErr.message || payErr.code || 'Échec enregistrement paiement')

      const currentQuota = profileAccess?.contact_quota ?? 0
      const currentUsed = profileAccess?.contact_quota_used ?? 0
      const pq = profileAccess?.photo_quota ?? 0
      const pu = profileAccess?.photo_quota_used ?? 0
      const { error } = await supabase.from('profile_access').upsert(
        {
          user_id: user.id,
          contact_quota: currentQuota,
          contact_quota_used: currentUsed,
          photo_quota: pq + 100,
          photo_quota_used: pu,
          all_profiles_access: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      if (error) throw new Error(error.message || error.code || 'Échec mise à jour accès profil')
      await refreshProfile()
      Alert.alert('Accès activé', 'Accès profils/photos activé (simulation paiement).')
    } catch (e: any) {
      Alert.alert('Paiement', e?.message ?? "Impossible d'activer l'accès.")
    }
  }

  const buyVisibilityBoost = async () => {
    if (!user?.id || !profile) return
    try {
      await supabase.from('payments').insert({
        user_id: user.id,
        provider: PAYMENT_PROVIDER_BADIBOSS,
        amount: 0,
        currency: 'USD',
        status: 'completed',
      })
      const { error } = await supabase.from('profiles').update({ boost_reason: 'paid' }).eq('id', user.id)
      if (error) throw error
      await refreshProfile()
      Alert.alert('Boost activé', 'Votre profil est mis en avant.')
    } catch (e: any) {
      Alert.alert('Boost', e?.message ?? 'Impossible d’activer le boost.')
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.primary, fontWeight: '600' }}>Retour</Text>
      </Pressable>
      <Text style={[styles.title, { color: c.text }]}>Paiements & Packs</Text>
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Accès profils / photos</Text>
        <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
          Hommes : débloquez l’affichage complet via quota photo premium ou pack (voir schéma profile_access).
        </Text>
        {profile ? (
          <Text style={[styles.status, { color: hasProfilesAccess ? c.success : c.textMuted }]}>
            {hasProfilesAccess
              ? profileAccess?.all_profiles_access
                ? 'Accès premium actif'
                : `Quota photos utilisé : ${profileAccess?.photo_quota_used ?? 0} / ${profileAccess?.photo_quota ?? 0}`
              : requiresProfilesPayment
                ? 'Non actif'
                : 'Inscription libre'}
          </Text>
        ) : null}
        <Pressable
          onPress={buyProfilesAccess}
          style={[styles.btn, { backgroundColor: c.primary }]}
        >
          <Text style={styles.btnText}>Payer avec Badiboss Pay</Text>
        </Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Packs contacts</Text>
        <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
          Quotas contacts + options photo selon le pack
        </Text>
        <Text style={[styles.status, { color: contactsLeft > 0 ? c.textSecondary : c.warning }]}>
          {contactsLeft > 0 ? `Contacts restants : ${contactsLeft}` : 'Quota atteint : achat requis'}
        </Text>
        <Pressable onPress={() => router.push('/(app)/packs')} style={[styles.btn, { backgroundColor: c.accent }]}>
          <Text style={styles.btnText}>Voir les packs</Text>
        </Pressable>
      </View>
      {canBuyBoost ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Boost visibilité</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            Mettez votre profil en avant auprès des utilisateurs.
          </Text>
          <Text style={[styles.status, { color: profile?.boost_reason ? c.success : c.textMuted }]}>
            {profile?.boost_reason ? 'Boost actif' : 'Boost inactif'}
          </Text>
          <Pressable onPress={buyVisibilityBoost} style={[styles.btn, { backgroundColor: c.primary }]}>
            <Text style={styles.btnText}>{profile?.boost_reason ? 'Réactiver le boost' : 'Activer le boost'}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 24 },
  card: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  cardDesc: { fontSize: 15, marginBottom: 16 },
  status: { fontSize: 14, marginBottom: 12 },
  btn: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
})
