import { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { supabase } from '@/lib/supabase'
import type { ContactPack } from '../../../lib/types'
import { remainingContacts } from '../../../lib/access'

function formatPriceUsd(priceCents: number, currency?: string) {
  return `${(priceCents / 100).toFixed(2)} ${currency || 'USD'}`
}

function makeTransactionRef(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

  const buyPack = async (pack: ContactPack) => {
    if (!user?.id) return
    const addContacts = pack.contact_quota ?? pack.quota
    try {
      setBuyingId(pack.id)
      const { error: payErr } = await supabase.from('payments').insert({
        user_id: user.id,
        amount: Number((pack.price_cents / 100).toFixed(2)),
        currency: pack.currency,
        payment_method: 'Badiboss Pay',
        payment_provider: 'Badiboss Pay',
        provider: 'contact_pack',
        transaction_ref: makeTransactionRef('pack'),
        status: 'pending',
        metadata: {
          pack_id: pack.id,
          pack_name: pack.name,
          quota: pack.quota,
          contact_quota: addContacts,
          photo_quota: pack.photo_quota ?? 0,
          all_profiles_access: !!pack.all_profiles_access,
        },
      })
      if (payErr) throw new Error(payErr.message || payErr.code || 'Ã‰chec enregistrement paiement')

      await refreshProfile()
      Alert.alert('Commande crÃ©Ã©e', `AprÃ¨s confirmation Badiboss Pay, +${addContacts} contact(s) seront ajoutÃ©s par le serveur.`)
    } catch (e: any) {
      Alert.alert('Paiement', e?.message ?? 'Impossible de finaliser le paiement.')
    } finally {
      setBuyingId(null)
    }
  }

  if (!packsOn) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Retour</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Packs contacts</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Module dÃ©sactivÃ© dans lâ€™administration.</Text>
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
          Les packs contacts sont prÃ©vus pour le parcours standard homme (dÃ©bloquer des prises de contact). Sans rÃ©ciprocitÃ©
          activÃ©e par lâ€™admin, ce nâ€™est pas lâ€™offre principale cÃ´tÃ© femme.
        </Text>
        <Pressable onPress={() => router.replace('/(app)/payments')} style={[styles.buyBtn, { backgroundColor: colors.primary, marginTop: 20, alignSelf: 'flex-start' }]}>
          <Text style={styles.buyBtnText}>Aller Ã  la mise en avant</Text>
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
                  {p.contact_quota ?? p.quota} contact(s) â€¢ {formatPriceUsd(p.price_cents, p.currency)}
                </Text>
              </View>
              <Pressable
                onPress={() => buyPack(p)}
                disabled={buyingId === p.id}
                style={({ pressed }) => [
                  styles.buyBtn,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.92 : 1 },
                ]}
              >
                <Text style={styles.buyBtnText}>{buyingId === p.id ? 'Achat...' : 'Acheter'}</Text>
              </Pressable>
            </View>
          ))}
          {packs.length === 0 && (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Aucun pack actif pour le moment (Ã  configurer cÃ´tÃ© admin).
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
