import { supabase } from '@lib/supabaseClient.js';

export type ProgramTier = 'START' | 'ON_CLUB' | 'VIP';

/**
 * Autentizovaný Stripe Checkout.
 *
 * Volaně vlastní `fetch`, ne `apiFetch` z `./api.ts` — ten věší VŠECHNY 403
 * na `ZPRAVA_NEAKTIVNI_CLENSTVI`, což by přebilo skutečnou zprávu endpointu
 * (např. „Tento produkt zatím není k dispozici"). Checkout navíc musí
 * fungovat i s neaktivním členstvím — to je celý smysl.
 *
 * @returns Stripe checkout URL, na kterou má volající přesměrovat (`window.location.href`).
 */
export async function spustitCheckout(tier: ProgramTier): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('Pro aktivaci se nejdřív přihlas.');
  }

  const odpoved = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tier }),
  });

  const telo = await odpoved.json().catch(() => ({}));
  if (!odpoved.ok) {
    throw new Error(telo?.error || 'Checkout se nepodařilo spustit.');
  }
  if (!telo?.url) {
    throw new Error('Stripe nevrátil checkout URL.');
  }
  return telo.url as string;
}
