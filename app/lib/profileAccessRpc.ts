import { supabase } from '@/lib/supabase'

type RpcResult = {
  ok: boolean
  id?: string
  missingRpc?: boolean
  message?: string
}

function isMissingRpc(error: { code?: string; message?: string } | null | undefined): boolean {
  const msg = (error?.message ?? '').toLowerCase()
  return error?.code === 'PGRST202' || msg.includes('could not find the function') || msg.includes('schema cache')
}

export async function unlockProfilePhoto(targetProfileId: string, mode: 'global' | 'libre' | 'serieux'): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('unlock_profile_photo', {
    p_target_profile_id: targetProfileId,
    p_mode: mode,
  })
  if (error) {
    return { ok: false, missingRpc: isMissingRpc(error), message: error.message }
  }
  return { ok: true, id: typeof data === 'string' ? data : undefined }
}

export async function unlockProfileContact(targetProfileId: string, mode: 'global' | 'libre' | 'serieux'): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('unlock_profile_contact', {
    p_target_profile_id: targetProfileId,
    p_mode: mode,
  })
  if (error) {
    return { ok: false, missingRpc: isMissingRpc(error), message: error.message }
  }
  return { ok: true, id: typeof data === 'string' ? data : undefined }
}
