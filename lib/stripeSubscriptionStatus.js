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
