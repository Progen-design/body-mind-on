/**
 * Mapování Stripe price_id → membership tier.
 * Env: STRIPE_PRICE_START_MONTHLY, STRIPE_PRICE_ON_CLUB_MONTHLY, STRIPE_PRICE_VIP_MONTHLY
 */

const TIER_ENV_KEYS = {
  START: 'STRIPE_PRICE_START_MONTHLY',
  ON_CLUB: 'STRIPE_PRICE_ON_CLUB_MONTHLY',
  VIP: 'STRIPE_PRICE_VIP_MONTHLY',
};

/**
 * @returns {Record<string, string>} priceId → tier
 */
export function buildStripePriceToTierMap(env = process.env) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const [tier, envKey] of Object.entries(TIER_ENV_KEYS)) {
    const priceId = String(env[envKey] || '').trim();
    if (priceId) map[priceId] = tier;
  }
  return map;
}

/**
 * @param {string|null|undefined} priceId
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function resolveTierFromStripePriceId(priceId, env = process.env) {
  const id = String(priceId || '').trim();
  if (!id) return null;
  const map = buildStripePriceToTierMap(env);
  return map[id] || null;
}

/**
 * @param {import('stripe').Stripe.Subscription} subscription
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function resolveTierFromStripeSubscription(subscription, env = process.env) {
  const priceId = subscription?.items?.data?.[0]?.price?.id
    || subscription?.items?.data?.[0]?.plan?.id
    || null;
  return resolveTierFromStripePriceId(priceId, env);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ configured: string[], missing: string[] }}
 */
export function stripeTierEnvStatus(env = process.env) {
  const configured = [];
  const missing = [];
  for (const [tier, envKey] of Object.entries(TIER_ENV_KEYS)) {
    if (String(env[envKey] || '').trim()) configured.push(tier);
    else missing.push(envKey);
  }
  return { configured, missing };
}

/**
 * @param {string} tier
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function getStripePriceIdForTier(tier, env = process.env) {
  const t = String(tier || '').toUpperCase();
  const envKey = TIER_ENV_KEYS[t];
  if (!envKey) return null;
  const priceId = String(env[envKey] || '').trim();
  return priceId || null;
}

/**
 * @param {string|null|undefined} expectedTier
 * @param {string|null|undefined} resolvedTier
 * @returns {boolean}
 */
export function tiersMatch(expectedTier, resolvedTier) {
  const a = String(expectedTier || '').toUpperCase();
  const b = String(resolvedTier || '').toUpperCase();
  if (!a || !b) return true;
  return a === b;
}
