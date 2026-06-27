import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { canViewFullProfiles, remainingContacts } from '../../lib/access'
import type { MassMessage, ProfileAccess } from '../../lib/types'

function normalizeGender(gender?: string | null) {
  const value = String(gender ?? '').trim().toLowerCase()
  if (['m', 'male', 'man', 'homme', 'h'].includes(value)) return 'M'
  if (['f', 'female', 'woman', 'femme'].includes(value)) return 'F'
  return gender ?? 'other'
}

function matchesAnnouncementSegment(
  msg: MassMessage,
  profile: { gender: string; city: string; commune: string | null } | null,
  profileAccess: ProfileAccess | null,
) {
  if (!profile) return msg.segment === 'all'
  const gender = normalizeGender(profile.gender)
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
  if (msg.segment === 'mode_libre' || msg.segment === 'mode_serieux') return true
  return false
}

export function useNotificationCounters() {
  const { user, profile, profileAccess } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const massOn = isOn('mass_messages_enabled')
  const pubsOn = isOn('public_publications_enabled')
  const [announcementDot, setAnnouncementDot] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [newPublications, setNewPublications] = useState(0)

  const refreshCounters = useCallback(async () => {
    if (!user?.id) {
      setAnnouncementDot(false)
      setUnreadMessages(0)
      setNewPublications(0)
      return
    }

    const conversations = await supabase
      .from('conversations')
      .select('id')
      .contains('participant_ids', [user.id])
    const conversationIds = ((conversations.data ?? []) as { id: string }[]).map((c) => c.id)
    if (conversationIds.length === 0) {
      setUnreadMessages(0)
    } else {
      const { count } = await supabase
        .from('messages')
        .select('id', { head: true, count: 'exact' })
        .in('conversation_id', conversationIds)
        .neq('sender_id', user.id)
        .is('read_at', null)
      setUnreadMessages(count ?? 0)
    }

    if (massOn) {
      const { data: messages } = await supabase
        .from('mass_messages')
        .select('*')
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(20)
      const visible = ((messages ?? []) as MassMessage[]).filter((msg) =>
        matchesAnnouncementSegment(msg, profile ?? null, profileAccess ?? null),
      )
      const latestSent = visible[0]?.sent_at
      const { data: state } = await supabase
        .from('user_announcement_read_state')
        .select('last_read_announcements_at')
        .eq('user_id', user.id)
        .maybeSingle()
      const lastRead =
        (state as { last_read_announcements_at?: string } | null)?.last_read_announcements_at ??
        '1970-01-01T00:00:00Z'
      setAnnouncementDot(!!latestSent && new Date(latestSent) > new Date(lastRead))
    } else {
      setAnnouncementDot(false)
    }

    if (pubsOn) {
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
      setNewPublications(count ?? 0)
    } else {
      setNewPublications(0)
    }
  }, [user?.id, profile?.id, profile?.gender, profile?.city, profile?.commune, profileAccess, massOn, pubsOn])

  useEffect(() => {
    void refreshCounters()
  }, [refreshCounters])

  useEffect(() => {
    if (!user?.id) return
    const msgChannel = supabase
      .channel(`notification-messages:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void refreshCounters()
      })
      .subscribe()
    const pubChannel = supabase
      .channel('notification-publications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'public_publications' }, () => {
        void refreshCounters()
      })
      .subscribe()
    const announcementChannel = supabase
      .channel('notification-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mass_messages' }, () => {
        void refreshCounters()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(pubChannel)
      supabase.removeChannel(announcementChannel)
    }
  }, [user?.id, refreshCounters])

  return { announcementDot, unreadMessages, newPublications, refreshCounters }
}
