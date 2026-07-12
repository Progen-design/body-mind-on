/**
 * Feature flags pro prodej placených programů (výchozí vypnuto).
 */

/**
 * @returns {boolean}
 */
export function isOnClubSalesEnabled() {
  return String(process.env.NEXT_PUBLIC_ON_CLUB_SALES_ENABLED || '').toLowerCase() === 'true';
}

/**
 * @returns {boolean}
 */
export function isVipSalesEnabled() {
  return String(process.env.NEXT_PUBLIC_VIP_SALES_ENABLED || '').toLowerCase() === 'true';
}

/**
 * @param {'START'|'ON_CLUB'|'VIP'} tier
 * @returns {boolean}
 */
export function isTierCheckoutEnabled(tier) {
  const t = String(tier || '').toUpperCase();
  if (t === 'START') return true;
  if (t === 'ON_CLUB') return isOnClubSalesEnabled();
  if (t === 'VIP') return isVipSalesEnabled();
  return false;
}
