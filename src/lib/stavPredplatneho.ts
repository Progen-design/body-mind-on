/**
 * ODVOZENÝ STAV PŘEDPLATNÉHO PRO UI (25. 9. 2026).
 *
 * Po Stripe Checkoutu během trialu zůstává `memberships.status = 'trial'`
 * (Stripe subscription je `trialing` až do konce trialu), jen přibude
 * `stripe_subscription_id`. UI to nerozlišovalo: dál svítilo „Zkušební
 * období končí za N dní — Odemknout" a „· zkušební období". Člověk nevěděl,
 * že má hotovo, a druhé kliknutí by založilo druhé předplatné.
 *
 * Teď se rozlišuje:
 * - `trial_bez_karty` — trial z registrace, předplatné ještě nenastavené → prodávat
 * - `trial_s_kartou`  — předplatné nastavené, běží Stripe trial → klid, žádné „Odemknout"
 * - ostatní stavy beze změny
 *
 * Čisté funkce bez Reactu — testy v stavPredplatneho.test.ts.
 */
import { START_PRICE_CZK } from '../../lib/pricingConstants.js';

export type StavPredplatneho =
  | 'trial_bez_karty'
  | 'trial_s_kartou'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'pending_payment'
  | 'expired'
  | 'neznamy';

const ZNAME: ReadonlySet<string> = new Set(['active', 'past_due', 'canceled', 'pending_payment', 'expired']);

/**
 * @param status `memberships.status`
 * @param maPredplatne má členství `stripe_subscription_id` (server posílá jen bool)
 */
export function odvodStavPredplatneho(status: string | null | undefined, maPredplatne: boolean): StavPredplatneho {
  const s = String(status || '').toLowerCase();
  if (s === 'trial') return maPredplatne ? 'trial_s_kartou' : 'trial_bez_karty';
  return ZNAME.has(s) ? (s as StavPredplatneho) : 'neznamy';
}

/**
 * Plán je pozastavený: zkušební období skončilo a předplatné nastavené není
 * (trial bez karty po konci, nebo vypršelé členství). UI pak místo prázdných
 * sekcí ukáže jen PlanPozastavenyKarta s jedním tlačítkem do Checkoutu.
 *
 * O konci trialu rozhoduje server (verdikt brány `trial_ended` z api/profile.js,
 * stejná brána jako pro generování plánů) — UI si nic nedopočítává.
 */
export function jePlanPozastaveny(stav: StavPredplatneho | undefined, trialSkoncil: boolean): boolean {
  if (stav === 'expired') return true;
  return stav === 'trial_bez_karty' && trialSkoncil;
}

/** Předplatné je nastavené (karta uložená) — nic dalšího se nemá prodávat. */
export function maNastavenePredplatne(stav: StavPredplatneho | undefined): boolean {
  return stav === 'trial_s_kartou' || stav === 'active';
}

/** 2. 10. 2026 — datum v Praze, bez času. Nesmysl → null. */
function datumCesky(iso: string | null | undefined): string | null {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** Klidná věta místo „Zkušební období končí… Odemknout". */
export function textNastavenehoPredplatneho(trialKonci: string | null | undefined): string {
  const kdy = datumCesky(trialKonci);
  return kdy
    ? `Předplatné START je nastavené. První platba ${START_PRICE_CZK} Kč proběhne ${kdy}. Do té doby máš plný přístup.`
    : `Předplatné START je nastavené. Do první platby ${START_PRICE_CZK} Kč máš plný přístup.`;
}

/**
 * „START · předplatné aktivní od 25. 9. 2026" / „START · zkušební období" …
 * Jeden popis pro dlaždici účtu i sekci Účet a předplatné.
 */
export function popisClenstvi(plan: string, stav: StavPredplatneho | undefined, clenemOd?: string | null): string {
  const od = datumCesky(clenemOd);
  switch (stav) {
    case 'trial_s_kartou':
    case 'active':
      return od ? `${plan} · předplatné aktivní od ${od}` : `${plan} · předplatné aktivní`;
    case 'trial_bez_karty':
      return `${plan} · zkušební období`;
    case 'past_due':
      return `${plan} · čeká na platbu`;
    case 'canceled':
      return `${plan} · zrušeno`;
    case 'pending_payment':
      return `${plan} · čeká na aktivaci`;
    case 'expired':
      return `${plan} · vypršelo`;
    default:
      return plan;
  }
}
