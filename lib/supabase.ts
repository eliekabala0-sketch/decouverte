import { createClient } from '@supabase/supabase-js'

// IMPORTANT (Vite): utiliser import.meta.env, pas process.env (sinon "process is not defined").
// Ce client est prévu pour l'environnement web (Vite). L'app Expo utilise `app/lib/supabase.ts`.
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL
const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL or Key missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '')
