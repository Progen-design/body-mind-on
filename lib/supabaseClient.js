// /lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const hasValidEnv = supabaseUrl && supabaseAnonKey

// Když chybí env, nepoužíváme createClient s placeholder hodnotami (Supabase by mohl při buildu padat).
// Exportujeme stub, aby build prošel. Na runtime s platnými env var se stránka načte správně.
const noop = () => {}
const stubAuth = {
  getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  refreshSession: () => Promise.resolve({ data: { session: null }, error: { message: 'Supabase není nakonfigurován.' } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
  signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'Supabase není nakonfigurován. Nastav NEXT_PUBLIC_SUPABASE_URL a NEXT_PUBLIC_SUPABASE_ANON_KEY (např. na Vercel).' } }),
  signInWithOtp: () => Promise.resolve({ data: null, error: { message: 'Supabase není nakonfigurován.' } }),
  signUp: () => Promise.resolve({ data: null, error: { message: 'Supabase není nakonfigurován.' } }),
  signOut: () => Promise.resolve({ error: null }),
}

const supabase = hasValidEnv
  ? createClient(supabaseUrl, supabaseAnonKey)
  : { auth: stubAuth }

/** Vrátí false, pokud chybí env a klient běží se stubem. */
export function isSupabaseConfigured() {
  return !!hasValidEnv
}

export { supabase }
