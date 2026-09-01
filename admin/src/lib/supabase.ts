import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Compatibilité transitoire pour les anciennes pages pas encore basculées.
// Une URL locale inerte évite qu'elles fassent planter tout le dashboard au chargement.
export const supabase = createClient(supabaseUrl || 'http://127.0.0.1:54321', supabaseKey || 'supabase-disabled')
