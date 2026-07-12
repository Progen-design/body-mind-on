/**
 * Legacy Stripe checkout (e-mail fallback) — výchozí vypnuto.
 * Server-only: STRIPE_ALLOW_LEGACY_CHECKOUT=true
 */

/**
 * @returns {boolean}
 */
export function isStripeLegacyCheckoutAllowed() {
  return String(process.env.STRIPE_ALLOW_LEGACY_CHECKOUT || '').toLowerCase() === 'true';
}
