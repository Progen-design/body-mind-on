/**
 * Veřejné URL webu vs. aplikace.
 * Pořadí výchozí URL aplikace (bez koncového /):
 *   NEXT_PUBLIC_APP_URL → APP_URL → VERCEL_URL (jen Preview, ne Production) → kanonická produkční app.
 * Výchozí bez env je vždy https://app.bodyandmindon.cz (odkazy v e-mailech i serverová logika).
 */

export const DEFAULT_PUBLIC_APP_URL = 'https://app.bodyandmindon.cz';
export const DEFAULT_PUBLIC_MAIN_SITE_URL = 'https://bodyandmindon.cz';

/**
 * @returns {string} základní URL aplikace bez koncového /
 */
export function getPublicAppUrl() {
  if (typeof process === 'undefined') return DEFAULT_PUBLIC_APP_URL;

  const fromNext = process.env.NEXT_PUBLIC_APP_URL && String(process.env.NEXT_PUBLIC_APP_URL).trim();
  if (fromNext) return fromNext.replace(/\/$/, '');

  const fromApp = process.env.APP_URL && String(process.env.APP_URL).trim();
  if (fromApp) return fromApp.replace(/\/$/, '');

  // Preview / dev deployment – ne production (tam musí být NEXT_PUBLIC_APP_URL nebo default app URL)
  const vercel = process.env.VERCEL_URL && String(process.env.VERCEL_URL).trim();
  if (vercel && process.env.VERCEL_ENV !== 'production') {
    const withProto = vercel.startsWith('http') ? vercel : `https://${vercel}`;
    return withProto.replace(/\/$/, '');
  }

  return DEFAULT_PUBLIC_APP_URL;
}

/** Přihlášení pod aktuální getPublicAppUrl(). */
export function getDefaultLoginUrl() {
  return `${getPublicAppUrl()}/login`;
}

export function getPublicMainSiteUrl() {
  const u = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MAIN_SITE_URL;
  const s = u && String(u).trim();
  return s ? s.replace(/\/$/, '') : DEFAULT_PUBLIC_MAIN_SITE_URL;
}

/** Marketingová doména (bez app.) – pro middleware / rozcestník. */
export function isMarketingHostname(host) {
  const h = String(host || '').toLowerCase().split(':')[0];
  return h === 'bodyandmindon.cz' || h === 'www.bodyandmindon.cz';
}
