import { supabase } from '@/lib/supabase'

const PROFILE_MEDIA_BUCKET = 'profile-media'

export type ProfilePhotoRow = {
  id: string
  user_id: string
  photo_url: string
  is_primary: boolean
  sort_order: number
  created_at: string
}

async function toBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri)
  if (!res.ok) throw new Error(`Impossible de lire le fichier (${res.status})`)
  return await res.blob()
}

export async function uploadProfilePhoto(userId: string, uri: string, mimeType?: string): Promise<string> {
  const blob = await toBlob(uri)
  const contentType = mimeType || (blob.type && blob.type !== '' ? blob.type : 'image/jpeg')
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: upErr } = await supabase.storage.from(PROFILE_MEDIA_BUCKET).upload(path, blob, {
    upsert: false,
    contentType,
    cacheControl: '3600',
  })
  if (upErr) throw new Error(upErr.message || 'Upload photo échoué.')

  const { data } = supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function listProfilePhotos(userId: string): Promise<ProfilePhotoRow[]> {
  const { data, error } = await supabase
    .from('profile_photos')
    .select('*')
    .eq('user_id', userId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message || 'Chargement galerie impossible.')
  return (data ?? []) as ProfilePhotoRow[]
}

export async function insertProfilePhoto(userId: string, photoUrl: string, isPrimary = false): Promise<string> {
  const { data, error } = await supabase
    .from('profile_photos')
    .insert({
      user_id: userId,
      photo_url: photoUrl,
      is_primary: isPrimary,
      sort_order: 0,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message || 'Ajout photo impossible.')
  return (data as { id: string }).id
}

export async function setPrimaryPhoto(userId: string, photoId: string, photoUrl: string): Promise<void> {
  const { error: resetErr } = await supabase
    .from('profile_photos')
    .update({ is_primary: false })
    .eq('user_id', userId)
  if (resetErr) throw new Error(resetErr.message || 'Mise à jour galerie impossible.')

  const { error: setErr } = await supabase
    .from('profile_photos')
    .update({ is_primary: true })
    .eq('id', photoId)
    .eq('user_id', userId)
  if (setErr) throw new Error(setErr.message || 'Définition photo principale impossible.')

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ photo: photoUrl })
    .eq('id', userId)
  if (profileErr) throw new Error(profileErr.message || 'Profil principal non mis à jour.')
}

export async function deleteProfilePhoto(userId: string, photo: ProfilePhotoRow): Promise<void> {
  const { error } = await supabase
    .from('profile_photos')
    .delete()
    .eq('id', photo.id)
    .eq('user_id', userId)
  if (error) throw new Error(error.message || 'Suppression photo impossible.')

  if (photo.is_primary) {
    const rows = await listProfilePhotos(userId)
    if (rows.length > 0) {
      await setPrimaryPhoto(userId, rows[0].id, rows[0].photo_url)
    } else {
      const { error: profileErr } = await supabase.from('profiles').update({ photo: null }).eq('id', userId)
      if (profileErr) throw new Error(profileErr.message || 'Impossible de vider la photo principale.')
    }
  }
}
