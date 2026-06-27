import { supabase } from '@/lib/supabase'

export type ProfilePrivateDetails = {
  id: string
  photo: string | null
  bio: string | null
}

export async function getProfilePrivateDetails(profileId: string): Promise<ProfilePrivateDetails | null> {
  const { data, error } = await supabase.rpc('get_profile_private_details', {
    p_target_profile_id: profileId,
  })
  if (error) throw new Error(error.message || 'Acces profil prive non autorise.')
  const row = Array.isArray(data) ? data[0] : null
  return (row ?? null) as ProfilePrivateDetails | null
}
