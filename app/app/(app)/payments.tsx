import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, TextInput } from 'react-native'
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
import {
  PAYMENT_CURRENCIES,
  PAYMENT_NETWORKS,
  checkServerPayment,
  createServerPayment,
  normalizeMobileMoneyPhone,
  paymentFailureMessage,
  paymentStatusLabel,
  providerFailureCause,
  type PaymentCurrency,
  type PaymentNetwork,
  type PaymentStatus,
} from '@/lib/paymentGateway'

type BoostTier = { days: number; label: string; amount: number }
const PAYMENT_CHANNEL_LABEL = 'Paiement securise'

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

function formatAmount(amount: number, currency: string) {
  return `${amount.toFixed(2)} ${currency}`
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
  const [boostPendingStatus, setBoostPendingStatus] = useState<PaymentStatus>('pending')
  const [boostPendingMessage, setBoostPendingMessage] = useState<string | null>(null)
  const [boostPendingCause, setBoostPendingCause] = useState<string | null>(null)
  const [boostBusy, setBoostBusy] = useState(false)
  const [boostTiers, setBoostTiers] = useState<BoostTier[]>([...VISIBILITY_BOOST_TIERS])
  const [network, setNetwork] = useState<PaymentNetwork>('OM')
  const [currency, setCurrency] = useState<PaymentCurrency>('USD')
  const [customerPhone, setCustomerPhone] = useState(profile?.phone ?? '+243')

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
        .select('id,status,transaction_ref,metadata,created_at,provider_message,provider_status_code')
        .eq('user_id', user.id)
        .eq('provider', PAYMENT_PROVIDER_VISIBILITY_BOOST)
        .in('status', ['pending', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled) {
        const row = data as { id?: string; status?: PaymentStatus; transaction_ref?: string | null; metadata?: Record<string, unknown> | null; created_at?: string | null; provider_message?: string | null; provider_status_code?: string | number | null } | null
        const createdAt = row?.created_at ?? new Date().toISOString()
        const ageMs = Date.now() - new Date(createdAt).getTime()
        const status: PaymentStatus = row?.status === 'failed' ? 'failed' : ageMs > 30 * 60 * 1000 ? 'expired' : (row?.status ?? 'pending')
        setBoostPendingId(String(row?.metadata?.gateway_transaction_id ?? row?.transaction_ref ?? row?.id ?? '') || null)
        setBoostPendingStatus(status)
        setBoostPendingMessage(
          status === 'failed'
            ? paymentFailureMessage({ status, transaction_id: String(row?.id ?? ''), message: '', provider_message: row?.provider_message, provider_status_code: row?.provider_status_code })
            : status === 'expired'
              ? 'Paiement trop ancien. Annulez et recommencez avec le bon numero, reseau ou devise.'
              : null
        )
        setBoostPendingCause(providerFailureCause({ status, transaction_id: String(row?.id ?? ''), message: '', provider_message: row?.provider_message, provider_status_code: row?.provider_status_code }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, canBuyBoost, profile?.id, profile?.boosted_until, profile?.boost_reason])

  const buyProfilesAccess = async () => {
    router.push('/(app)/packs')
  }

  const createBoostOrder = async () => {
    if (!user?.id || !profile || boostBusy) return
    const tier = boostTiers[boostTierIdx] ?? boostTiers[0]
    if (!tier) return
    setBoostBusy(true)
    try {
      const result = await createServerPayment({
        payment_type: 'visibility_boost',
        amount: tier.amount,
        currency,
        customer_phone: normalizeMobileMoneyPhone(customerPhone),
        network,
        metadata: {
          days: tier.days,
          label: tier.label,
          amount: tier.amount,
        },
      })
      setBoostPendingId(result.transaction_id)
      setBoostPendingStatus(result.status)
      setBoostPendingMessage(result.status === 'failed' ? paymentFailureMessage(result) : result.message)
      setBoostPendingCause(providerFailureCause(result))
      Alert.alert(
        'Paiement Mobile Money',
        result.message || `Montant : ${formatAmount(tier.amount, currency)}. Verifiez le paiement apres validation.`
      )
    } catch (e: unknown) {
      setBoostPendingStatus('failed')
      setBoostPendingMessage(e instanceof Error ? e.message : 'Impossible de creer la commande.')
      Alert.alert('Paiement non abouti', e instanceof Error ? e.message : 'Impossible de creer la commande.')
    } finally {
      setBoostBusy(false)
    }
  }

  const confirmBoostPayment = async () => {
    if (!user?.id || !profile || !boostPendingId || boostBusy) return
    setBoostBusy(true)
    try {
      const result = await checkServerPayment(boostPendingId)
      setBoostPendingStatus(result.status)
      setBoostPendingMessage(result.status === 'failed' ? paymentFailureMessage(result) : result.message)
      setBoostPendingCause(providerFailureCause(result))
      if (result.status === 'completed') {
        await refreshProfile()
        setBoostPendingId(null)
        Alert.alert('Paiement reussi', 'Votre mise en avant est activee automatiquement.')
      } else {
        Alert.alert(paymentStatusLabel(result.status), result.status === 'failed' ? paymentFailureMessage(result) : result.message)
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
          Campagne payante : choisissez la duree, creez la commande, puis confirmez ici apres paiement pour
          activer la visibilite (listes + badge). Aucune activation sans confirmation serveur.
        </Text>
        <Text style={[styles.status, { color: c.textMuted }]}>Etat : {formatBoostStatusLabel(profile)}</Text>

        <Text style={[styles.tierLabel, { color: c.text }]}>Duree</Text>
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
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{formatAmount(t.amount, currency)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.priceLine, { color: c.text }]}>
          Total a payer : {formatAmount(tier.amount, currency)} - {tier.label}
        </Text>
        {renderPaymentControls()}

        {boostPendingId ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.cardDesc, { color: c.warning }]}>
              {paymentStatusLabel(boostPendingStatus)}. {boostPendingMessage || 'Verifiez apres validation sur votre telephone.'}
            </Text>
            {boostPendingCause ? <Text style={[styles.cardDesc, { color: c.warning }]}>{boostPendingCause}</Text> : null}
            {boostPendingStatus === 'pending' || boostPendingStatus === 'checking' ? (
              <Pressable
                onPress={confirmBoostPayment}
                disabled={boostBusy}
                style={[styles.btn, { backgroundColor: c.primary, opacity: boostBusy ? 0.7 : 1 }]}
              >
                {boostBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Verifier le paiement</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              onPress={cancelBoostPayment}
              style={[styles.btn, { backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.border }]}
            >
              <Text style={[styles.btnText, { color: c.text }]}>Annuler et recommencer</Text>
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
              <Text style={styles.btnText}>Payer</Text>
            )}
          </Pressable>
        )}
      </View>
    )
  }

  const cancelBoostPayment = () => {
    setBoostPendingId(null)
    setBoostPendingStatus('canceled')
    setBoostPendingMessage('Paiement annule. Modifiez le numero, le reseau ou la devise puis relancez.')
    setBoostPendingCause(null)
  }

  const renderPaymentControls = () => (
    <View style={[styles.paymentBox, { borderColor: c.border }]}>
      <Text style={[styles.paymentTitle, { color: c.text }]}>Paiement Mobile Money</Text>
      <Text style={[styles.cardDesc, { color: c.textSecondary, marginBottom: 0 }]}>Numero Mobile Money</Text>
      <TextInput
        value={customerPhone}
        onChangeText={setCustomerPhone}
        keyboardType="phone-pad"
        placeholder="+243 8XX XXX XXX"
        placeholderTextColor={c.textMuted}
        style={[styles.input, { borderColor: c.border, color: c.text }]}
      />
      <View style={styles.choiceRow}>
        {PAYMENT_NETWORKS.map((item) => (
          <Pressable
            key={item.value}
            onPress={() => setNetwork(item.value)}
            style={[styles.choice, { borderColor: network === item.value ? c.primary : c.border }]}
          >
            <Text style={[styles.choiceText, { color: c.text }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.choiceRow}>
        {PAYMENT_CURRENCIES.map((item) => (
          <Pressable
            key={item}
            onPress={() => setCurrency(item)}
            style={[styles.choice, { borderColor: currency === item ? c.primary : c.border }]}
          >
            <Text style={[styles.choiceText, { color: c.text }]}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.primary, fontWeight: '600' }}>Retour</Text>
      </Pressable>
      <Text style={[styles.title, { color: c.text }]}>Paiements & Packs</Text>
      <Text style={[styles.subtitle, { color: c.textSecondary }]}>{PAYMENT_CHANNEL_LABEL}</Text>

      {normalizeGender(profile?.gender) === 'F' && !reciprocal && canBuyBoost ? renderBoostBlock({ prominent: true }) : null}

      {requiresProfilesPayment ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Acces profils / photos</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            {normalizeGender(profile?.gender) === 'F' && reciprocal
              ? "Mode reciproque : meme logique d'acces payant que pour les hommes pour voir les profils du genre recherche."
              : "Debloquez l'affichage complet via quota photo premium ou pack (voir profile_access)."}
          </Text>
          {profile ? (
            <Text style={[styles.status, { color: hasProfilesAccess ? c.success : c.textMuted }]}>
              {hasProfilesAccess
                ? profileAccess?.all_profiles_access
                  ? 'Acces premium actif'
                  : `Quota photos utilise : ${profileAccess?.photo_quota_used ?? 0} / ${profileAccess?.photo_quota ?? 0}`
                : 'Non actif'}
            </Text>
          ) : null}
          <Pressable onPress={buyProfilesAccess} style={[styles.btn, { backgroundColor: c.primary }]}>
            <Text style={styles.btnText}>Voir les packs</Text>
          </Pressable>
        </View>
      ) : normalizeGender(profile?.gender) === 'F' ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Acces profils / photos</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            Sans reciprocite, vous n'achetez pas l'acces type homme. Utilisez la mise en avant ci-dessus pour la
            visibilite.
          </Text>
        </View>
      ) : null}

      {showContactPacks ? (
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Packs contacts</Text>
          <Text style={[styles.cardDesc, { color: c.textSecondary }]}>
            Quotas contacts + options photo selon le pack (parcours homme, ou femme si reciprocite activee).
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
  subtitle: { fontSize: 14, marginTop: -12, marginBottom: 18 },
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
  paymentBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14, gap: 10 },
  paymentTitle: { fontSize: 14, fontWeight: '700' },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  choiceText: { fontSize: 13, fontWeight: '600' },
  btn: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
})
