/**
 * Veřejné URL webu vs. aplikace – výchozí hodnoty odpovídají produkci (bodyandmindon.cz / app.bodyandmindon.cz).
 * Na Vercel přepiš NEXT_PUBLIC_APP_URL a případně NEXT_PUBLIC_MAIN_SITE_URL.
 */

export const DEFAULT_PUBLIC_APP_URL = 'https://app.bodyandmindon.cz';
export const DEFAULT_PUBLIC_MAIN_SITE_URL = 'https://bodyandmindon.cz';

export function getPublicAppUrl() {
  const u = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL;
  const s = u && String(u).trim();
  return s ? s.replace(/\/$/, '') : DEFAULT_PUBLIC_APP_URL;
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
