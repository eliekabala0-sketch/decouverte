import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { canViewFullProfiles, remainingContacts } from '../../lib/access'
import type { MassMessage, ProfileAccess } from '../../lib/types'
import { apiRequest, apiBaseUrl } from '@/lib/api'

type Counters = {
  announcementDot: boolean
  unreadMessages: number
  newPublications: number
}

const EMPTY_COUNTERS: Counters = {
  announcementDot: false,
  unreadMessages: 0,
  newPublications: 0,
}

let sharedCounters: Counters = EMPTY_COUNTERS
let sharedKey = ''
let sharedAt = 0
let sharedRefresh: Promise<Counters> | null = null
let realtimeUserId: string | null = null
let realtimeRefs = 0
let latestRefresh: (() => void) | null = null
let realtimeChannels: Array<ReturnType<typeof supabase.channel>> = []
const listeners = new Set<(next: Counters) => void>()
const DEDUPE_MS = 1500

function emit(next: Counters) {
  sharedCounters = next
  sharedAt = Date.now()
  listeners.forEach((listener) => listener(next))
}

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

function matchesAnnouncementSegment(
  msg: MassMessage,
  profile: { gender: string; city: string; commune: string | null; age?: number | null; is_verified?: boolean | null; mode_libre_active?: boolean | null; mode_serieux_active?: boolean | null; boosted_until?: string | null; is_boosted?: boolean | null } | null,
  profileAccess: ProfileAccess | null,
) {
  if (!profile) return msg.segment === 'all'
  const gender = normalizeGender(profile.gender)
  const filters = (msg.target_filters ?? {}) as { min_age?: number; max_age?: number }
  if (filters.min_age && (profile.age ?? 0) < filters.min_age) return false
  if (filters.max_age && (profile.age ?? 0) > filters.max_age) return false
  if (msg.segment === 'all') return true
  if (msg.segment === 'men' && gender === 'M') return true
  if (msg.segment === 'women' && gender === 'F') return true
  if (msg.segment === 'paying') {
    const hasAccess = canViewFullProfiles(gender, profileAccess) || remainingContacts(profileAccess) > 0
    return !!hasAccess
  }
  if (msg.segment === 'non_paying') {
    const hasAccess = canViewFullProfiles(gender, profileAccess) || remainingContacts(profileAccess) > 0
    return !hasAccess
  }
  if (msg.segment === 'city' && msg.segment_value) return profile.city === msg.segment_value
  if (msg.segment === 'commune' && msg.segment_value) return (profile.commune ?? '') === msg.segment_value
  if (msg.segment === 'mode_libre') return !!profile.mode_libre_active
  if (msg.segment === 'mode_serieux') return !!profile.mode_serieux_active
  if (msg.segment === 'verified') return !!profile.is_verified
  if (msg.segment === 'unverified') return !profile.is_verified
  if (msg.segment === 'boosted') return !!profile.is_boosted || (!!profile.boosted_until && new Date(profile.boosted_until) > new Date())
  if (msg.segment === 'with_pack') return canViewFullProfiles(gender, profileAccess) || remainingContacts(profileAccess) > 0
  if (msg.segment === 'without_pack') return !(canViewFullProfiles(gender, profileAccess) || remainingContacts(profileAccess) > 0)
  if (msg.segment === 'new_users') return true
  return false
}

