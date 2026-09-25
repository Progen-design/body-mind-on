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
import { ON_CLUB_PRICE_CZK, START_PRICE_CZK } from '../../lib/pricingConstants.js';

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

/**
 * Předplatné ze zrcadla Stripe (api/profile.js → lib/predplatneProUi.js).
 * Když je, UI bere cenu a data odsud — ne z konstant ani z memberships.
 */
export interface PredplatneUi {
  plan: string;
  cena_kc: number | null;
  stav: string;
  trial_do: string | null;
  dalsi_platba: string | null;
  konci_k: string | null;
  poukaz: boolean;
}

const nazevTarifu = (plan: string) => (/on[\s_]?club/i.test(plan) ? 'ON CLUB' : String(plan || 'START').toUpperCase());
const cenaKc = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`;

/** Klidná věta místo „Zkušební období končí… Odemknout". */
export function textNastavenehoPredplatneho(
  trialKonci: string | null | undefined,
  plan: string = 'START',
  predplatne: PredplatneUi | null = null,
): string {
  // ZE ZRCADLA STRIPE: skutečná cena a datum první platby, poukaz, zrušení.
  if (predplatne) {
    const nazev = nazevTarifu(predplatne.plan || plan);
    const konci = datumCesky(predplatne.konci_k);
    if (konci) return `Předplatné ${nazev} končí ${konci}. Do té doby máš plný přístup.`;
    const platba = datumCesky(predplatne.trial_do ?? predplatne.dalsi_platba);
    const cena = predplatne.cena_kc != null ? cenaKc(predplatne.cena_kc) : null;
    if (predplatne.poukaz && predplatne.trial_do && platba) {
      return cena
        ? `Předplatné ${nazev} je nastavené — zdarma do ${platba} (poukaz). Pak ${cena} měsíčně.`
        : `Předplatné ${nazev} je nastavené — zdarma do ${platba} (poukaz).`;
    }
    if (platba && cena) return `Předplatné ${nazev} je nastavené. První platba ${cena} proběhne ${platba}. Do té doby máš plný přístup.`;
  }
  const kdy = datumCesky(trialKonci);
  // Po upgradu během trialu (change-tier) je nastavený ON CLUB — i cena první platby.
  const onClub = /on[\s_]?club/i.test(plan);
  const nazev = onClub ? 'ON CLUB' : 'START';
  const cena = (onClub ? ON_CLUB_PRICE_CZK : START_PRICE_CZK).toLocaleString('cs-CZ');
  return kdy
    ? `Předplatné ${nazev} je nastavené. První platba ${cena} Kč proběhne ${kdy}. Do té doby máš plný přístup.`
    : `Předplatné ${nazev} je nastavené. Do první platby ${cena} Kč máš plný přístup.`;
}

/**
 * „START · předplatné aktivní od 25. 9. 2026" / „START · zkušební období" …
 * Jeden popis pro dlaždici účtu i sekci Účet a předplatné.
 */
export function popisClenstvi(
  plan: string,
  stav: StavPredplatneho | undefined,
  clenemOd?: string | null,
  predplatne: PredplatneUi | null = null,
): string {
  const od = datumCesky(clenemOd);
  switch (stav) {
    case 'trial_s_kartou':
    case 'active': {
      // Ze zrcadla Stripe: konec, poukaz, nebo další platba se skutečnou cenou.
      const konci = datumCesky(predplatne?.konci_k);
      if (konci) return `${plan} · předplatné končí ${konci}`;
      const trialDo = datumCesky(predplatne?.trial_do);
      if (predplatne?.poukaz && trialDo) return `${plan} · zdarma do ${trialDo} (poukaz)`;
      const dalsi = datumCesky(predplatne?.dalsi_platba);
      if (predplatne && dalsi && predplatne.cena_kc != null) {
        return `${plan} · předplatné aktivní · další platba ${cenaKc(predplatne.cena_kc)} ${dalsi}`;
      }
      return od ? `${plan} · předplatné aktivní od ${od}` : `${plan} · předplatné aktivní`;
    }
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
