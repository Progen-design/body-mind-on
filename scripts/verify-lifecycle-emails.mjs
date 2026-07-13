#!/usr/bin/env node
/**
 * Ověření pravidel lifecycle e-mailů. Bez databáze, bez sítě.
 * Testuje to, co se nejsnáz rozbije: komu se NEMÁ nic poslat.
 */
process.env.LIFECYCLE_EMAIL_ENABLED = 'true';
process.env.BETA_EMAIL_AUTOMATION_ENABLED = 'true';

const { pickNextLifecycleEmail, eligibleTriggers, isSyntheticEmail } =
  await import('../lib/lifecycleEmailRules.js');
const { getLifecycleEmailContent, LIFECYCLE_COPY_KEYS } =
  await import('../lib/lifecycleEmailCopy.js');
const { LIFECYCLE_TRIGGERS } = await import('../lib/lifecycleEmailConstants.js');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) { console.log(`OK   ${label}${detail ? ` — ${detail}` : ''}`); return; }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};

const NOW = new Date('2026-07-14T10:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();
const daysAgo = (d) => hoursAgo(d * 24);
const inDays = (d) => new Date(NOW.getTime() + d * 24 * 3600e3).toISOString();

const pick = (m, ctx = {}) => pickNextLifecycleEmail(m, { now: NOW, ...ctx });

// ── Každý trigger má text ──────────────────────────────────────────────
for (const t of LIFECYCLE_TRIGGERS) {
  check(`text pro "${t}"`, !!getLifecycleEmailContent(t));
}
check('žádný text navíc', LIFECYCLE_COPY_KEYS.length === LIFECYCLE_TRIGGERS.length,
  `${LIFECYCLE_COPY_KEYS.length} vs ${LIFECYCLE_TRIGGERS.length}`);

// ── Neaktivoval ────────────────────────────────────────────────────────
check('30 min po registraci: nic',
  pick({ status: 'pending_payment', started_at: hoursAgo(0.5) }) === null);

check('2 h po registraci: activate_1h',
  pick({ status: 'pending_payment', started_at: hoursAgo(2) })?.triggerKey === 'activate_1h');

check('26 h + 1h už poslán: activate_24h',
  pick({ status: 'pending_payment', started_at: hoursAgo(26) },
    { alreadySent: ['activate_1h'], lastSentAt: hoursAgo(25) })?.triggerKey === 'activate_24h');

check('4 dny + předchozí poslány: activate_72h',
  pick({ status: 'pending_payment', started_at: daysAgo(4) },
    { alreadySent: ['activate_1h', 'activate_24h'], lastSentAt: daysAgo(2) })?.triggerKey === 'activate_72h');

check('všechny aktivační poslány: už nic',
  pick({ status: 'pending_payment', started_at: daysAgo(10) },
    { alreadySent: ['activate_1h', 'activate_24h', 'activate_72h'], lastSentAt: daysAgo(5) }) === null);

// ── NEJDŮLEŽITĚJŠÍ: kdo zaplatil, nedostane výzvu k platbě ────────────
check('🔴 aktivní člen: ŽÁDNÝ e-mail',
  pick({ status: 'active', started_at: daysAgo(3) }) === null);

check('🔴 zrušený člen: ŽÁDNÝ e-mail',
  pick({ status: 'canceled', started_at: daysAgo(3) }) === null);

check('🔴 po aktivaci se aktivační trigger nepošle',
  !eligibleTriggers({ status: 'trial', started_at: daysAgo(2), trial_ends_at: inDays(5) }, { now: NOW })
    .some((t) => t.startsWith('activate_')));

// ── Trial ──────────────────────────────────────────────────────────────
check('trial 2 h: trial_welcome',
  pick({ status: 'trial', started_at: hoursAgo(2), trial_ends_at: inDays(7) })?.triggerKey === 'trial_welcome');

check('trial 3. den: trial_day3',
  pick({ status: 'trial', started_at: daysAgo(2.5), trial_ends_at: inDays(4.5) },
    { alreadySent: ['trial_welcome'], lastSentAt: daysAgo(2) })?.triggerKey === 'trial_day3');

check('trial 5. den: trial_day5',
  pick({ status: 'trial', started_at: daysAgo(4.5), trial_ends_at: inDays(2.5) },
    { alreadySent: ['trial_welcome', 'trial_day3'], lastSentAt: daysAgo(2) })?.triggerKey === 'trial_day5');

check('den před stržením: trial_ends_tomorrow',
  pick({ status: 'trial', started_at: daysAgo(6), trial_ends_at: inDays(0.5) },
    { alreadySent: ['trial_welcome', 'trial_day3', 'trial_day5'], lastSentAt: daysAgo(1.5) })?.triggerKey === 'trial_ends_tomorrow');

check('🔴 varování před stržením PŘEBIJE rate limit',
  pick({ status: 'trial', started_at: daysAgo(6), trial_ends_at: inDays(0.5) },
    { alreadySent: ['trial_welcome', 'trial_day3'], lastSentAt: hoursAgo(2) })?.triggerKey === 'trial_ends_tomorrow',
  'jinak by dorazilo až po stržení peněz');

check('rate limit jinak platí',
  pick({ status: 'trial', started_at: daysAgo(3), trial_ends_at: inDays(4) },
    { alreadySent: ['trial_welcome'], lastSentAt: hoursAgo(2) }) === null);

check('trial už vypršel: e-mail ne (řeší paywall)',
  pick({ status: 'trial', started_at: daysAgo(9), trial_ends_at: daysAgo(2) }) === null);

// ── Syntetické účty ────────────────────────────────────────────────────
for (const e of ['a@bm-smoke.cz', 'stripe.e2e@test.invalid', 'x@example.com', '']) {
  check(`syntetický "${e || '(prázdný)'}" odfiltrován`, isSyntheticEmail(e));
}
check('reálný e-mail projde', !isSyntheticEmail('honza@seznam.cz'));

if (failed > 0) {
  console.error(`\n${failed} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('\nALL CHECKS PASS');
