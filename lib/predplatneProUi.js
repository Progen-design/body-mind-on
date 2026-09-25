/**
 * PŘEDPLATNÉ PRO UI — z public.subscriptions (zrcadlo Stripe, lib/stripeSync.js).
 *
 * UI dřív skládalo „První platba 599 Kč proběhne …" z konstant a z
 * memberships.trial_ends_at. Po poukazu, změně tarifu nebo jiné ceně ve Stripe
 * to lhalo. Teď cena, datum další platby, konec trialu, zrušení ke konci
 * období a poukaz jdou z řádku, který zapsal sync přímo ze Stripe.
 *
 * Čistá funkce — api/profile.js ji volá s řádky z DB, testy s atrapou.
 */

export const SLOUPCE_PREDPLATNEHO = 'stripe_subscription_id, plan_name, price_czk, status, trial_end, current_period_end, cancel_at_period_end, cancel_at, voucher_code, updated_at';

const ZIVE = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused']);

/**
 * Vybere řádek, který patří k členství (stripe_subscription_id), jinak
 * nejnovější živý. Mrtvý (canceled) se vrátí jen tehdy, když patří k členství.
 *
 * @param {Array<object>|null|undefined} radky
 * @param {{ stripe_subscription_id?: string|null } | null} membership
 * @returns {null | { plan: string, cena_kc: number|null, stav: string, trial_do: string|null, dalsi_platba: string|null, konci_k: string|null, poukaz: boolean }}
 */
export function predplatneProUi(radky, membership) {
  const seznam = Array.isArray(radky) ? radky : [];
  const r = seznam.find((x) => membership?.stripe_subscription_id && x.stripe_subscription_id === membership.stripe_subscription_id)
    || seznam.find((x) => ZIVE.has(String(x.status)));
  if (!r) return null;
  const vTrialu = r.status === 'trialing' && r.trial_end;
  const konci = r.cancel_at_period_end ? (r.cancel_at || r.current_period_end) : (r.cancel_at || null);
  return {
    plan: r.plan_name,
    cena_kc: Number.isFinite(Number(r.price_czk)) ? Number(r.price_czk) : null,
    stav: r.status,
    trial_do: vTrialu ? r.trial_end : null,
    // Další platba: konec trialu, jinak konec období. Když předplatné končí, žádná není.
    dalsi_platba: konci ? null : (vTrialu ? r.trial_end : r.current_period_end || null),
    konci_k: konci || null,
    poukaz: Boolean(r.voucher_code),
  };
}
