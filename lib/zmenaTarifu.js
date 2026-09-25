/**
 * ZMĚNA TARIFU U BĚŽÍCÍHO PŘEDPLATNÉHO — START ↔ ON CLUB.
 *
 * Nový Checkout pro člověka s živou subscription vrací 409 (druhé předplatné
 * = dvojí platba). Změna tarifu je proto změna TÉŽE subscription:
 *
 *   UPGRADE START → ON CLUB (hned)
 *     subscriptions.update: cena položky items[0] → ON CLUB,
 *     proration_behavior 'always_invoice' (rozdíl se doúčtuje hned),
 *     payment_behavior 'error_if_incomplete' (když doplatek neprojde, změna
 *     se neprovede — žádný napůl přepnutý stav). V trialu se trial_end
 *     neposílá: trial běží dál a první platba po něm bude za ON CLUB.
 *
 *   DOWNGRADE ON CLUB → START (od dalšího období)
 *     subscription schedule: fáze 1 = ON CLUB do konce aktuálního období
 *     (s trial_end aktuální fáze, pokud ho má), fáze 2 = START; bez prorace,
 *     žádná vratka. Zrušit jde release schedule.
 *     V TRIALU se nic neplánuje: cena se hned vymění na START bez prorace
 *     a trial_end zůstane — první platba po trialu bude 599 Kč. (Schedule
 *     by trial bez trial_end ve fázi ukončil.)
 *
 *   Schedule blokuje subscriptions.update i cancel — zrušení a odstoupení
 *   ho proto nejdřív uvolní (uvolniSchedule).
 *
 * Metadata `expected_tier` jdou na subscription (upgrade) i na fáze schedule
 * (downgrade) — webhook customer.subscription.updated podle nich kontroluje
 * shodu s tierem z price_id (tiersMatch).
 *
 * Závislosti (stripe klient) se předávají — testy běží s atrapou.
 * Stripe v produkci běží na LIVE klíčích.
 */
import { getStripePriceIdForTier, resolveTierFromStripeSubscription } from './stripeTierMapping.js';
import { konecObdobiSubscription } from './stripeSubscriptionStatus.js';
import { ON_CLUB_PRICE_CZK, START_PRICE_CZK } from './pricingConstants.js';

export const CENA_TARIFU_KC = Object.freeze({ START: START_PRICE_CZK, ON_CLUB: ON_CLUB_PRICE_CZK });
const ZMENITELNE_TARIFY = Object.freeze(['START', 'ON_CLUB']);

/** První (a jediná) položka subscription. */
function polozka(sub) {
  return sub?.items?.data?.[0] || null;
}

/** Aktuální cena položky. */
export function aktualniCena(sub) {
  const p = polozka(sub);
  return p?.price?.id || p?.plan?.id || null;
}

/**
 * Směr změny z aktuálního tieru na cílový.
 * @returns {'upgrade'|'downgrade'|'beze_zmeny'|null} null = nepodporovaná kombinace
 */
export function smerZmeny(aktualniTier, cilovyTier) {
  const a = String(aktualniTier || '').toUpperCase();
  const c = String(cilovyTier || '').toUpperCase();
  if (!ZMENITELNE_TARIFY.includes(a) || !ZMENITELNE_TARIFY.includes(c)) return null;
  if (a === c) return 'beze_zmeny';
  return c === 'ON_CLUB' ? 'upgrade' : 'downgrade';
}

/**
 * Datum prorace zaokrouhlené na minutu (dvojklik = stejné parametry = stejný
 * idempotency key), nikdy před začátkem aktuálního období.
 */
export function datumProrace(sub, nowMs) {
  const minuta = Math.floor(nowMs / 1000 / 60) * 60;
  const start = polozka(sub)?.current_period_start ?? sub?.current_period_start ?? 0;
  return Math.max(minuta, Number(start) || 0);
}

/**
 * Parametry pro subscriptions.update při upgradu. V trialu BEZ trial_end —
 * trial doběhne a první platba bude za nový tarif.
 */
export function parametryUpgradu(sub, cilovaCena, nowMs) {
  return {
    items: [{ id: polozka(sub).id, price: cilovaCena }],
    proration_behavior: 'always_invoice',
    proration_date: datumProrace(sub, nowMs),
    payment_behavior: 'error_if_incomplete',
    metadata: { ...(sub.metadata || {}), expected_tier: 'ON_CLUB' },
  };
}

/**
 * Náhled upgradu: kolik se zaplatí dnes a kolik dál.
 * @returns {Promise<{ dnesKc: number, dalKc: number, trialDo: string|null }>}
 */
