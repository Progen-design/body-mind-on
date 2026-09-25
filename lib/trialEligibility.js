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
import { TRIAL_DAYS } from './pricingConstants.js';

/**
 * Délka zkušebního období ve dnech, do Stripe `trial_period_days`.
 *
 * Do 3. 9. 2026 tu byla vlastní konstanta (`= 7`) s komentářem „jediné místo
 * pravdy" — a přesně tenhle komentář byl na dvou místech zároveň:
 * `lib/pricingConstants.js` (odtud čte appka texty o trialu, včetně
 * registrace) měl tu samou hodnotu, nezávisle. Shodovaly se, ale byla to
 * náhoda dvou lidí, co číslo nikdy neupravili zvlášť — jediné SKUTEČNÉ místo
 * pravdy je teď `pricingConstants.js`, tohle je jen jeho použití pro Stripe.
 */
export const TRIAL_PERIOD_DAYS = TRIAL_DAYS;

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

/** Stripe Checkout přijme `subscription_data.trial_end` nejdřív 48 h dopředu. */
export const MIN_STRIPE_TRIAL_MS = 48 * 60 * 60 * 1000;

/**
 * ZBYTEK TRIALU PŘI PLATBĚ BĚHEM NĚJ (25. 9. 2026).
 *
 * START dostane trial hned při registraci (`status = 'trial'`, `trial_ends_at`,
 * lib/membershipRegistration.js). Kdo si během něj zaplatil předplatné,
 * dostal checkout BEZ trialu (`trialDaysForCheckout` → undefined, protože
 * `trial_ends_at` je vyplněné) a Stripe strhl 599 Kč hned — o zbývající dny
 * zdarma přišel. Teď Stripe dostane `trial_end` = konec našeho trialu
 * a první platba je až po něm (8. den, u poukazu 31.).
 *
 * Jedna funkce pro běžný 7denní trial i pro poukaz (30 dní) — poukaz je jen
 * delší `trial_ends_at`, žádná zvláštní cesta.
 *
 * @param {{ status?: string, trial_ends_at?: string|null, stripe_subscription_id?: string|null } | null} membership
 * @param {number} [ted=Date.now()]
 * @returns {number|undefined} unix sekundy pro `trial_end`, nebo undefined
 *   (bez trialu, se subscription, vypršelý trial, méně než 48 h do konce).
 */
export function stripeTrialEndZMembership(membership, ted = Date.now()) {
  if (!membership || membership.stripe_subscription_id) return undefined;
  if (String(membership.status || '').toLowerCase() !== 'trial') return undefined;
  const konec = Date.parse(String(membership.trial_ends_at || ''));
  if (!Number.isFinite(konec) || konec - ted < MIN_STRIPE_TRIAL_MS) return undefined;
  return Math.floor(konec / 1000);
}

/**
 * Trial pole pro `subscription_data` Stripe Checkoutu.
 *
 * - START v našem trialu, zbývá ≥ 48 h → `trial_end` = konec trialu
 * - úplně nový uživatel (bez členství) → `trial_period_days` = 7
 * - jinak (trial doběhl nebo zbývá < 48 h, platil už dřív, jiný tier) → {}
 *   = platí se hned, jako dosud.
 *
 * `trial_settings.end_behavior.missing_payment_method = 'cancel'`: když trial
 * doběhne a karta chybí, subscription se zruší a nevisí v past_due.
 *
 * @param {string} tier
 * @param {object|null} membership
 * @param {number} [ted=Date.now()]
 * @returns {{ trial_end?: number, trial_period_days?: number, trial_settings?: object }}
 */
export function stripeTrialProCheckout(tier, membership, ted = Date.now()) {
  if (String(tier || '').toUpperCase() !== 'START') return {};
  const trialSettings = { end_behavior: { missing_payment_method: 'cancel' } };

  const trialEnd = stripeTrialEndZMembership(membership, ted);
  if (trialEnd) return { trial_end: trialEnd, trial_settings: trialSettings };

  const dni = trialDaysForCheckout(tier, membership);
  if (dni) return { trial_period_days: dni, trial_settings: trialSettings };
  return {};
}
