import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Room, RoomEvent, Track } from 'livekit-client'
import { Ionicons } from '@expo/vector-icons'
import { apiRequest, type CallCredentials } from '@/lib/api'
import { useTheme } from '@/theme/ThemeContext'

export default function WebCallScreen() {
  const { id, kind = 'audio', callId } = useLocalSearchParams<{ id: string; kind?: 'audio' | 'video'; callId?: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const roomRef = useRef<Room | null>(null)
  const [credentials, setCredentials] = useState<CallCredentials | null>(null)
  const [status, setStatus] = useState('Connexion de l’appel…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const call = callId
          ? await apiRequest<CallCredentials>(`/v1/calls/${callId}/join`, { method: 'POST' })
          : await apiRequest<CallCredentials>('/v1/calls', { method: 'POST', body: JSON.stringify({ conversationId: id, kind }) })
        if (!active) return
        setCredentials(call)
        const room = new Room({ adaptiveStream: true, dynacast: true })
        roomRef.current = room
        room.on(RoomEvent.ParticipantConnected, () => setStatus('Appel en cours'))
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio && typeof document !== 'undefined') document.body.appendChild(track.attach())
        })
        await room.connect(call.url, call.token)
        await room.localParticipant.setMicrophoneEnabled(true)
        if (call.kind === 'video') await room.localParticipant.setCameraEnabled(true)
        setStatus('En attente du contact…')
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Appel indisponible')
      }
    })()
    return () => { active = false; roomRef.current?.disconnect() }
  }, [callId, id, kind])

  const hangUp = async () => {
    roomRef.current?.disconnect()
    if (credentials) await apiRequest(`/v1/calls/${credentials.callId}/end`, { method: 'POST' }).catch(() => {})
    router.back()
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      {!error && !credentials ? <ActivityIndicator color={colors.primary} size="large" /> : null}
      <View style={styles.avatar}><Ionicons name={kind === 'video' ? 'videocam' : 'call'} size={48} color="#fff" /></View>
      <Text style={[styles.title, { color: colors.text }]}>{kind === 'video' ? 'Appel vidéo' : 'Appel audio'}</Text>
      <Text style={{ color: colors.textSecondary, marginTop: 8 }}>{error ?? status}</Text>
      <Pressable accessibilityLabel="Raccrocher" onPress={() => void hangUp()} style={styles.hangup}>
        <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  avatar: { width: 132, height: 132, borderRadius: 66, backgroundColor: '#E24B5B', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700' }, error: { textAlign: 'center', marginBottom: 18 },
  hangup: { marginTop: 48, width: 66, height: 66, borderRadius: 33, backgroundColor: '#D92D3A', alignItems: 'center', justifyContent: 'center' },
})