export async function nahledUpgradu(stripe, sub, cilovaCena, nowMs) {
  const zakaznik = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const p = parametryUpgradu(sub, cilovaCena, nowMs);
  const faktura = await stripe.invoices.createPreview({
    customer: zakaznik,
    subscription: sub.id,
    subscription_details: {
      items: p.items,
      proration_behavior: p.proration_behavior,
      proration_date: p.proration_date,
    },
  });
  const trialing = sub.status === 'trialing' && sub.trial_end;
  return {
    // V trialu se nic neúčtuje — i kdyby náhled přinesl nulovou fakturu.
    dnesKc: trialing ? 0 : Math.max(0, Math.round(Number(faktura?.amount_due || 0) / 100)),
    dalKc: CENA_TARIFU_KC.ON_CLUB,
    trialDo: trialing ? new Date(sub.trial_end * 1000).toISOString() : null,
  };
}

/**
 * Je downgrade už naplánovaný? (schedule, jehož poslední fáze je cena START)
 * @returns {Promise<{ schedule: any, od: string|null } | null>}
 */
export async function naplanovanyDowngrade(stripe, sub, cenaStart) {
  const id = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id;
  if (!id) return null;
  const schedule = await stripe.subscriptionSchedules.retrieve(id);
  const faze = schedule?.phases || [];
  const posledni = faze[faze.length - 1];
  const cena = posledni?.items?.[0]?.price;
  const cenaId = typeof cena === 'string' ? cena : cena?.id;
  if (faze.length < 2 || cenaId !== cenaStart) return null;
  return { schedule, od: posledni.start_date ? new Date(posledni.start_date * 1000).toISOString() : null };
}

/**
 * Uvolní schedule subscription (naplánovaná změna tarifu zanikne, subscription
 * běží dál na aktuální ceně). Bez schedule nic nedělá.
 * @returns {Promise<string|null>} id uvolněného schedule
 */
export async function uvolniSchedule(stripe, sub) {
  const id = typeof sub?.schedule === 'string' ? sub.schedule : sub?.schedule?.id;
  if (!id) return null;
  await stripe.subscriptionSchedules.release(id);
  return id;
}

/**
 * Downgrade ON CLUB → START. Bez prorace, bez vratky.
 *   - v trialu hned (výměna ceny, trial běží dál) → { zpusob: 'hned' }
 *   - jinak schedule od dalšího období → { zpusob: 'schedule' }
 * @returns {Promise<{ od: string|null, zpusob: 'hned'|'schedule', scheduleId?: string }>}
 */
export async function naplanujDowngrade(stripe, sub, cenaStart) {
  const cenaTed = aktualniCena(sub);
  if (sub.status === 'trialing' && sub.trial_end) {
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: polozka(sub).id, price: cenaStart }],
      proration_behavior: 'none',
      metadata: { ...(sub.metadata || {}), expected_tier: 'START' },
    }, { idempotencyKey: `downgrade-trial-${sub.id}-${cenaTed}` });
    return { od: new Date(sub.trial_end * 1000).toISOString(), zpusob: 'hned' };
  }
  const idSchedule = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id;
  const schedule = idSchedule
    ? await stripe.subscriptionSchedules.retrieve(idSchedule)
    : await stripe.subscriptionSchedules.create(
      { from_subscription: sub.id },
      { idempotencyKey: `downgrade-schedule-${sub.id}` },
    );
  const aktualni = schedule.phases?.[0];
  const konec = aktualni?.end_date || Math.floor(Date.parse(konecObdobiSubscription(sub) || 0) / 1000);
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    proration_behavior: 'none',
    phases: [
      {
        items: [{ price: cenaTed, quantity: 1 }],
        start_date: aktualni?.start_date,
        end_date: konec,
        // Trial aktuální fáze se nesmí ztratit — bez trial_end by ho update ukončil.
        ...(aktualni?.trial_end ? { trial_end: aktualni.trial_end } : {}),
        metadata: { expected_tier: 'ON_CLUB' },
      },
      {
        items: [{ price: cenaStart, quantity: 1 }],
        duration: { interval: 'month', interval_count: 1 },
        proration_behavior: 'none',
        metadata: { expected_tier: 'START' },
      },
    ],
  });
  return { od: konec ? new Date(konec * 1000).toISOString() : null, zpusob: 'schedule', scheduleId: schedule.id };
}

/** Tier subscription podle ceny (přes mapování env). */
export function tierPredplatneho(sub, env = process.env) {
  return resolveTierFromStripeSubscription(sub, env);
}

/** Ceny tierů z env — jediná pravda, na co se přepíná. */
export function cenyTarifu(env = process.env) {
  return { START: getStripePriceIdForTier('START', env), ON_CLUB: getStripePriceIdForTier('ON_CLUB', env) };
}
