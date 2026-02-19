// /lib/supabaseServer.js
import { createClient } from '@supabase/supabase-js';

let _client = null;

function getSupabaseServer() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('❌ Chybí SUPABASE_URL v env proměnných');
  if (!key) throw new Error('❌ Chybí SUPABASE_SERVICE_ROLE_KEY v env proměnných');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Lazy init: nehází při importu (Vercel build), jen při prvním použití za běhu
export const supabaseServer = new Proxy(
  {},
  {
    get(_, prop) {
      return getSupabaseServer()[prop];
    },
  }
);
