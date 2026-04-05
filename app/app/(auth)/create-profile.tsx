import { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, FlatList } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import type { User } from '@supabase/supabase-js'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { GENDER_LABELS, COMMUNES_KINSHASA } from '../../../lib/constants'
import type { Gender } from '../../../lib/types'

const KNOWN_CITIES_RDC = [
  'Kinshasa', 'Lubumbashi', 'Mbuji-Mayi', 'Kananga', 'Kisangani', 'Bukavu', 'Goma', 'Matadi', 'Kolwezi', 'Likasi',
  'Tshikapa', 'Bunia', 'Uvira', 'Butembo', 'Boma', 'Kikwit', 'Kindu', 'Gemena', 'Isiro', 'Gbadolite',
  'Bandundu', 'Mwene-Ditu', 'Beni', 'Kasumbalesa', 'Kalemie', 'Mbandaka', 'Moanda', 'Sakania', 'Kamina', 'Kenge',
]

function phoneFromUser(u: User | null): string {
  if (!u) return ''
  const meta = u.user_metadata as { phone?: string } | undefined
  if (meta?.phone && String(meta.phone).trim()) return String(meta.phone).trim()
  const em = u.email ?? ''
  const m = em.match(/^tel_(\d+)@/)
  if (m) return `+${m[1]}`
  return ''
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false
  if (year < 1900 || year > 2100) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const dt = new Date(Date.UTC(year, month - 1, day))
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
}

function toIsoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export default function CreateProfileScreen() {
  const router = useRouter()
  const { colors, spacing } = useTheme()
  const { user, profile, refreshProfile, loading: authLoading } = useAuth()

  const [username, setUsername] = useState('')
  const [gender, setGender] = useState<Gender>('M')
  const [birthYear, setBirthYear] = useState<number | null>(null)
  const [birthMonth, setBirthMonth] = useState<number | null>(null)
  const [birthDay, setBirthDay] = useState<number | null>(null)
  const [city, setCity] = useState('')
  const [commune, setCommune] = useState('')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [picker, setPicker] = useState<null | 'year' | 'month' | 'day'>(null)
  const [debugLines, setDebugLines] = useState<string[]>([])
  const showDebug = process.env.EXPO_PUBLIC_DEBUG_CREATE_PROFILE === '1'

  const dbg = (line: string) => {
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setDebugLines((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 40))
  }

  const years = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const maxYear = currentYear - 18
    const minYear = 1950
    const list: number[] = []
    for (let y = maxYear; y >= minYear; y--) list.push(y)
    return list
  }, [])

  const birthDateIso =
    birthYear && birthMonth && birthDay && isValidDateParts(birthYear, birthMonth, birthDay)
      ? toIsoDate(birthYear, birthMonth, birthDay)
      : ''

  const age = birthDateIso
    ? Math.floor((Date.now() - new Date(birthDateIso).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0
  const isAdult = !!birthDateIso && age >= 18

  const citySuggestions = useMemo(() => {
    const q = city.trim().toLowerCase()
    if (!q) return []
    return KNOWN_CITIES_RDC.filter((c) => c.toLowerCase().includes(q)).slice(0, 8)
  }, [city])

  const daysInMonth = useMemo(() => {
    if (!birthYear || !birthMonth) return 31
    return new Date(birthYear, birthMonth, 0).getDate()
  }, [birthYear, birthMonth])

  const dayOptions = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])

  const handleSubmit = async () => {
    setErrorText('')
    setDebugLines([])
    dbg('Début submit')
    if (!user?.id) {
      setErrorText('Session expirée. Reconnectez-vous puis réessayez.')
      return
    }
    const phone = phoneFromUser(user)
    if (!phone) {
      setErrorText('Numéro de téléphone introuvable. Déconnectez-vous et réinscrivez-vous.')
      return
    }
    if (!username.trim()) {
      setErrorText('Le pseudo est requis.')
      return
    }
    if (!birthDateIso) {
      setErrorText('La date de naissance est requise.')
      return
    }
    if (!isAdult) {
      setErrorText('Vous devez avoir 18 ans ou plus.')
      return
    }
    const cityValue = city.trim()
    const communeValue = commune.trim()
    if (!cityValue || !communeValue) {
      setErrorText('Ville et commune sont requis.')
      return
    }
    setLoading(true)
    try {
      const payload = {
        id: user.id,
        phone,
        username: username.trim(),
        gender,
        age,
        city: cityValue,
        commune: communeValue,
        bio: bio.trim() || null,
        status: 'active' as const,
        is_verified: false,
        country: 'CD',
        role: 'user',
        photo: null as string | null,
        boost_reason: null as string | null,
      }
      dbg(`Colonnes: ${Object.keys(payload).join(', ')}`)
      const insertPromise = supabase.from('profiles').insert(payload)
      const timeoutMs = 12000
      const res = await Promise.race([
        insertPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ])

      if (res === null) {
        setErrorText('La création du profil est bloquée (lock Supabase). Fermez les autres onglets Découverte puis réessayez.')
        return
      }
      if (res.error) {
        setErrorText(res.error.message || 'Erreur lors de la création du profil.')
        return
      }
      const verifyRow = async () =>
        supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
      const check = await withTimeout(verifyRow(), 8000)
      if (check.error) {
        setErrorText(check.error.message || 'Profil créé mais non vérifiable.')
        return
      }
      if (!check.data?.id) {
        setErrorText('Création du profil non confirmée. Réessayez.')
        return
      }
      try {
        await withTimeout(refreshProfile(), 2500)
      } catch {
        // non bloquant
      }
      router.replace('/(auth)/add-avatar')
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Erreur lors de la création du profil.')
    } finally {
      setLoading(false)
    }
  }

  const monthLabel = (m: number) =>
    ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'][m - 1] ?? String(m)

  if (!authLoading && !user) {
    return <Redirect href="/(auth)/welcome" />
  }
  if (user && profile) {
    return profile.photo ? <Redirect href="/(app)/home" /> : <Redirect href="/(auth)/add-avatar" />
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>Votre profil</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Champs obligatoires (18+)</Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Pseudo *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder="Comment vous appeler ?"
        placeholderTextColor={colors.textMuted}
        value={username}
        onChangeText={setUsername}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Sexe *</Text>
      <View style={styles.row}>
        {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
          <Pressable
            key={g}
            onPress={() => setGender(g)}
            style={[
              styles.chip,
              { backgroundColor: colors.surface, borderColor: colors.border },
              gender === g && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{GENDER_LABELS[g]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Date de naissance * (18+)</Text>
      <View style={styles.inline3}>
        <Pressable
          onPress={() => setPicker('year')}
          style={[styles.select, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text }}>{birthYear ? String(birthYear) : 'Année'}</Text>
        </Pressable>
        <Pressable
          onPress={() => setPicker('month')}
          style={[styles.select, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text }}>{birthMonth ? monthLabel(birthMonth) : 'Mois'}</Text>
        </Pressable>
        <Pressable
          onPress={() => setPicker('day')}
          style={[styles.select, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text }}>{birthDay ? String(birthDay) : 'Jour'}</Text>
        </Pressable>
      </View>
      {!birthDateIso && (birthYear || birthMonth || birthDay) ? (
        <Text style={[styles.error, { color: colors.error ?? '#ff4d4f' }]}>Date invalide.</Text>
      ) : null}
      {birthDateIso && !isAdult ? (
        <Text style={[styles.error, { color: colors.error ?? '#ff4d4f' }]}>Vous devez avoir 18 ans ou plus.</Text>
      ) : null}

      <Text style={[styles.label, { color: colors.textSecondary }]}>Ville *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder="Tapez votre ville…"
        placeholderTextColor={colors.textMuted}
        value={city}
        onChangeText={(t) => {
          setCity(t)
          if (t.trim().toLowerCase() !== 'kinshasa') setCommune('')
        }}
      />
      {citySuggestions.length > 0 ? (
        <View style={[styles.suggestions, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
          {citySuggestions.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCity(c)}
              style={({ pressed }) => [styles.suggestionRow, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: colors.text }}>{c}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {city.trim().toLowerCase() === 'kinshasa' ? 'Commune *' : 'Commune / Quartier *'}
      </Text>
      {city.trim().toLowerCase() === 'kinshasa' ? (
        <View style={styles.rowWrap}>
          {COMMUNES_KINSHASA.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCommune(c)}
              style={[
                styles.chip,
                { backgroundColor: colors.surface, borderColor: colors.border },
                commune === c && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
              ]}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="Ex: quartier, commune…"
          placeholderTextColor={colors.textMuted}
          value={commune}
          onChangeText={setCommune}
        />
      )}

      <Text style={[styles.label, { color: colors.textSecondary }]}>Bio</Text>
      <TextInput
        style={[styles.input, styles.bio, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder="Présentez-vous…"
        placeholderTextColor={colors.textMuted}
        value={bio}
        onChangeText={setBio}
        multiline
      />

      <Pressable
        onPress={handleSubmit}
        disabled={loading}
        style={[styles.btn, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.btnText}>{loading ? 'Création...' : 'Créer mon profil'}</Text>
      </Pressable>
      {errorText ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.error, { color: colors.error ?? '#ff4d4f' }]}>{errorText}</Text>
        </View>
      ) : null}

      {showDebug && debugLines.length > 0 ? (
        <View style={[styles.debugWrap, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.debugTitle, { color: colors.textSecondary }]}>Debug submit</Text>
          {debugLines.map((l) => (
            <Text key={l} style={[styles.debugLine, { color: colors.textMuted }]}>{l}</Text>
          ))}
        </View>
      ) : null}

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {picker === 'year' ? 'Année' : picker === 'month' ? 'Mois' : 'Jour'}
            </Text>
            {picker === 'year' ? (
              <FlatList
                data={years}
                keyExtractor={(y) => String(y)}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => { setBirthYear(item); setPicker(null); }}
                    style={({ pressed }) => [styles.modalRow, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Text style={{ color: colors.text }}>{item}</Text>
                  </Pressable>
                )}
              />
            ) : picker === 'month' ? (
              <FlatList
                data={Array.from({ length: 12 }, (_, i) => i + 1)}
                keyExtractor={(m) => String(m)}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => { setBirthMonth(item); setBirthDay(null); setPicker(null); }}
                    style={({ pressed }) => [styles.modalRow, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Text style={{ color: colors.text }}>{monthLabel(item)}</Text>
                  </Pressable>
                )}
              />
            ) : (
              <FlatList
                data={dayOptions}
                keyExtractor={(d) => String(d)}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => { setBirthDay(item); setPicker(null); }}
                    style={({ pressed }) => [styles.modalRow, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Text style={{ color: colors.text }}>{item}</Text>
                  </Pressable>
                )}
              />
            )}
            <Pressable onPress={() => setPicker(null)} style={[styles.modalClose, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, marginBottom: 24 },
  label: { fontSize: 14, marginBottom: 8, marginTop: 16 },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  bio: { height: 100, paddingTop: 14 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inline3: { flexDirection: 'row', gap: 10 },
  select: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 8,
    overflow: 'hidden',
  },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 12 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: { fontSize: 15 },
  errorWrap: { marginTop: 12 },
  error: { fontSize: 13 },
  btn: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalRow: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12 },
  modalClose: { marginTop: 12, borderWidth: 1, borderRadius: 14, height: 48, justifyContent: 'center', alignItems: 'center' },
  debugWrap: { marginTop: 16, borderWidth: 1, borderRadius: 14, padding: 12 },
  debugTitle: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  debugLine: { fontSize: 11, marginBottom: 4 },
})
