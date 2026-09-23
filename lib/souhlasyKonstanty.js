/**
 * KONSTANTY SOUHLASU — sdílené mezi prohlížečem a serverem.
 *
 * Schválně samostatný soubor bez jediného importu. `lib/souhlasy.js` importuje
 * `supabaseServer`, takže kdyby si registrační formulář bral `DRUHY_SOUHLASU`
 * odtamtud, natáhl by serverový modul do klientského bundlu. Dnes by nic
 * neuniklo (supabaseServer je líná Proxy a env čte až za běhu), ale stačilo by
 * jednou přesunout `process.env.SUPABASE_SERVICE_ROLE_KEY` do těla modulu
 * a service klíč by skončil ve veřejném JS. Tahle hranice tomu předchází.
 *
 * `lib/souhlasy.js` obě konstanty re-exportuje, aby se serverový kód nemusel
 * přepisovat a existoval jen jeden zdroj pravdy.
 */

/** Musí souhlasit s `PROVOZOVATEL.ucinnostOd` v bodyandmindon-web/lib/legal.ts. */
export const UCINNOST_PRAVNICH_TEXTU = '2026-09-01';

/**
 * Druhy souhlasu, které musí registrace nést. Hodnoty musí sedět na CHECK
 * v migraci 20260909124639_souhlasy_uzivatelu.sql.
 */
export const DRUHY_SOUHLASU = Object.freeze([
  'obchodni_podminky',
  'zdravotni_udaje',
]);

/**
 * Souhlas s pravidly komunity.
 *
 * SCHVÁLNĚ MIMO `DRUHY_SOUHLASU`. Ten seznam registrace vyžaduje CELÝ
 * (`DRUHY_SOUHLASU.some(...)` v lib/registration/bodyMetricsRegistration.js),
 * takže přidat sem nový druh by znamenalo blokovat zakládání účtů lidem,
 * kteří o komunitu vůbec nestojí. Tenhle souhlas se bere až při prvním
 * příspěvku a nikde jinde se nevyžaduje.
 *
 * Hodnota musí sedět na CHECK v migraci 20260923010000_komunita_pr2.sql.
 */
export const DRUH_SOUHLASU_KOMUNITA = 'komunita';
