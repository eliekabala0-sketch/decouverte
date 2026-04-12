import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { canViewFullProfiles, remainingContacts } from '../../../lib/access'
import { supabase } from '@/lib/supabase'
import type { AdCampaign } from '../../../lib/types'
import type { ProfileAccess } from '../../../lib/types'

function campaignMatchesAudience(
  c: AdCampaign,
  profile: { gender: string } | null,
  profileAccess: ProfileAccess | null,
): boolean {
  if (c.audience === 'all') return true
  if (!profile) return false
  if (c.audience === 'men' && profile.gender === 'M') return true
  if (c.audience === 'women' && profile.gender === 'F') return true
  const paying =
    canViewFullProfiles(profile.gender as 'M' | 'F', profileAccess) || remainingContacts(profileAccess) > 0
  if (c.audience === 'paying') return paying
  if (c.audience === 'non_paying') return !paying
  return true
}

export default function CampaignsScreen() {
  const { colors } = useTheme()
  const { profile, profileAccess } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const campOn = isOn('ad_campaigns_enabled')

  useEffect(() => {
    if (!campOn) {
      setCampaigns([])
      setLoading(false)
      return
    }
    const load = async () => {
      const now = new Date().toISOString()
      const { data } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('is_active', true)
        .lte('start_at', now)
        .gte('end_at', now)
        .order('priority', { ascending: false })
      const raw = (data ?? []) as AdCampaign[]
      const filtered = raw.filter((c) => campaignMatchesAudience(c, profile ?? null, profileAccess ?? null))
      setCampaigns(filtered)
      setLoading(false)
    }
    void load()
  }, [campOn, profile?.id, profile?.gender, profileAccess?.user_id])

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!campOn) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Campagnes</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Module désactivé dans l’administration.</Text>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Campagnes</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Annonces et campagnes publicitaires
      </Text>
      {campaigns.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>Aucune campagne en cours.</Text>
      ) : (
        campaigns.map((c) => (
          <View key={c.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{c.title}</Text>
            {c.image_url ? (
              <Image source={{ uri: c.image_url }} style={styles.media} resizeMode="cover" />
            ) : null}
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>{c.text}</Text>
            <Text style={[styles.cardDates, { color: colors.textMuted }]}>
              Du {new Date(c.start_at).toLocaleDateString('fr-FR')} au {new Date(c.end_at).toLocaleDateString('fr-FR')}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 56, paddingBottom: 100 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { marginTop: 8, marginBottom: 20 },
  empty: { textAlign: 'center', marginTop: 24 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  media: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12 },
  cardText: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  cardDates: { fontSize: 13 },
})
