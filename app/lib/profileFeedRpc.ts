import { supabase } from '@/lib/supabase'
import type { Profile } from '../../lib/types'

export type FeedMode = 'libre' | 'serieux'

export type ProfileFeedResult = {
  profiles: Profile[]
  totalCount: number
  missingRpc?: boolean
}

export type ProfileFeedFilters = {
  city?: string | null
  commune?: string | null
  targetGender?: 'M' | 'F' | 'all' | null
  minAge?: number | null
  maxAge?: number | null
  verifiedOnly?: boolean
  withPhotoOnly?: boolean
  expandScope?: boolean
}

function isMissingRpc(error: { code?: string; message?: string } | null | undefined): boolean {
  const msg = (error?.message ?? '').toLowerCase()
  return error?.code === 'PGRST202' || msg.includes('could not find the function') || msg.includes('schema cache')
}

function hasFilteredRequest(filters: ProfileFeedFilters): boolean {
  return !!(
    filters.expandScope ||
    filters.city?.trim() ||
    filters.commune?.trim() ||
    (filters.targetGender && filters.targetGender !== 'all') ||
    filters.minAge != null ||
    filters.maxAge != null ||
    filters.verifiedOnly ||
    filters.withPhotoOnly
  )
}

async function getLegacyProfileFeed(mode: FeedMode, page: number, pageSize: number, missingRpc = false): Promise<ProfileFeedResult> {
  const legacy = await supabase.rpc('get_profile_feed', {
    p_mode: mode,
    p_page: page,
    p_page_size: pageSize,
  })
  if (legacy.error) throw new Error(legacy.error.message || 'Chargement du feed impossible.')
  const rows = (legacy.data ?? []) as Profile[]
  const first = rows[0] as (Profile & { total_count?: number | string }) | undefined
  return { profiles: rows, totalCount: Number(first?.total_count ?? rows.length), missingRpc }
}

export async function getProfileFeed(mode: FeedMode, page: number, pageSize: number, filters: ProfileFeedFilters = {}): Promise<ProfileFeedResult> {
  if (!hasFilteredRequest(filters)) {
    return getLegacyProfileFeed(mode, page, pageSize)
  }

  const { data, error } = await supabase.rpc('get_profile_feed', {
    p_mode: mode,
    p_page: page,
    p_page_size: pageSize,
    p_city: filters.expandScope ? null : (filters.city?.trim() || null),
    p_commune: filters.expandScope ? null : (filters.commune?.trim() || null),
    p_target_gender: filters.targetGender && filters.targetGender !== 'all' ? filters.targetGender : null,
    p_min_age: filters.minAge ?? null,
    p_max_age: filters.maxAge ?? null,
    p_verified_only: !!filters.verifiedOnly,
    p_with_photo_only: !!filters.withPhotoOnly,
    p_expand_scope: !!filters.expandScope,
  })

  if (!error) {
    const rows = (data ?? []) as Profile[]
    const first = rows[0] as (Profile & { total_count?: number | string }) | undefined
    return {
      profiles: rows,
      totalCount: Number(first?.total_count ?? rows.length),
    }
  }

  if (!isMissingRpc(error)) {
    throw new Error(error.message || 'Chargement du feed impossible.')
  }

  const from = Math.max(0, page) * Math.max(1, pageSize)
  const to = from + Math.max(1, pageSize) - 1
  let fallbackQuery = supabase
    .from('profiles')
    .select(
      'id,created_at,gender,city,commune,status,is_verified,username,age,mode_libre_active,mode_serieux_active,boost_reason,boosted_until,is_boosted,country,role',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  fallbackQuery = fallbackQuery.eq(mode === 'serieux' ? 'mode_serieux_active' : 'mode_libre_active', true)
  if (!filters.expandScope && filters.city?.trim()) fallbackQuery = fallbackQuery.ilike('city', filters.city.trim())
  if (!filters.expandScope && filters.commune?.trim()) fallbackQuery = fallbackQuery.ilike('commune', filters.commune.trim())
  if (filters.targetGender && filters.targetGender !== 'all') fallbackQuery = fallbackQuery.eq('gender', filters.targetGender)
  if (filters.minAge != null) fallbackQuery = fallbackQuery.gte('age', filters.minAge)
  if (filters.maxAge != null) fallbackQuery = fallbackQuery.lte('age', filters.maxAge)
  if (filters.verifiedOnly) fallbackQuery = fallbackQuery.eq('is_verified', true)
  if (filters.withPhotoOnly) fallbackQuery = fallbackQuery.not('photo', 'is', null)

  const { data: fallback, error: fallbackError, count } = await fallbackQuery.range(from, to)

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
