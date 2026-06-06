// /lib/supabaseServer.js
import { createClient } from '@supabase/supabase-js';

let _client = null;

function assertServiceRoleKey(key) {
  const trimmed = String(key || '').trim();
  if (!trimmed) {
    throw new Error('❌ Chybí SUPABASE_SERVICE_ROLE_KEY v env proměnných');
  }
  const publishable = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (publishable && trimmed === publishable) {
    throw new Error(
      '❌ SUPABASE_SERVICE_ROLE_KEY je shodný s publishable/anon klíčem — server nemůže obcházet RLS. Nastav legacy service_role JWT nebo sb_secret_* z Supabase Dashboard → API Keys.'
    );
  }
  if (trimmed.startsWith('sb_publishable_')) {
    throw new Error(
      '❌ SUPABASE_SERVICE_ROLE_KEY nesmí být publishable klíč (sb_publishable_*). Použij secret service_role klíč z Supabase Dashboard → API Keys.'
    );
  }
  return trimmed;
}

function getSupabaseServer() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = assertServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url) throw new Error('❌ Chybí SUPABASE_URL v env proměnných');
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
