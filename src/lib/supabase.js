import { createClient } from '@supabase/supabase-js'

const metaEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
const nodeEnv =
  typeof globalThis !== 'undefined' && globalThis['process']?.env
    ? globalThis['process'].env
    : {}

const supabaseUrl =
  metaEnv.VITE_SUPABASE_URL ||
  nodeEnv.VITE_SUPABASE_URL ||
  'https://ckdctcvxrhweppwatajr.supabase.co'

const supabaseKey =
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  nodeEnv.VITE_SUPABASE_ANON_KEY ||
  'placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)