function subscribeRealtime(userId: string) {
  if (realtimeUserId === userId && realtimeChannels.length > 0) {
    realtimeRefs += 1
    return
  }

  realtimeChannels.forEach((channel) => {
    void supabase.removeChannel(channel)
  })
  realtimeChannels = []
  realtimeUserId = userId
  realtimeRefs = 1

  const refresh = () => {
    latestRefresh?.()
  }

  realtimeChannels = [
    supabase.channel(`notification-messages:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh).subscribe(),
    supabase.channel('notification-publications').on('postgres_changes', { event: '*', schema: 'public', table: 'public_publications' }, refresh).subscribe(),
    supabase.channel('notification-announcements').on('postgres_changes', { event: '*', schema: 'public', table: 'mass_messages' }, refresh).subscribe(),
  ]
}

function unsubscribeRealtime(userId: string) {
  if (realtimeUserId !== userId) return
  realtimeRefs = Math.max(0, realtimeRefs - 1)
  if (realtimeRefs > 0) return
  realtimeChannels.forEach((channel) => {
    void supabase.removeChannel(channel)
  })
  realtimeChannels = []
  realtimeUserId = null
}

export function useNotificationCounters() {
  const { user, profile, profileAccess } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const massOn = isOn('mass_messages_enabled')
  const pubsOn = isOn('public_publications_enabled')
  const [snapshot, setSnapshot] = useState<Counters>(sharedCounters)

  const refreshCounters = useCallback(async () => {
    const key = [
      user?.id ?? 'anon',
      profile?.id ?? 'no-profile',
      profile?.gender ?? '',
      profile?.city ?? '',
      profile?.commune ?? '',
      massOn ? 'mass' : 'no-mass',
      pubsOn ? 'pubs' : 'no-pubs',
    ].join('|')

    if (!user?.id) {
      sharedKey = key
      emit(EMPTY_COUNTERS)
      return EMPTY_COUNTERS
    }

    if (sharedRefresh && sharedKey === key) return sharedRefresh
    if (sharedKey === key && Date.now() - sharedAt < DEDUPE_MS) return sharedCounters

    sharedKey = key
    sharedRefresh = (async () => {
      if (apiBaseUrl) {
        const next = await apiRequest<Counters>('/v1/notifications/counts')
        emit(next)
        return next
      }
      const conversations = await supabase
        .from('conversations')
        .select('id')
        .contains('participant_ids', [user.id])
      const conversationIds = ((conversations.data ?? []) as { id: string }[]).map((c) => c.id)

      const unreadPromise =
        conversationIds.length === 0
          ? Promise.resolve(0)
          : supabase
              .from('messages')
              .select('id', { head: true, count: 'exact' })
              .in('conversation_id', conversationIds)
              .neq('sender_id', user.id)
              .is('read_at', null)
              .then(({ count }) => count ?? 0)

      const announcementPromise = massOn
        ? (async () => {
            const [{ data: messages }, { data: state }] = await Promise.all([
              supabase
                .from('mass_messages')
                .select('*')
                .not('sent_at', 'is', null)
                .order('sent_at', { ascending: false })
                .limit(20),
              supabase
                .from('user_announcement_read_state')
                .select('last_read_announcements_at')
                .eq('user_id', user.id)
                .maybeSingle(),
            ])
            const visible = ((messages ?? []) as MassMessage[]).filter((msg) =>
              matchesAnnouncementSegment(msg, profile ?? null, profileAccess ?? null),
            )
            const latestSent = visible[0]?.sent_at
            const lastRead =
              (state as { last_read_announcements_at?: string } | null)?.last_read_announcements_at ??
              '1970-01-01T00:00:00Z'
            return !!latestSent && new Date(latestSent) > new Date(lastRead)
          })()
        : Promise.resolve(false)

      const publicationsPromise = pubsOn
        ? (async () => {
            const { data: state } = await supabase
              .from('user_publication_read_state')
              .select('last_read_publications_at')
              .eq('user_id', user.id)
              .maybeSingle()
            const lastRead =
              (state as { last_read_publications_at?: string } | null)?.last_read_publications_at ??
              '1970-01-01T00:00:00Z'
            const { count } = await supabase
              .from('public_publications')
              .select('id', { head: true, count: 'exact' })
              .eq('is_active', true)
              .gt('created_at', lastRead)
            return count ?? 0
          })()
        : Promise.resolve(0)

      const [unreadMessages, announcementDot, newPublications] = await Promise.all([
        unreadPromise,
        announcementPromise,
        publicationsPromise,
      ])
      const next = { announcementDot, unreadMessages, newPublications }
      emit(next)
      return next
    })().finally(() => {
      sharedRefresh = null
    })

    return sharedRefresh
  }, [user?.id, profile?.id, profile?.gender, profile?.city, profile?.commune, profileAccess, massOn, pubsOn])

  useEffect(() => {
    const listener = (next: Counters) => setSnapshot(next)
    listeners.add(listener)
    void refreshCounters()
    return () => {
      listeners.delete(listener)
    }
  }, [refreshCounters])

  useEffect(() => {
    latestRefresh = () => {
      void refreshCounters()
    }
  }, [refreshCounters])

  useEffect(() => {
    if (!user?.id) return
    if (apiBaseUrl) {
      const timer = setInterval(() => void refreshCounters(), 15_000)
      return () => clearInterval(timer)
    }
    subscribeRealtime(user.id)
    return () => {
      unsubscribeRealtime(user.id)
    }
  }, [user?.id])

  return { ...snapshot, refreshCounters }
}
