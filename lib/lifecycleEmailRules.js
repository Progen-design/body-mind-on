/**
 * Čistá pravidla lifecycle e-mailů — žádná Supabase, žádné IO.
 * Díky tomu se dají otestovat obyčejným node skriptem.
 */
import {
  LIFECYCLE_BYPASS_MIN_GAP,
  LIFECYCLE_PRIORITY,
  TRIAL_ENDED_MAX_DAYS,
  LIFECYCLE_MIN_HOURS_BETWEEN,
  MS_HOUR,
  MS_DAY,
} from './lifecycleEmailConstants.js';
import { adjustToAllowedSendTime } from './betaEmailAutomationRules.js';

/**
 * Vypnutelné bez nasazení. Když proměnná chybí, nic se neposílá.
 * @returns {boolean}
 */
export function isLifecycleEmailEnabled(env = process.env) {
  return String(env.LIFECYCLE_EMAIL_ENABLED || '').trim().toLowerCase() === 'true';
}

/**
 * E-maily po konci trialu (trial_ended, trial_winback_d3) a varianta
 * „zítra strhneme" pro trial s kartou. Vypnuté, dokud se to výslovně nezapne.
 * @returns {boolean}
 */
export function isTrialEndedEmailEnabled(env = process.env) {
  return String(env.LIFECYCLE_TRIAL_ENDED_ENABLED || '').trim().toLowerCase() === 'true';
}

/**
 * Testovací a syntetické účty nikdy neobtěžujeme.
 * @param {string} email
 */
export function isSyntheticEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return true;
  return e.includes('bm-smoke')
    || e.includes('stripe-preview')
    || e.includes('stripe.e2e')
    || e.includes('test.invalid')
    || e.includes('example.com')
    || e.includes('beta-join-')
    || e.includes('beta-email-');
}

/**
 * @param {Date|string|null} at
 * @param {Date} now
 * @returns {number} uplynulé milisekundy (0 když chybí)
 */
function msSince(at, now) {
  if (!at) return 0;
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return 0;
  return now.getTime() - t;
}

/**
 * Které triggery přicházejí v úvahu pro daného uživatele.
 *
 * @param {{ status: string, tier: string, started_at: string|null, trial_ends_at: string|null, stripe_subscription_id?: string|null }} membership
 * @param {{ now?: Date, alreadySent?: string[], sentKeys?: string[], lastSentAt?: string|null, trialEndedEnabled?: boolean }} ctx
 *   alreadySent = ve frontě i odeslané (proti duplicitám), sentKeys = opravdu odeslané
 * @returns {string[]}
 */
export function eligibleTriggers(membership, ctx = {}) {
  const now = ctx.now || new Date();
  const sent = new Set(ctx.alreadySent || []);
  const out = [];
  const odeslano = new Set(ctx.sentKeys ?? ctx.alreadySent ?? []);
  const poKonciZapnuto = ctx.trialEndedEnabled ?? isTrialEndedEmailEnabled();

  if (!membership) return out;

  const status = String(membership.status || '').toLowerCase();
  const startedMs = msSince(membership.started_at, now);

  // ── Sekvence 1: neaktivoval ─────────────────────────────────────────
  // Jakmile přejde na trial/active, tyhle triggery přestanou být eligible
  // a už se nikdy nepošlou. Nikomu tedy nepřijde „aktivuj si předplatné"
  // poté, co ho aktivoval.
  if (status === 'pending_payment') {
    if (startedMs >= 1 * MS_HOUR && !sent.has('activate_1h')) out.push('activate_1h');
    if (startedMs >= 1 * MS_DAY && !sent.has('activate_24h')) out.push('activate_24h');
    if (startedMs >= 3 * MS_DAY && !sent.has('activate_72h')) out.push('activate_72h');
  }

  // ── Sekvence 2: trial běží ve Stripu ────────────────────────────────
  if (status === 'trial' && membership.trial_ends_at) {
    const endsMs = new Date(membership.trial_ends_at).getTime();
    const msToEnd = endsMs - now.getTime();
    const sKartou = Boolean(membership.stripe_subscription_id);

    if (msToEnd > 0) {
      if (startedMs >= 1 * MS_HOUR && !sent.has('trial_welcome')) out.push('trial_welcome');
      if (startedMs >= 2 * MS_DAY && !sent.has('trial_day3')) out.push('trial_day3');
      if (startedMs >= 4 * MS_DAY && !sent.has('trial_day5')) out.push('trial_day5');

      // Zítra strhneme peníze. Tohle není marketing, ale slušnost —
      // a zároveň nejlevnější prevence chargebacků a stížností.
      // Dvě varianty jsou jeden e-mail — kdo dostal jednu, druhou už ne.
      const upozornenPredKoncem = sent.has('trial_ends_tomorrow') || sent.has('trial_ends_tomorrow_card');
      if (msToEnd <= 1 * MS_DAY && !upozornenPredKoncem) {
        // Varování před platbou jde s kartou VŽDY (i s vypnutým flagem) — bez karty
        // by text o stržení 599 Kč nebyl pravda.
        out.push(sKartou ? 'trial_ends_tomorrow_card' : 'trial_ends_tomorrow');
      }
    } else if (poKonciZapnuto && !sKartou && -msToEnd <= TRIAL_ENDED_MAX_DAYS * MS_DAY) {
      // Trial bez karty skončil: plán je pozastavený. Kdo kartu dal, tomu
      // Stripe strhl platbu a nic se nepozastavilo — tomu nepíšeme.
      if (!sent.has('trial_ended')) out.push('trial_ended');
      if (-msToEnd >= 3 * MS_DAY && odeslano.has('trial_ended') && !sent.has('trial_winback_d3')) {
        out.push('trial_winback_d3');
      }
    }
  }

  return out;
}

/**
 * Vybere JEDEN trigger k odeslání. Respektuje odstup mezi e-maily.
 *
 * @param {object} membership
 * @param {{ now?: Date, alreadySent?: string[], lastSentAt?: string|null }} ctx
 * @returns {{ triggerKey: string, scheduledAt: Date } | null}
 */
export function pickNextLifecycleEmail(membership, ctx = {}) {
  const now = ctx.now || new Date();
  const candidates = eligibleTriggers(membership, ctx);
  if (candidates.length === 0) return null;

  const lastSentMs = msSince(ctx.lastSentAt, now);
  const tooSoon = ctx.lastSentAt && lastSentMs < LIFECYCLE_MIN_HOURS_BETWEEN * MS_HOUR;

  for (const key of LIFECYCLE_PRIORITY) {
    if (!candidates.includes(key)) continue;

    // Výjimka z odstupu: „zítra ti strhneme peníze" jde vždycky.
    // Kdybychom ho odložili kvůli rate limitu, poslali bychom ho až po stržení.
    if (tooSoon && !LIFECYCLE_BYPASS_MIN_GAP.includes(key)) continue;

    return { triggerKey: key, scheduledAt: adjustToAllowedSendTime(now) };
  }

  return null;
}
