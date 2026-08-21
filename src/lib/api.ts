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

  let telo: any = {};
  if (text) {
    try {
      telo = JSON.parse(text);
    } catch {
      // Server vratil HTML nebo prazdno (vypadek, chybne smerovani). Syrova
      // hlaska z JSON.parse ("Unexpected token '<'") nema co delat pred
      // uzivatelem.
      throw Object.assign(
        new Error('Server neodpověděl očekávaným způsobem. Zkus to prosím za chvíli znovu.'),
        { status: odpoved.status }
      );
    }
  }

  if (!odpoved.ok) {
    const zprava = telo?.error || telo?.message || `Chyba ${odpoved.status}`;
    throw Object.assign(new Error(String(zprava)), { status: odpoved.status });
  }
  return telo as T;
}
