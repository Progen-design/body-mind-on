/**
 * E-MAILY, KTERÉ ZALOŽILY NAŠE VLASTNÍ TESTY — jediný zdroj pravdy pro úklid.
 *
 * PROČ TENHLE MODUL VZNIKL. `scripts/delete-smoketest-users.mjs` měl vzor
 * zadrátovaný u sebe a hledal jen `smoketest+*@bodyandmindon.cz`. Jenže smoke
 * test zakládá `info+bm-smoke-…` a `bm-smoke-…@example.com`, takže úklid
 * 14. 8. 2026 v release testu prošel bez chyby a nesmazal nic — v ostré DB
 * přitom leželo 41 testovacích účtů. Vzor bez testu se rozejde s generátorem
 * a nikdo si toho nevšimne, protože „nic ke smazání" vypadá jako úspěch.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TOHLE NENÍ TOTÉŽ CO `je_testovaci_email()` V DB A NESMÍ BÝT.
 *
 * DB funkce (migrace 20260813214759) má větev
 * `^(info|smoketest)\+[^@]+@bodyandmindon\.cz$`, tedy JAKÝKOLI `info+…` alias.
 * Pro hlídku v `system_health_alerts` je to správně — falešně nezakřičí.
 * Pro MAZÁNÍ je to mina: ručně založený `info+neco@bodyandmindon.cz` by zmizel.
 * Tady se proto vypisují konkrétní prefixy, které generují naše skripty, a nic
 * navíc. Množina je záměrně UŽŠÍ než ta v DB.
 *
 * @type {readonly RegExp[]}
 */
export const TEST_ACCOUNT_EMAIL_PATTERNS = Object.freeze([
  /** historické účty */
  /^smoketest\+[^@]+@bodyandmindon\.cz$/i,
  /** scripts/smoke-test-critical-path.mjs — proti produkci (alias) i lokálně */
  /^[^@]+\+bm-smoke-[^@]*@/i,
  /^bm-smoke-[^@]*@/i,
  /** scripts/verify-paid-path.mjs */
  /^[^@]+\+bm-paid-[^@]*@/i,
  /^bm-paid-[^@]*@/i,
  /** scripts/e2e-stripe-subscription-test.mjs → stripe.e2e@test.invalid */
  /@test\.invalid$/i,
]);

/**
 * Je to účet, který po sobě nechal náš vlastní test?
 *
 * `info+beta-…` a `info+stripe-preview-…` sem SCHVÁLNĚ NEPATŘÍ: beta účty
 * můžou být živé pozvánky a preview má vlastní skript
 * (`admin:cleanup-stripe-preview-users`).
 *
 * @param {unknown} email
 * @returns {boolean}
 */
export function isTestAccountEmail(email) {
  const em = String(email ?? '').trim().toLowerCase();
  if (!em) return false;
  return TEST_ACCOUNT_EMAIL_PATTERNS.some((re) => re.test(em));
}
