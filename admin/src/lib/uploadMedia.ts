import { supabase } from './supabase'

const BUCKET = 'admin-media'
const MAX_SIZE_MB = 50

export type MediaKind = 'publications' | 'mass-messages' | 'campaigns'

/**
 * Upload un fichier image ou vidéo vers Supabase Storage et retourne l'URL publique.
 * Compatible téléphone et ordinateur.
 */
export async function uploadMedia(
  file: File,
  kind: MediaKind
): Promise<{ url: string; error?: string }> {
  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > MAX_SIZE_MB) {
    return { url: '', error: `Fichier trop volumineux (max ${MAX_SIZE_MB} Mo).` }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `${kind}/${Date.now()}_${safeName}`

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    return { url: '', error: error.message }
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return { url: urlData.publicUrl }
}
