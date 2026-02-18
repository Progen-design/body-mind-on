// /lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_KEY = 'placeholder-anon-key'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY

const isPlaceholder = supabaseUrl === PLACEHOLDER_URL || supabaseAnonKey === PLACEHOLDER_KEY

if (isPlaceholder) {
  const msg = 'Missing Supabase ENV: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (e.g. in Vercel → Settings → Environment Variables). Auth and DB will not work until configured.'
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    console.error('[body-mind-on]', msg)
  } else {
    console.warn('[body-mind-on]', msg)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/** Vrátí false, pokud chybí env a klient běží s placeholder hodnotami (runtime pak selže při dotazech). */
export function isSupabaseConfigured() {
  return !isPlaceholder
}
