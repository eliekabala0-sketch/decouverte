/**
 * Types partagés - Découverte
 * Alignés sur le schéma Supabase réel (tables public.profiles, profile_access, contact_packs).
 */

export type Gender = 'M' | 'F' | 'other'
export type AppMode = 'libre' | 'serieux'
export type SerieuxIntention = 'amitie' | 'copinage' | 'amour' | 'mariage'
export type ProfileStatus = 'active' | 'suspended' | 'banned'
export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed'

export type PaymentProvider = 'badiboss_pay' | 'other'

export interface User {
  id: string
  phone: string
  created_at: string
  updated_at: string
}

/** Ligne public.profiles (PK id = auth.users.id). */
export interface Profile {
  id: string
  created_at: string
  phone: string
  photo: string | null
  gender: Gender
  city: string
  commune: string | null
  bio: string | null
  status: ProfileStatus
  is_verified: boolean
  username: string
  age: number
  /** Colonne `profiles.mode_libre_active` (filtre Mode Libre). */
  mode_libre_active?: boolean
  /** Colonne `profiles.mode_serieux_active` (filtre Mode Sérieux). */
  mode_serieux_active?: boolean
  boost_reason: string | null
  /** Fin de campagne boost (si colonne présente en base, migration 021). */
  boosted_until?: string | null
  is_boosted?: boolean | null
  country: string | null
  role: string | null
}

export interface ProfileAccess {
  user_id: string
  contact_quota: number
  contact_quota_used: number
  updated_at?: string | null
  photo_quota?: number | null
  photo_quota_used?: number | null
  all_profiles_access?: boolean | null
}

export interface ContactPack {
  id: string
  name: string
  quota: number
  contact_quota?: number | null
  photo_quota?: number | null
  all_profiles_access?: boolean | null
  price_cents: number
  currency: string
  is_active: boolean
  sort_order: number
  created_at?: string
}

export interface Payment {
  id: string
  user_id: string
  type: 'profiles_access' | 'contact_pack' | 'boost'
  provider?: PaymentProvider
  amount_cents: number
  currency: string
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  reference: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Conversation {
  id: string
  participant_ids: string[]
  last_message_at: string
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  read_at: string | null
}

export type PublicationContentType = 'text' | 'image' | 'video'

export interface PublicPublication {
  id: string
  author_id: string
  title: string
  content: string
  content_type?: PublicationContentType
  image_url: string | null
  video_url?: string | null
  is_pinned: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AdCampaign {
  id: string
  title: string
  image_url: string
  text: string
  start_at: string
  end_at: string
  audience: 'all' | 'men' | 'women' | 'paying' | 'non_paying'
  priority: number
  is_active: boolean
  created_at: string
}

export interface Report {
  id: string
  reporter_id: string
  reported_id: string
  type: string
  reason: string
  status: ReportStatus
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

export interface AdminSettings {
  id: string
  key: string
  value: boolean | number | string
  updated_at: string
}

export type MassMessageContentType = 'text' | 'image' | 'video'

export interface MassMessage {
  id: string
  title: string
  body: string
  content_type?: MassMessageContentType
  image_url?: string | null
  video_url?: string | null
  segment: 'all' | 'men' | 'women' | 'paying' | 'non_paying' | 'city' | 'commune' | 'mode_libre' | 'mode_serieux'
  segment_value?: string
  sent_at: string | null
  created_by: string
  created_at: string
}
