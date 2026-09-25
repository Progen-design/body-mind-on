/**
 * Mapování Stripe subscription status → kanonický memberships.status
 */

/** @type {readonly string[]} */
export const MEMBERSHIP_STATUSES = Object.freeze([
  'trial',
  'pending_payment',
  'active',
  'past_due',
  'canceled',
  'expired',
]);

/**
 * @param {string|null|undefined} stripeStatus
 * @returns {string|null}
 */
export function mapStripeSubscriptionStatusToMembership(stripeStatus) {
  const s = String(stripeStatus || '').toLowerCase();
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'incomplete':
      return 'pending_payment';
    case 'incomplete_expired':
      return 'expired';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    default:
      return null;
  }
}

/**
 * Konec aktuálního období subscription jako ISO, nebo null.
 *
 * Od Stripe API 2025-03-31.basil (stripe-node v20) už `current_period_end`
 * NENÍ na subscription, ale na položce: `items.data[0].current_period_end`.
 * Čtení ze subscription vracelo `undefined` → `bezi_do` bylo vždy null.
 * Starší tvar (pole přímo na subscription) zůstává jako záloha.
 *
 * @param {{ current_period_end?: number|null, items?: { data?: Array<{ current_period_end?: number|null }> } } | null | undefined} subscription
 * @returns {string|null}
 */
export function konecObdobiSubscription(subscription) {
  const sekundy = subscription?.items?.data?.[0]?.current_period_end ?? subscription?.current_period_end;
  return Number.isFinite(sekundy) && sekundy > 0 ? new Date(sekundy * 1000).toISOString() : null;
}

/** Stavy, ve kterých subscription už nic neúčtuje a nový Checkout je v pořádku. */
const MRTVE_STAVY = new Set(['canceled', 'incomplete_expired']);

/**
 * Žije subscription (trialing, active, past_due, unpaid, incomplete, paused)?
 * Pak se nesmí založit druhá přes nový Checkout
 * (api/stripe/create-checkout-session.js → 409).
 *
 * @param {{ status?: string } | null | undefined} subscription
 * @returns {boolean}
 */
export function jePredplatneZive(subscription) {
  if (!subscription?.status) return false;
  return !MRTVE_STAVY.has(String(subscription.status).toLowerCase());
}

/**
 * Stav členství podle Stripe subscription.
 *
 * Trial řídí Stripe, ne my. Když je subscription `trialing`, uživatel má
 * plný přístup, ale ještě nezaplatil — u nás je to `trial` + `trial_ends_at`
 * převzaté ze Stripu. Až trial doběhne a strhne se platba, Stripe pošle
 * `customer.subscription.updated` se stavem `active` a my přepneme.
 *
 * Od 25. 9. 2026 platí pro KAŽDÝ tier: START v trialu může přejít na ON CLUB
 * (/api/subscription/change-tier) a trial mu běží dál. Kdyby se trialing
 * u ON CLUBu mapoval na `active`, ztratil by se `trial_ends_at` a člověk by
 * v appce viděl „předplatné aktivní", přestože ještě nic nezaplatil.
 * Přístup a brány plánů berou `trial` stejně pro všechny tiery
 * (membershipHelpers.isAccessAllowed, planRenewalRules, planGenerationGate).
 *
 * @param {import('stripe').Stripe.Subscription} sub
 * @param {string} _tier tier (trial platí pro každý — parametr zůstává kvůli volajícím)
 * @returns {{ status: string|null, trialEndsAt: string|null }}
 */
export function membershipStateFromSubscription(sub, _tier) {
  const stripeStatus = String(sub?.status || '').toLowerCase();

  if (stripeStatus === 'trialing' && sub?.trial_end) {
    return {
      status: 'trial',
      trialEndsAt: new Date(sub.trial_end * 1000).toISOString(),
    };
  }

  return {
    status: mapStripeSubscriptionStatusToMembership(stripeStatus),
    trialEndsAt: null,
  };
}
