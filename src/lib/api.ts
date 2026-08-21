import { supabase } from '@lib/supabaseClient.js';

/**
 * Volani vlastniho API. Endpointy cekaji Supabase access token
 * v hlavicce Authorization, ne cookie.
 */
export async function apiFetch<T>(cesta: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  const odpoved = await fetch(cesta, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  });

  const text = await odpoved.text();
  const telo = text ? JSON.parse(text) : {};

  if (!odpoved.ok) {
    const zprava = telo?.error || telo?.message || `Chyba ${odpoved.status}`;
    throw Object.assign(new Error(String(zprava)), { status: odpoved.status });
  }
  return telo as T;
}
