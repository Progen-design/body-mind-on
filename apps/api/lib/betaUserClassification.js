/** Classify synthetic vs likely-real users for beta reports. */

const STRIPE_PREVIEW_RE = /^info\+stripe-preview-[0-9]+(?:-[A-Za-z0-9_-]+)?@bodyandmindon\.cz$/i;
const BM_SMOKE_RE = /^bm-smoke/i;

/**
 * @param {{ id?: string, email?: string, app_metadata?: object, user_metadata?: object }} user
 * @returns {'synthetic'|'likely_real'}
 */
export function classifyBetaUser(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  const appMeta = user?.app_metadata || {};
  const userMeta = user?.user_metadata || {};

  if (appMeta.synthetic_test_user === true || userMeta.synthetic_test_user === true) {
    return 'synthetic';
  }
  if (STRIPE_PREVIEW_RE.test(email)) return 'synthetic';
  if (BM_SMOKE_RE.test(email)) return 'synthetic';
  if (email.includes('+test') && email.endsWith('@bodyandmindon.cz')) return 'synthetic';

  return 'likely_real';
}

export const SYNTHETIC_EMAIL_PATTERNS = [
  STRIPE_PREVIEW_RE,
  BM_SMOKE_RE,
];
