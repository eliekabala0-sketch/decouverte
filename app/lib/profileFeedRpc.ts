import { supabase } from '@/lib/supabase'
import type { Profile } from '../../lib/types'

export type FeedMode = 'libre' | 'serieux'

export type ProfileFeedResult = {
  profiles: Profile[]
  totalCount: number
  missingRpc?: boolean
}

function isMissingRpc(error: { code?: string; message?: string } | null | undefined): boolean {
  const msg = (error?.message ?? '').toLowerCase()
  return error?.code === 'PGRST202' || msg.includes('could not find the function') || msg.includes('schema cache')
}

export async function getProfileFeed(mode: FeedMode, page: number, pageSize: number): Promise<ProfileFeedResult> {
  const { data, error } = await supabase.rpc('get_profile_feed', {
    p_mode: mode,
    p_page: page,
    p_page_size: pageSize,
  })

  if (!error) {
    const rows = (data ?? []) as Profile[]
    const first = rows[0] as (Profile & { total_count?: number | string }) | undefined
    return {
      profiles: rows,
      totalCount: Number(first?.total_count ?? rows.length),
    }
  }

  if (!isMissingRpc(error)) throw new Error(error.message || 'Chargement du feed impossible.')

  const from = Math.max(0, page) * Math.max(1, pageSize)
  const to = from + Math.max(1, pageSize) - 1
  const { data: fallback, error: fallbackError, count } = await supabase
    .from('profiles')
    .select(
      'id,created_at,gender,city,commune,status,is_verified,username,age,mode_libre_active,mode_serieux_active,boost_reason,boosted_until,is_boosted,country,role',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (fallbackError) throw new Error(fallbackError.message || 'Chargement du feed impossible.')
  return {
    profiles: ((fallback ?? []) as Profile[]).map((row) => ({
      ...row,
      username: 'Profil',
      photo: null,
      bio: null,
      can_view_full: false,
      is_limited_teaser: true,
      active_boost: false,
    })),
    totalCount: count ?? fallback?.length ?? 0,
    missingRpc: true,
  }
}
