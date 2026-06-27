import { supabase } from '@/lib/supabase'

export async function blockProfile(profileId: string, reason = 'user_hidden_profile'): Promise<string> {
  const { data, error } = await supabase.rpc('block_profile', {
    p_target_profile_id: profileId,
    p_reason: reason,
  })
  if (error) throw new Error(error.message || 'Impossible de masquer ce profil.')
  return String(data)
}

export async function unblockProfile(profileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('unblock_profile', {
    p_target_profile_id: profileId,
  })
  if (error) throw new Error(error.message || 'Impossible de restaurer ce profil.')
  return Boolean(data)
}
