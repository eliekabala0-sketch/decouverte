import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AudioSession, LiveKitRoom, VideoTrack, isTrackReference, useTracks } from '@livekit/react-native'
import { Track } from 'livekit-client'
import { Ionicons } from '@expo/vector-icons'
import { apiRequest, type CallCredentials } from '@/lib/api'
import { useTheme } from '@/theme/ThemeContext'

function Participants({ video }: { video: boolean }) {
  const tracks = useTracks([Track.Source.Camera])
  if (!video) return <View style={styles.audioPulse}><Ionicons name="call" size={52} color="#fff" /></View>
  return (
    <View style={styles.videoGrid}>
      {tracks.map((track) => isTrackReference(track)
        ? <VideoTrack key={`${track.participant.identity}-${track.source}`} trackRef={track} style={styles.video} />
        : null)}
    </View>
  )
}

export default function CallScreen() {
  const { id, kind = 'audio', callId } = useLocalSearchParams<{ id: string; kind?: 'audio' | 'video'; callId?: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const [credentials, setCredentials] = useState<CallCredentials | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        await AudioSession.startAudioSession()
        const result = callId
          ? await apiRequest<CallCredentials>(`/v1/calls/${callId}/join`, { method: 'POST' })
          : await apiRequest<CallCredentials>('/v1/calls', {
              method: 'POST', body: JSON.stringify({ conversationId: id, kind }),
            })
        if (active) setCredentials(result)
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Appel indisponible')
      }
    })()
    return () => { active = false; void AudioSession.stopAudioSession() }
  }, [callId, id, kind])

  const hangUp = async () => {
    if (credentials) await apiRequest(`/v1/calls/${credentials.callId}/end`, { method: 'POST' }).catch(() => {})
    router.back()
  }

  if (error) return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      <Pressable onPress={() => router.back()}><Text style={{ color: colors.primary }}>Retour</Text></Pressable>
    </View>
  )
  if (!credentials) return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={{ color: colors.text, marginTop: 16 }}>Connexion de l’appel…</Text>
    </View>
  )

  return (
    <LiveKitRoom serverUrl={credentials.url} token={credentials.token} connect audio video={credentials.kind === 'video'}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Text style={[styles.title, { color: colors.text }]}>{credentials.kind === 'video' ? 'Appel vidéo' : 'Appel audio'}</Text>
        <Text style={{ color: colors.textSecondary }}>Chiffré en transit</Text>
      </View>
      <Participants video={credentials.kind === 'video'} />
      <View style={styles.controls}>
        <Pressable accessibilityLabel="Raccrocher" onPress={() => void hangUp()} style={styles.hangup}>
          <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
      </View>
    </LiveKitRoom>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { paddingTop: 64, paddingHorizontal: 20, alignItems: 'center' }, title: { fontSize: 22, fontWeight: '700' },
  videoGrid: { flex: 1, padding: 12, gap: 8 }, video: { flex: 1, minHeight: 220, borderRadius: 18 },
  audioPulse: { alignSelf: 'center', marginTop: 120, width: 132, height: 132, borderRadius: 66, backgroundColor: '#E24B5B', alignItems: 'center', justifyContent: 'center' },
  controls: { paddingBottom: 42, alignItems: 'center' }, hangup: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#D92D3A', alignItems: 'center', justifyContent: 'center' },
  error: { textAlign: 'center', marginBottom: 20, fontSize: 16 },
})
