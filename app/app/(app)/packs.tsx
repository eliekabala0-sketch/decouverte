import { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import type { ContactPack } from '../../../lib/types'
import { remainingContacts } from '../../../lib/access'
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
import { supabase } from '@/lib/supabase'

function formatPriceUsd(priceCents: number, currency?: string) {
  return `${(priceCents / 100).toFixed(2)} ${currency || 'USD'}`
}

export default function PacksScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { user, profile, profileAccess, refreshProfile } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const packsOn = isOn('contact_packs_enabled')
  const reciprocal = isOn('reciprocal_matching_enabled')
  const packsNotOfferedHere = profile?.gender === 'F' && !reciprocal
  const [packs, setPacks] = useState<ContactPack[]>([])
  const [loading, setLoading] = useState(true)
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [network, setNetwork] = useState<PaymentNetwork>('OM')
  const [currency, setCurrency] = useState<PaymentCurrency>('USD')
  const [customerPhone, setCustomerPhone] = useState(profile?.phone ?? '+243')
  const [paymentState, setPaymentState] = useState<PaymentStatus>('idle')
  const [pending, setPending] = useState<{ packId: string; transactionId: string; status: PaymentStatus; createdAt: string; message?: string; cause?: string | null } | null>(null)

  const contactsLeft = useMemo(() => remainingContacts(profileAccess), [profileAccess])

  useEffect(() => {
    if (!packsOn) {
      setPacks([])
      setLoading(false)
      return
    }
    const load = async () => {
      const { data } = await supabase
        .from('contact_packs')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      setPacks((data ?? []) as ContactPack[])
      setLoading(false)
    }
    void load()
  }, [packsOn])

  useEffect(() => {
    if (!user?.id || !packsOn) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('payments')
        .select('id,status,transaction_ref,metadata,created_at')
        .eq('user_id', user.id)
        .eq('provider', 'contact_pack')
        .in('status', ['pending', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled || !data) return
      const row = data as { id?: string; status?: PaymentStatus; transaction_ref?: string | null; metadata?: Record<string, unknown> | null; created_at?: string | null }
      const createdAt = row.created_at ?? new Date().toISOString()
      const ageMs = Date.now() - new Date(createdAt).getTime()
      const status: PaymentStatus = row.status === 'failed' ? 'failed' : ageMs > 30 * 60 * 1000 ? 'expired' : 'pending'
      const transactionId = String(row.metadata?.gateway_transaction_id ?? row.transaction_ref ?? row.id ?? '')
      if (!transactionId) return
      setPaymentState(status)
      setPending({
        packId: String(row.metadata?.pack_id ?? ''),
        transactionId,
        status,
        createdAt,
        message: status === 'failed' ? 'Paiement non abouti. Verifiez le numero, le reseau ou la devise, puis reessayez.' : undefined,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, packsOn])

  const buyPack = async (pack: ContactPack) => {
    if (!user?.id) return
    const addContacts = pack.contact_quota ?? pack.quota
    try {
      setBuyingId(pack.id)
      setPaymentState('creating')
      const result = await createServerPayment({
        payment_type: 'contact_pack',
        amount: Number((pack.price_cents / 100).toFixed(2)),
        currency,
        customer_phone: normalizeMobileMoneyPhone(customerPhone),
        network,
        metadata: {
          pack_id: pack.id,
          pack_name: pack.name,
          quota: pack.quota,
          contact_quota: addContacts,
          photo_quota: pack.photo_quota ?? 0,
          all_profiles_access: !!pack.all_profiles_access,
        },
      })
      const cause = providerFailureCause(result)
      setPaymentState(result.status)
      setPending({
        packId: pack.id,
        transactionId: result.transaction_id,
        status: result.status,
        createdAt: new Date().toISOString(),
        message: result.status === 'failed' ? paymentFailureMessage(result) : result.message,
        cause,
      })
      Alert.alert('Paiement Mobile Money', result.message || `Paiement en attente. +${addContacts} contact(s) apres confirmation serveur.`)
    } catch (e: any) {
      setPaymentState('failed')
      Alert.alert('Paiement non abouti', e?.message ?? 'Impossible de finaliser le paiement.')
    } finally {
      setBuyingId(null)
    }
  }

  const verifyPayment = async () => {
    if (!pending) return
    try {
      setBuyingId(pending.packId)
      setPaymentState('checking')
      const result = await checkServerPayment(pending.transactionId)
      const cause = providerFailureCause(result)
      setPaymentState(result.status)
      setPending({ ...pending, status: result.status, message: result.status === 'failed' ? paymentFailureMessage(result) : result.message, cause })
      if (result.status === 'completed') {
        await refreshProfile()
        Alert.alert('Paiement reussi', 'Vos droits seront disponibles automatiquement.')
        setPending(null)
      } else {
        Alert.alert(paymentStatusLabel(result.status), result.status === 'failed' ? paymentFailureMessage(result) : result.message)
      }
    } catch (e: any) {
      Alert.alert('Paiement', e?.message ?? 'Verification du paiement impossible.')
    } finally {
      setBuyingId(null)
    }
  }

  const cancelPayment = () => {
    setPaymentState('canceled')
    setPending(null)
    setBuyingId(null)
  }

  if (!packsOn) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Retour</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Packs contacts</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Module desactive dans l'administration.</Text>
      </ScrollView>
    )
  }

  if (packsNotOfferedHere) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Retour</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Packs contacts</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Les packs contacts sont prevus pour le parcours standard homme (debloquer des prises de contact). Sans reciprocite
          activee par l'admin, ce n'est pas l'offre principale cote femme.
        </Text>
        <Pressable onPress={() => router.replace('/(app)/payments')} style={[styles.buyBtn, { backgroundColor: colors.primary, marginTop: 20, alignSelf: 'flex-start' }]}>
          <Text style={styles.buyBtnText}>Aller a la mise en avant</Text>
        </Pressable>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retour</Text>
      </Pressable>

      <Text style={[styles.title, { color: colors.text }]}>Packs contacts</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Contacts restants : {contactsLeft}
      </Text>
      <View style={[styles.paymentBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Paiement Mobile Money</Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Numero Mobile Money</Text>
        <TextInput
          value={customerPhone}
          onChangeText={setCustomerPhone}
          keyboardType="phone-pad"
          placeholder="+243 8XX XXX XXX"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
        <View style={styles.choiceRow}>
          {PAYMENT_NETWORKS.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setNetwork(item.value)}
              style={[styles.choice, { borderColor: network === item.value ? colors.primary : colors.border }]}
            >
              <Text style={[styles.choiceText, { color: colors.text }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.choiceRow}>
          {PAYMENT_CURRENCIES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setCurrency(item)}
              style={[styles.choice, { borderColor: currency === item ? colors.primary : colors.border }]}
            >
              <Text style={[styles.choiceText, { color: colors.text }]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        {pending ? (
          <View style={{ gap: 8 }}>
            <Text style={[styles.pending, { color: pending.status === 'failed' || pending.status === 'expired' ? colors.error : colors.warning }]}>
              {paymentStatusLabel(paymentState)}
            </Text>
            {pending.message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{pending.message}</Text> : null}
            {pending.cause ? <Text style={[styles.message, { color: colors.warning }]}>{pending.cause}</Text> : null}
            <View style={styles.actionRow}>
              {pending.status === 'pending' || paymentState === 'checking' ? (
                <Pressable onPress={verifyPayment} disabled={!!buyingId} style={[styles.buyBtn, { backgroundColor: colors.primary }]}>
                  <Text style={styles.buyBtnText}>Verifier le paiement</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={cancelPayment} style={[styles.buyBtn, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.buyBtnText, { color: colors.text }]}>Annuler et recommencer</Text>
              </Pressable>
            </View>
            <Text style={[styles.message, { color: colors.textMuted }]}>
              Vous pouvez changer le numero, le reseau ou la devise avant de relancer un nouveau paiement.
            </Text>
          </View>
        ) : paymentState === 'canceled' ? (
          <View>
            <Text style={[styles.message, { color: colors.textMuted }]}>Paiement annule. Modifiez les informations puis relancez.</Text>
          </View>
        ) : null}
      </View>

      {paymentState === 'completed' ? (
        <View style={[styles.notice, { backgroundColor: colors.success }]}>
          <Text style={styles.noticeText}>Paiement reussi. Vos droits actifs sont synchronises.</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 16 }}>
          {packs.map((p) => (
            <View key={p.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{p.name}</Text>
                <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                  {p.contact_quota ?? p.quota} contact(s) - {formatPriceUsd(p.price_cents, currency)}
                </Text>
              </View>
              <Pressable
                onPress={() => buyPack(p)}
                disabled={buyingId === p.id || !!pending}
                style={({ pressed }) => [
                  styles.buyBtn,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.92 : 1 },
                ]}
              >
                <Text style={styles.buyBtnText}>{buyingId === p.id ? 'Paiement...' : pending ? 'Paiement en cours' : 'Payer'}</Text>
              </Pressable>
            </View>
          ))}
          {packs.length === 0 && (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Aucun pack actif pour le moment (a configurer cote admin).
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 56, paddingBottom: 40 },
  centered: { marginTop: 32, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', marginTop: 12 },
  subtitle: { fontSize: 15, marginTop: 6 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 14, marginTop: 4 },
  paymentBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600' },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  choiceText: { fontSize: 13, fontWeight: '600' },
  pending: { fontSize: 14, fontWeight: '700' },
  message: { fontSize: 13, lineHeight: 18 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { borderRadius: 12, padding: 12, marginTop: 12 },
  noticeText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  buyBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 32 },
})
