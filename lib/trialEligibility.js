/**
 * Kdo má ještě nárok na 7 dní zdarma.
 *
 * PRAVIDLO: trial dostaneš JEDNOU. Drží ho Stripe (trial_period_days),
 * ne naše databáze. Tady jen rozhodujeme, jestli ho do checkout session přidat.
 *
 * Nárok NEMÁ ten, kdo:
 *   - už někdy měl Stripe subscription (stripe_subscription_id) — trial proběhl tam
 *   - má vyplněné trial_ends_at — dostal starý lokální trial (registrace před variantou B)
 *   - je nebo byl aktivní
 *
 * Díky druhému pravidlu si starý uživatel nemůže kliknutím na paywall
 * natáhnout dalších 7 dní zdarma. Zaplatí rovnou.
 */

/** Délka zkušebního období ve dnech. Jediné místo pravdy. */
export const TRIAL_PERIOD_DAYS = 7;

/**
 * @param {{ status?: string, trial_ends_at?: string|null, stripe_subscription_id?: string|null } | null} membership
 * @returns {boolean}
 */
export function isTrialEligible(membership) {
  if (!membership) return true; // úplně nový člověk, membership ještě nevznikl

  if (membership.stripe_subscription_id) return false;
  if (membership.trial_ends_at) return false;

  const status = String(membership.status || '').toLowerCase();
  if (status === 'active' || status === 'trial' || status === 'past_due' || status === 'canceled') {
    return false;
  }

  return true;
}

/**
 * Kolik dní trialu poslat do Stripe checkoutu.
 * @param {string} tier
 * @param {object|null} membership
 * @returns {number|undefined} undefined = bez trialu (Stripe pole vynecháme)
 */
export function trialDaysForCheckout(tier, membership) {
  if (String(tier || '').toUpperCase() !== 'START') return undefined;
  return isTrialEligible(membership) ? TRIAL_PERIOD_DAYS : undefined;
}
