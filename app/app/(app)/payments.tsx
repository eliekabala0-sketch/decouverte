import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { canViewFullProfiles, remainingContacts } from '../../../lib/access'
import { supabase } from '@/lib/supabase'
import {
  GENDER_REQUIRES_PROFILES_ACCESS_PAYMENT,
  PAYMENT_METADATA_KIND_VISIBILITY_BOOST,
  PAYMENT_PROVIDER_BADIBOSS,
  PROFILES_ACCESS_DAYS,
  VISIBILITY_BOOST_TIERS,
} from '../../../lib/constants'
import { extendBoostedUntil, formatBoostStatusLabel } from '../../../lib/boostVisibility'
import type { Profile } from '../../../lib/types'

function formatUsd(cents: number) {
  return `${(cents / 100).toFixed(2)} USD`
}

export default function PaymentsScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const { user, profile, profileAccess, refreshProfile } = useAuth()
  const { isOn } = useAppFeatureFlags()

  const reciprocal = isOn('reciprocal_matching_enabled')
  const boostFlag = isOn('boost_enabled')
  const packsModuleOn = isOn('contact_packs_enabled')

  const requiresProfilesPayment = profile
    ? GENDER_REQUIRES_PROFILES_ACCESS_PAYMENT.includes(profile.gender) || (profile.gender === 'F' && reciprocal)
    : false
  const hasProfilesAccess = profile ? canViewFullProfiles(profile.gender, profileAccess) : false
  const contactsLeft = remainingContacts(profileAccess)
  const showContactPacks =
    !!profile && packsModuleOn && (profile.gender === 'M' || (profile.gender === 'F' && reciprocal))
  const canBuyBoost = !!boostFlag && !!profile

  const [boostTierIdx, setBoostTierIdx] = useState(0)
  const [boostPendingId, setBoostPendingId] = useState<string | null>(null)
  const [boostBusy, setBoostBusy] = useState(false)

  useEffect(() => {
    if (!user?.id || !canBuyBoost) {
      setBoostPendingId(null)
      return
    }
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('payments')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .contains('metadata', { payment_kind: PAYMENT_METADATA_KIND_VISIBILITY_BOOST })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled) setBoostPendingId((data as { id?: string } | null)?.id ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, canBuyBoost, profile?.id, profile?.boosted_until, profile?.boost_reason])

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
    } catch (e: unknown) {
      Alert.alert('Paiement', e instanceof Error ? e.message : "Impossible d'activer l'accès.")
    }
  }

  const createBoostOrder = async () => {
    if (!user?.id || !profile || boostBusy) return
    const tier = VISIBILITY_BOOST_TIERS[boostTierIdx]
    setBoostBusy(true)
    try {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          provider: PAYMENT_PROVIDER_BADIBOSS,
          amount_cents: tier.amount_cents,
          currency: 'USD',
          status: 'pending',
          metadata: {
            payment_kind: PAYMENT_METADATA_KIND_VISIBILITY_BOOST,
            duration_days: tier.days,
            profile_id: profile.id,
            tier_label: tier.label,
          },
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message || error.code || 'Échec création commande boost')
      const id = (data as { id: string }).id
      setBoostPendingId(id)
      Alert.alert(
        'Commande créée',
        `Montant : ${formatUsd(tier.amount_cents)}. Après paiement sur Badiboss Pay, appuyez sur « Confirmer le paiement ».`
      )
    } catch (e: unknown) {
      Alert.alert('Boost', e instanceof Error ? e.message : 'Impossible de créer la commande.')
    } finally {
      setBoostBusy(false)
    }
  }

  const confirmBoostPayment = async () => {
    if (!user?.id || !profile || !boostPendingId || boostBusy) return
    setBoostBusy(true)
    try {
      const { data: pay, error: selErr } = await supabase
        .from('payments')
        .select('id,status,metadata')
        .eq('id', boostPendingId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (selErr) throw new Error(selErr.message || 'Lecture paiement impossible')
      const row = pay as {
        status?: string
        metadata?: { payment_kind?: string; duration_days?: number }
      } | null
      if (!row || row.status !== 'pending') {
        throw new Error('Aucune commande boost en attente pour ce compte.')
      }
      if (row.metadata?.payment_kind !== PAYMENT_METADATA_KIND_VISIBILITY_BOOST) {
        throw new Error('Cette commande n’est pas une mise en avant valide.')
      }
      const days = Number(row.metadata?.duration_days) || VISIBILITY_BOOST_TIERS[0].days

      const { error: upPay } = await supabase
        .from('payments')
        .update({ status: 'completed' })
        .eq('id', boostPendingId)
        .eq('user_id', user.id)
        .eq('status', 'pending')
      if (upPay) throw new Error(upPay.message || 'Impossible de valider le paiement (droits RLS ?).')

      const newUntil = extendBoostedUntil(profile as Profile, days)
      const patch: Record<string, unknown> = {
        boosted_until: newUntil,
        is_boosted: true,
      }
      if (!profile.boost_reason?.trim()) {
        patch.boost_reason = 'paid'
      }
      const { error: prErr } = await supabase.from('profiles').update(patch).eq('id', profile.id)
      if (prErr) throw new Error(prErr.message || 'Mise à jour profil impossible (colonnes boost ?).')

      setBoostPendingId(null)
      await refreshProfile()
      Alert.alert(
        'Boost activé',
        `Mise en avant enregistrée jusqu’au ${new Date(newUntil).toLocaleDateString('fr-FR')}.`
      )
    } catch (e: unknown) {
      Alert.alert('Boost', e instanceof Error ? e.message : 'Confirmation impossible.')
    } finally {
      setBoostBusy(false)
    }
  }

  const renderBoostBlock = (opts: { prominent?: boolean }) => {
    if (!profile || !canBuyBoost) return null
    const prominent = !!opts.prominent
    const tier = VISIBILITY_BOOST_TIERS[boostTierIdx]
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: c.surface },
          prominent ? { borderWidth: 1, borderColor: c.primary } : null,
        ]}
      >
        <Text style={[styles.cardTitle, { color: c.text }]}>Mise en avant publicitaire (boost)</Text>
        <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
          Campagne payante : choisissez la durée, créez la commande, payez sur Badiboss, puis confirmez ici pour
          activer la visibilité (listes + badge). Aucune activation sans confirmation de paiement.
        </Text>
        <Text style={[styles.status, { color: c.textMuted }]}>État : {formatBoostStatusLabel(profile)}</Text>

        <Text style={[styles.tierLabel, { color: c.text }]}>Durée</Text>
        <View style={styles.tierRow}>
          {VISIBILITY_BOOST_TIERS.map((t, i) => (
            <Pressable
              key={t.days}
              onPress={() => setBoostTierIdx(i)}
              style={[
                styles.tierChip,
                {
                  borderColor: boostTierIdx === i ? c.primary : c.border,
                  backgroundColor: boostTierIdx === i ? c.primarySoft : c.surfaceElevated,
                },
              ]}
            >
              <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{t.label}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{formatUsd(t.amount_cents)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.priceLine, { color: c.text }]}>
          Total à payer : {formatUsd(tier.amount_cents)} — {tier.label}
        </Text>

        {boostPendingId ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.cardDesc, { color: c.warning }]}>
              Commande en attente de paiement. Après Badiboss Pay, confirmez pour activer le boost.
            </Text>
            <Pressable
              onPress={confirmBoostPayment}
              disabled={boostBusy}
              style={[styles.btn, { backgroundColor: c.primary, opacity: boostBusy ? 0.7 : 1 }]}
            >
              {boostBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Confirmer le paiement (après Badiboss)</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={createBoostOrder}
            disabled={boostBusy}
            style={[styles.btn, { backgroundColor: c.accent, opacity: boostBusy ? 0.7 : 1 }]}
          >
            {boostBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Créer la commande et payer sur Badiboss</Text>
            )}
          </Pressable>
        )}
      </View>
    )
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.primary, fontWeight: '600' }}>Retour</Text>
      </Pressable>
      <Text style={[styles.title, { color: c.text }]}>Paiements & Packs</Text>

      {profile?.gender === 'F' && !reciprocal && canBuyBoost ? renderBoostBlock({ prominent: true }) : null}

      {requiresProfilesPayment ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Accès profils / photos</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            {profile?.gender === 'F' && reciprocal
              ? 'Mode réciproque : même logique d’accès payant que pour les hommes pour voir les profils du genre recherché.'
              : 'Débloquez l’affichage complet via quota photo premium ou pack (voir profile_access).'}
          </Text>
          {profile ? (
            <Text style={[styles.status, { color: hasProfilesAccess ? c.success : c.textMuted }]}>
              {hasProfilesAccess
                ? profileAccess?.all_profiles_access
                  ? 'Accès premium actif'
                  : `Quota photos utilisé : ${profileAccess?.photo_quota_used ?? 0} / ${profileAccess?.photo_quota ?? 0}`
                : 'Non actif'}
            </Text>
          ) : null}
          <Pressable onPress={buyProfilesAccess} style={[styles.btn, { backgroundColor: c.primary }]}>
            <Text style={styles.btnText}>Payer avec Badiboss Pay</Text>
          </Pressable>
        </View>
      ) : profile?.gender === 'F' ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Accès profils / photos</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            Sans réciprocité, vous n’achetez pas l’accès « type homme ». Utilisez la mise en avant ci-dessus pour la
            visibilité.
          </Text>
        </View>
      ) : null}

      {showContactPacks ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Packs contacts</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            Quotas contacts + options photo selon le pack (parcours homme, ou femme si réciprocité activée).
          </Text>
          <Text style={[styles.status, { color: contactsLeft > 0 ? c.textSecondary : c.warning }]}>
            {contactsLeft > 0 ? `Contacts restants : ${contactsLeft}` : 'Quota atteint : achat requis'}
          </Text>
          <Pressable onPress={() => router.push('/(app)/packs')} style={[styles.btn, { backgroundColor: c.accent }]}>
            <Text style={styles.btnText}>Voir les packs</Text>
          </Pressable>
        </View>
      ) : null}

      {!(profile?.gender === 'F' && !reciprocal) && canBuyBoost ? renderBoostBlock({ prominent: false }) : null}
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
  tierLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  tierChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: '30%',
  },
  priceLine: { fontSize: 15, fontWeight: '600', marginBottom: 14 },
  btn: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
})
