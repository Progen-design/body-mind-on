/**
 * ODSTOUPENÍ OD SMLOUVY (§ 1829 OZ) A PRVNÍ PLACENÁ FAKTURA.
 *
 * Spotřebitel může do 14 dnů od uzavření smlouvy odstoupit. Služba ale běží
 * od první minuty (souhlas v Checkoutu), takže se vrací zaplacená částka
 * MINUS poměrná část za dny, kdy služba už běžela (§ 1834 OZ).
 *
 * Lhůta se počítá od PRVNÍ PLACENÉ faktury (amount_paid > 0) — trial bez
 * platby do ní nepatří, v trialu se předplatné ruší zdarma.
 *
 * Tady je jen čistá logika a čtení ze Stripe. Nic se tu nerefunduje ani neruší
 * — to dělá api/subscription/withdraw.js ve stanoveném pořadí.
 *
 * Stripe API 2026-02-25.clover: faktura už nemá `subscription` ani
 * `payment_intent`. Subscription je v `parent.subscription_details`, platba
 * v `invoicePayments` (payment.payment_intent, u starších payment.charge).
 */

export const LHUTA_ODSTOUPENI_DNI = 14;
const MS_DEN = 24 * 60 * 60 * 1000;

/** Důvody, proč odstoupit nejde. Text vidí uživatel (409). */
export const DUVODY_BEZ_NAROKU = Object.freeze({
  bez_predplatneho: 'K tvému účtu není vedené předplatné, od kterého by šlo odstoupit.',
  bez_platby: 'Zatím jsi nic nezaplatil — ve zkušebním období stačí předplatné zrušit.',
  po_lhute: `Lhůta ${LHUTA_ODSTOUPENI_DNI} dnů od první platby už uplynula. Předplatné můžeš zrušit ke konci období.`,
  zruseno: 'Předplatné už je ukončené.',
});

/**
 * ID subscription z faktury — nový tvar (parent) i starý (subscription).
 * @param {any} invoice
 * @returns {string|null}
 */
export function subscriptionIdFaktury(invoice) {
  const s = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription ?? null;
  if (!s) return null;
  return typeof s === 'string' ? s : s.id || null;
}

/**
 * Kdy byla faktura zaplacena (ms). paid_at, jinak created.
 * @param {any} invoice
 */
export function zaplacenoMs(invoice) {
  const s = invoice?.status_transitions?.paid_at ?? invoice?.created;
  return Number.isFinite(s) ? s * 1000 : NaN;
}

/**
 * Nejstarší zaplacená faktura s nenulovou částkou.
 * @param {any[]} faktury
 * @returns {any|null}
 */
export function prvniPlacenaFaktura(faktury) {
  const placene = (faktury || []).filter((f) => f && f.status === 'paid' && Number(f.amount_paid) > 0);
  if (!placene.length) return null;
  return placene.sort((a, b) => zaplacenoMs(a) - zaplacenoMs(b) || String(a.id).localeCompare(String(b.id)))[0];
}

/**
 * Je tahle faktura první placená? (pro potvrzení smlouvy z webhooku invoice.paid)
 * Stripe se ptá na všechny zaplacené faktury subscription.
 *
 * @param {any} invoice
 * @param {{ invoices: { list: Function } }} stripe
 * @returns {Promise<boolean>}
 */
export async function jePrvniPlacenaFaktura(invoice, stripe) {
  if (!(Number(invoice?.amount_paid) > 0)) return false;
  if (!['subscription_create', 'subscription_cycle'].includes(invoice?.billing_reason)) return false;
  const subId = subscriptionIdFaktury(invoice);
  if (!subId) return false;
  const seznam = await stripe.invoices.list({ subscription: subId, status: 'paid', limit: 100 });
  const prvni = prvniPlacenaFaktura([...(seznam?.data || []), invoice]);
  return prvni?.id === invoice.id;
}

