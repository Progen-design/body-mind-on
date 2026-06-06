// /lib/supabaseUserClient.js
// Supabase klient s JWT přihlášeného uživatele — RLS vidí auth.uid().
import { createClient } from '@supabase/supabase-js';

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getPublishableKey() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return String(raw).trim();
}

/**
 * Klient pro API routes, kde má DB operaci provést konkrétní uživatel (RLS).
 * @param {string} accessToken
 */
export function createSupabaseUserClient(accessToken) {
  const url = getSupabaseUrl();
  const key = getPublishableKey();
  const token = String(accessToken || '').trim();
  if (!url || !key) {
    throw new Error('Supabase není nakonfigurován (URL / publishable key).');
  }
  if (!token) {
    throw new Error('Chybí access token uživatele.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
