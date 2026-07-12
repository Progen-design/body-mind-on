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