/**
 * Období, za které faktura platí (sekundy → ms). První řádek faktury.
 * @param {any} invoice
 * @returns {{ startMs: number, konecMs: number } | null}
 */
export function obdobiFaktury(invoice) {
  const p = invoice?.lines?.data?.[0]?.period;
  const start = p?.start ?? invoice?.period_start;
  const konec = p?.end ?? invoice?.period_end;
  if (!Number.isFinite(start) || !Number.isFinite(konec) || konec <= start) return null;
  return { startMs: start * 1000, konecMs: konec * 1000 };
}

/**
 * Vratka při odstoupení.
 *
 *   vratka = zaplaceno − (dny od začátku období / dny období × zaplaceno)
 *
 * Dny od začátku = celé uplynulé dny (den 0 = odstoupení v den platby →
 * vrací se vše). Zaokrouhleno DOLŮ na celé Kč, nikdy záporné.
 *
 * @param {{ zaplacenoKc: number, obdobi: { startMs: number, konecMs: number }, nowMs: number }} p
 * @returns {{ vratkaKc: number, dnyVyuzito: number, dnyObdobi: number }}
 */
export function vypocetVratky({ zaplacenoKc, obdobi, nowMs }) {
  const dnyObdobi = Math.max(1, Math.round((obdobi.konecMs - obdobi.startMs) / MS_DEN));
  const dnyVyuzito = Math.min(dnyObdobi, Math.max(0, Math.floor((nowMs - obdobi.startMs) / MS_DEN)));
  const pomernaCast = (dnyVyuzito / dnyObdobi) * zaplacenoKc;
  const vratkaKc = Math.max(0, Math.floor(zaplacenoKc - pomernaCast + 1e-9));
  return { vratkaKc, dnyVyuzito, dnyObdobi };
}

/**
 * Má uživatel nárok odstoupit?
 *
 * @param {{ subscription: any, prvniFaktura: any|null, nowMs: number }} p
 * @returns {{ narok: true } | { narok: false, duvod: keyof typeof DUVODY_BEZ_NAROKU }}
 */
export function narokNaOdstoupeni({ subscription, prvniFaktura, nowMs }) {
  if (!subscription) return { narok: false, duvod: 'bez_predplatneho' };
  if (['canceled', 'incomplete_expired'].includes(String(subscription.status))) return { narok: false, duvod: 'zruseno' };
  if (!prvniFaktura) return { narok: false, duvod: 'bez_platby' };
  const zaplaceno = zaplacenoMs(prvniFaktura);
  if (!Number.isFinite(zaplaceno) || nowMs - zaplaceno > LHUTA_ODSTOUPENI_DNI * MS_DEN) {
    return { narok: false, duvod: 'po_lhute' };
  }
  return { narok: true };
}

/**
 * Platba faktury pro refund: { payment_intent } nebo { charge }.
 * @param {string} invoiceId
 * @param {{ invoicePayments: { list: Function } }} stripe
 * @returns {Promise<{ payment_intent: string } | { charge: string } | null>}
 */
export async function platbaFaktury(invoiceId, stripe) {
  const seznam = await stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid', limit: 10 });
  for (const zaznam of seznam?.data || []) {
    const pi = zaznam?.payment?.payment_intent;
    if (pi) return { payment_intent: typeof pi === 'string' ? pi : pi.id };
    const ch = zaznam?.payment?.charge;
    if (ch) return { charge: typeof ch === 'string' ? ch : ch.id };
  }
  return null;
}

/** Datum v češtině: 25. 9. 2026 (Europe/Prague). */
export function datumCesky(ms) {
  const d = new Date(ms);
  const casti = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric' })
    .formatToParts(d);
  const v = (t) => casti.find((c) => c.type === t)?.value;
  return `${v('day')}. ${v('month')}. ${v('year')}`;
}

/** Datum a čas: 25. 9. 2026 14:05 (Europe/Prague). */
export function datumCasCesky(ms) {
  const cas = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(ms));
  return `${datumCesky(ms)} ${cas}`;
}
