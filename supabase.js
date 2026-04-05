import { createClient } from '@supabase/supabase-js'

// Safe env access (works in Vite and Node without ReferenceError)
const env =
  (typeof import.meta !== 'undefined' && import.meta.env) ||
  (typeof process !== 'undefined' && process.env) ||
  {}

const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
const supabaseKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)