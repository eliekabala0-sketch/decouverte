import { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { supabase } from '@/lib/supabase'
import type { ContactPack } from '../../../lib/types'
import { remainingContacts } from '../../../lib/access'
import { PAYMENT_PROVIDER_BADIBOSS } from '../../../lib/constants'

function formatPriceUsd(priceCents: number, currency?: string) {
  return `${(priceCents / 100).toFixed(2)} ${currency || 'USD'}`
}

export default function PacksScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { user, profileAccess, refreshProfile } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const packsOn = isOn('contact_packs_enabled')
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
        type: 'contact_pack',
        provider: PAYMENT_PROVIDER_BADIBOSS,
        amount_cents: pack.price_cents,
        currency: pack.currency,
        status: 'completed',
        metadata: { pack_id: pack.id, pack_name: pack.name, quota: addContacts },
      })
      if (payErr) throw new Error(payErr.message || payErr.code || 'Échec enregistrement paiement')

      const currentQuota = profileAccess?.contact_quota ?? 0
      const currentUsed = profileAccess?.contact_quota_used ?? 0
      const newPhotoQ = (profileAccess?.photo_quota ?? 0) + (pack.photo_quota ?? 0)
      const allAccess = !!(profileAccess?.all_profiles_access || pack.all_profiles_access)
      const { error } = await supabase.from('profile_access').upsert(
        {
          user_id: user.id,
          contact_quota: currentQuota + addContacts,
          contact_quota_used: currentUsed,
          photo_quota: newPhotoQ,
          photo_quota_used: profileAccess?.photo_quota_used ?? 0,
          all_profiles_access: allAccess,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      if (error) throw new Error(error.message || error.code || 'Échec mise à jour quotas')
      await refreshProfile()
      Alert.alert('Pack activé', `+${addContacts} contact(s) ajouté(s).`)
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
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Module désactivé dans l’administration.</Text>
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
                  {p.contact_quota ?? p.quota} contact(s) • {formatPriceUsd(p.price_cents, p.currency)}
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
              Aucun pack actif pour le moment (à configurer côté admin).
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

