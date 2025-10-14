// /lib/supabaseServer.js
import { createClient } from '@supabase/supabase-js';

// ✅ Správné proměnné (jen ty, které Supabase opravdu potřebuje)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('❌ Chybí SUPABASE_URL v env proměnných');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('❌ Chybí SUPABASE_SERVICE_ROLE_KEY v env proměnných');
}

// ✅ Vytvoření serverového klienta (s právem INSERT)
export const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
