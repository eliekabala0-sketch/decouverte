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
  PAYMENT_PROVIDER_VISIBILITY_BOOST,
  VISIBILITY_BOOST_TIERS,
} from '../../../lib/constants'
import { formatBoostStatusLabel } from '../../../lib/boostVisibility'

type BoostTier = { days: number; label: string; amount: number }

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

function formatUsd(amount: number) {
  return `${amount.toFixed(2)} USD`
}

function makeTransactionRef(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function PaymentsScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const { user, profile, profileAccess, refreshProfile } = useAuth()
  const { isOn } = useAppFeatureFlags()

  const reciprocal = isOn('reciprocal_matching_enabled')
  const boostFlag = isOn('boost_enabled')
  const maleBoostRequiresReciprocity = isOn('male_boost_requires_reciprocity')
  const packsModuleOn = isOn('contact_packs_enabled')

  const requiresProfilesPayment = profile
    ? GENDER_REQUIRES_PROFILES_ACCESS_PAYMENT.includes(normalizeGender(profile.gender)) ||
      (normalizeGender(profile.gender) === 'F' && reciprocal)
    : false
  const hasProfilesAccess = profile ? canViewFullProfiles(profile.gender, profileAccess) : false
  const contactsLeft = remainingContacts(profileAccess)
  const showContactPacks =
    !!profile && packsModuleOn && (normalizeGender(profile.gender) === 'M' || (normalizeGender(profile.gender) === 'F' && reciprocal))
  const canBuyBoost =
    !!boostFlag &&
    !!profile &&
    (normalizeGender(profile.gender) !== 'M' || reciprocal || !maleBoostRequiresReciprocity)

  const [boostTierIdx, setBoostTierIdx] = useState(0)
  const [boostPendingId, setBoostPendingId] = useState<string | null>(null)
  const [boostBusy, setBoostBusy] = useState(false)
  const [boostTiers, setBoostTiers] = useState<BoostTier[]>([...VISIBILITY_BOOST_TIERS])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'visibility_boost_offers')
        .maybeSingle()
      const raw = (data as { value?: unknown } | null)?.value
      if (!Array.isArray(raw)) return
      const parsed = raw
        .map((x) => {
          const rec = x as { days?: unknown; amount?: unknown; label?: unknown; active?: unknown }
          const days = Number(rec.days)
          const amount = Number(rec.amount)
          const label = typeof rec.label === 'string' ? rec.label.trim() : `${days} jours`
          const active = typeof rec.active === 'boolean' ? rec.active : true
          if (!active) return null
          if (!Number.isFinite(days) || days <= 0) return null
          if (!Number.isFinite(amount) || amount < 0) return null
          return { days, amount, label } as BoostTier
        })
        .filter(Boolean) as BoostTier[]
      if (!cancelled && parsed.length > 0) {
        setBoostTiers(parsed)
        setBoostTierIdx(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
        .eq('provider', PAYMENT_PROVIDER_VISIBILITY_BOOST)
        .eq('payment_provider', 'Badiboss Pay')
        .eq('status', 'pending')
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
      const { error: payErr } = await supabase.from('payments').insert({
        user_id: user.id,
        amount: 0,
        currency: 'USD',
        payment_method: 'Badiboss Pay',
        payment_provider: 'Badiboss Pay',
        provider: 'profiles_access',
        transaction_ref: makeTransactionRef('profiles'),
        status: 'pending',
        metadata: {
          photo_quota: 100,
          all_profiles_access: true,
        },
      })
      if (payErr) throw new Error(payErr.message || payErr.code || 'Ã‰chec enregistrement paiement')

      await refreshProfile()
      Alert.alert('Commande crÃ©Ã©e', 'AprÃ¨s confirmation Badiboss Pay, lâ€™accÃ¨s sera activÃ© automatiquement par le serveur.')
    } catch (e: unknown) {
      Alert.alert('Paiement', e instanceof Error ? e.message : "Impossible d'activer l'accÃ¨s.")
    }
  }

  const createBoostOrder = async () => {
    if (!user?.id || !profile || boostBusy) return
    const tier = boostTiers[boostTierIdx] ?? boostTiers[0]
    if (!tier) return
    setBoostBusy(true)
    try {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          amount: tier.amount,
          currency: 'USD',
          payment_method: 'Badiboss Pay',
          payment_provider: 'Badiboss Pay',
          provider: PAYMENT_PROVIDER_VISIBILITY_BOOST,
          transaction_ref: makeTransactionRef('boost'),
          status: 'pending',
          metadata: {
            days: tier.days,
            label: tier.label,
            amount: tier.amount,
          },
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message || error.code || 'Ã‰chec crÃ©ation commande boost')
      const id = (data as { id: string }).id
      setBoostPendingId(id)
      Alert.alert(
        'Commande crÃ©Ã©e',
        `Montant : ${formatUsd(tier.amount)}. AprÃ¨s paiement sur Badiboss Pay, appuyez sur Â« Confirmer le paiement Â».`
      )
    } catch (e: unknown) {
      Alert.alert('Boost', e instanceof Error ? e.message : 'Impossible de crÃ©er la commande.')
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
        .select('id,status,provider,payment_provider')
        .eq('id', boostPendingId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (selErr) throw new Error(selErr.message || 'Lecture paiement impossible')
      const row = pay as {
        status?: string
        provider?: string | null
        payment_provider?: string | null
      } | null
      if (!row || (row.status !== 'pending' && row.status !== 'completed')) {
        throw new Error('Aucune commande boost en attente pour ce compte.')
      }
      if (row.provider !== PAYMENT_PROVIDER_VISIBILITY_BOOST || row.payment_provider !== 'Badiboss Pay') {
        throw new Error('Cette commande nâ€™est pas une mise en avant valide.')
      }
      await refreshProfile()
      if (row.status === 'completed') {
        setBoostPendingId(null)
        Alert.alert('Boost activÃ©', 'Le paiement a Ã©tÃ© confirmÃ© par le serveur.')
      } else {
        Alert.alert('Paiement en attente', 'La confirmation Badiboss Pay nâ€™est pas encore reÃ§ue par le serveur.')
      }
    } catch (e: unknown) {
      Alert.alert('Boost', e instanceof Error ? e.message : 'Confirmation impossible.')
    } finally {
      setBoostBusy(false)
    }
  }

  const renderBoostBlock = (opts: { prominent?: boolean }) => {
    if (!profile || !canBuyBoost) return null
    const prominent = !!opts.prominent
    const tier = boostTiers[boostTierIdx] ?? boostTiers[0]
    if (!tier) return null
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
          Campagne payante : choisissez la durÃ©e, crÃ©ez la commande, payez sur Badiboss, puis confirmez ici pour
          activer la visibilitÃ© (listes + badge). Aucune activation sans confirmation de paiement.
        </Text>
        <Text style={[styles.status, { color: c.textMuted }]}>Ã‰tat : {formatBoostStatusLabel(profile)}</Text>

        <Text style={[styles.tierLabel, { color: c.text }]}>DurÃ©e</Text>
        <View style={styles.tierRow}>
          {boostTiers.map((t, i) => (
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
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{formatUsd(t.amount)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.priceLine, { color: c.text }]}>
          Total Ã  payer : {formatUsd(tier.amount)} â€” {tier.label}
        </Text>

        {boostPendingId ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.cardDesc, { color: c.warning }]}>
              Commande en attente de paiement. AprÃ¨s Badiboss Pay, confirmez pour activer le boost.
            </Text>
            <Pressable
              onPress={confirmBoostPayment}
              disabled={boostBusy}
              style={[styles.btn, { backgroundColor: c.primary, opacity: boostBusy ? 0.7 : 1 }]}
            >
              {boostBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Confirmer le paiement (aprÃ¨s Badiboss)</Text>
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
              <Text style={styles.btnText}>CrÃ©er la commande et payer sur Badiboss</Text>
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

      {normalizeGender(profile?.gender) === 'F' && !reciprocal && canBuyBoost ? renderBoostBlock({ prominent: true }) : null}

      {requiresProfilesPayment ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>AccÃ¨s profils / photos</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            {normalizeGender(profile?.gender) === 'F' && reciprocal
              ? 'Mode rÃ©ciproque : mÃªme logique dâ€™accÃ¨s payant que pour les hommes pour voir les profils du genre recherchÃ©.'
              : 'DÃ©bloquez lâ€™affichage complet via quota photo premium ou pack (voir profile_access).'}
          </Text>
          {profile ? (
            <Text style={[styles.status, { color: hasProfilesAccess ? c.success : c.textMuted }]}>
              {hasProfilesAccess
                ? profileAccess?.all_profiles_access
                  ? 'AccÃ¨s premium actif'
                  : `Quota photos utilisÃ© : ${profileAccess?.photo_quota_used ?? 0} / ${profileAccess?.photo_quota ?? 0}`
                : 'Non actif'}
            </Text>
          ) : null}
          <Pressable onPress={buyProfilesAccess} style={[styles.btn, { backgroundColor: c.primary }]}>
            <Text style={styles.btnText}>Payer avec Badiboss Pay</Text>
          </Pressable>
        </View>
      ) : normalizeGender(profile?.gender) === 'F' ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>AccÃ¨s profils / photos</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            Sans rÃ©ciprocitÃ©, vous nâ€™achetez pas lâ€™accÃ¨s Â« type homme Â». Utilisez la mise en avant ci-dessus pour la
            visibilitÃ©.
          </Text>
        </View>
      ) : null}

      {showContactPacks ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Packs contacts</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            Quotas contacts + options photo selon le pack (parcours homme, ou femme si rÃ©ciprocitÃ© activÃ©e).
          </Text>
          <Text style={[styles.status, { color: contactsLeft > 0 ? c.textSecondary : c.warning }]}>
            {contactsLeft > 0 ? `Contacts restants : ${contactsLeft}` : 'Quota atteint : achat requis'}
          </Text>
          <Pressable onPress={() => router.push('/(app)/packs')} style={[styles.btn, { backgroundColor: c.accent }]}>
            <Text style={styles.btnText}>Voir les packs</Text>
          </Pressable>
        </View>
      ) : null}

      {!(normalizeGender(profile?.gender) === 'F' && !reciprocal) && canBuyBoost ? renderBoostBlock({ prominent: false }) : null}
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
