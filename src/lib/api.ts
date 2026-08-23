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
    // Neaktivni clenstvi resime na jednom miste. Endpointy ho hlidaji ruzne
    // (daily-activation vzdy, habits a workouts jen pri zapisu, zbytek vubec),
    // takze uzivatel by jinak dostal jinou hlasku podle toho, co zrovna kliknul.
    if (odpoved.status === 403) {
      throw Object.assign(new Error(ZPRAVA_NEAKTIVNI_CLENSTVI), {
        status: 403,
        neaktivniClenstvi: true,
        puvodniZprava: telo?.error || telo?.message || null
      });
    }
    const zprava = telo?.error || telo?.message || `Chyba ${odpoved.status}`;
    throw Object.assign(new Error(String(zprava)), { status: odpoved.status });
  }
  return telo as T;
}

export const ZPRAVA_NEAKTIVNI_CLENSTVI =
  'Tvoje členství není aktivní, takže změny neukládáme. Obnov ho v nastavení účtu.';

/** Chyba z apiFetch, na kterou UI reaguje jinak než na výpadek. */
export function jeNeaktivniClenstvi(chyba: unknown): boolean {
  return Boolean((chyba as { neaktivniClenstvi?: boolean })?.neaktivniClenstvi);
}
