import { useEffect } from 'react'
import { Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { io } from 'socket.io-client'
import { apiAccessToken, apiBaseUrl } from './api'
import { useAuth } from '@/contexts/AuthContext'

type IncomingCall = {
  callId: string
  conversationId: string
  kind: 'audio' | 'video'
  fromUserId: string
}

export function useIncomingCalls() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user?.id || !apiBaseUrl) return
    let socket: ReturnType<typeof io> | null = null
    let cancelled = false
    void (async () => {
      try {
        const token = await apiAccessToken()
        if (cancelled) return
        socket = io(apiBaseUrl, { transports: ['websocket'], auth: { token } })
        socket.on('call:incoming', (call: IncomingCall) => {
          Alert.alert(
            call.kind === 'video' ? 'Appel vidéo entrant' : 'Appel audio entrant',
            'Un contact vous appelle.',
            [
              { text: 'Refuser', style: 'cancel' },
              {
                text: 'Répondre',
                onPress: () => router.push({
                  pathname: '/(app)/call/[id]' as never,
                  params: { id: call.conversationId, kind: call.kind, callId: call.callId },
                }),
              },
            ],
          )
        })
      } catch {
        // La source Supabase reste active tant que MySQL n'est pas basculé.
        // L'absence du nouveau backend ne doit donc pas bloquer l'application.
      }
    })()
    return () => { cancelled = true; socket?.disconnect() }
  }, [router, user?.id])
}
