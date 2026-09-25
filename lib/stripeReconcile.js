/**
 * DENNÍ REKONCILIACE STRIPE ↔ DB (/api/cron/stripe-reconcile).
 *
 * Projde VŠECHNY subscriptions ve Stripe (status all, stránkovaně) a všechny
 * DB řádky se stripe_subscription_id (memberships i subscriptions). Pro každou
 * zavolá syncSubscription — ten srovná DB se Stripe — a do stripe_reconcile_log
 * zapíše, co se změnilo. Nesrovnalosti, které sync sám nespraví nebo které
 * by bez něj zůstaly skryté, hlásí alertem (jeden souhrnný e-mail na běh):
 *
 *   db_aktivni_stripe_neexistuje — membership má subscription, která ve
 *                                  Stripe není, ale DB říká active/trial
 *   db_aktivni_stripe_zruseno    — ve Stripe canceled, v DB active/trial
 *                                  (sync to v tomhle běhu opravil)
 *   stripe_bez_uzivatele         — subscription bez metadata.user_id / zákazníka
 *   stripe_neznama_cena          — cena mimo mapu START/ON_CLUB
 *   poukaz_bez_subscription      — uplatněný poukaz, uživatel má subscription,
 *                                  ale vouchers.stripe_subscription_id chybí
 *   poukaz_trial_nesedi          — Stripe trial_end ≠ memberships.trial_ends_at (±1 h)
 *
 * První běh po nasazení = backfill všech existujících předplatných.
 * Druhý běh bez změn ve Stripe nezapíše žádnou 'zmena'.
 *
 * Závislosti se předávají — testy běží s atrapou Stripe i DB.
 */
import crypto from 'node:crypto';
import { supabaseServer } from './supabaseServer.js';
import { posliAlert, syncSubscription, vychoziDb as vychoziSyncDb } from './stripeSync.js';

const HODINA_MS = 60 * 60 * 1000;
const ZIVE_V_DB = new Set(['active', 'trial']);
const MRTVE_VE_STRIPE = new Set(['canceled', 'incomplete_expired']);

/** DB vrstva rekonciliace (+ vše, co potřebuje sync). */
const vychoziDb = {
  ...vychoziSyncDb,
  /** Všechna stripe_subscription_id z DB. */
  async dbSubscriptionIds() {
    const [m, s] = await Promise.all([
      supabaseServer.from('memberships').select('stripe_subscription_id').not('stripe_subscription_id', 'is', null),
      supabaseServer.from('subscriptions').select('stripe_subscription_id').not('stripe_subscription_id', 'is', null),
    ]);
    if (m.error) throw new Error(`memberships: ${m.error.message}`);
    if (s.error) throw new Error(`subscriptions: ${s.error.message}`);
    return [...(m.data || []), ...(s.data || [])].map((r) => r.stripe_subscription_id);
  },
  async uplatnenePoukazy() {
    const { data, error } = await supabaseServer.from('vouchers')
      .select('code, redeemed_by, stripe_subscription_id').not('redeemed_by', 'is', null);
    if (error) throw new Error(`vouchers: ${error.message}`);
    return data || [];
  },
  async zapisLog(radky) {
    if (!radky.length) return null;
    const { error } = await supabaseServer.from('stripe_reconcile_log').insert(radky);
    return error || null;
  },
};

/** Všechna subscription ID ve Stripe (status all, po 100). */
async function vsechnyStripeIds(stripe) {
  const ids = [];
  let po;
  for (let strana = 0; strana < 1000; strana += 1) {
    const s = await stripe.subscriptions.list({ status: 'all', limit: 100, ...(po ? { starting_after: po } : {}) });
    const data = s?.data || [];
    ids.push(...data.map((x) => x.id));
    if (!s?.has_more || !data.length) break;
    po = data[data.length - 1].id;
  }
  return ids;
}

/**
 * @param {{ stripe: any, db?: typeof vychoziDb, sync?: typeof syncSubscription, alert?: (a: object[]) => any, runId?: string }} z
 * @returns {Promise<{ runId: string, pocet: number, zmen: number, alerty: object[], log: object[] }>}
 */
export async function reconcile(z) {
  const db = z.db || vychoziDb;
  const sync = z.sync || syncSubscription;
  const runId = z.runId || crypto.randomUUID();
  const log = [];
  const alerty = [];
  const hlas = (a, subId, userId) => {
    alerty.push(a);
    log.push({ run_id: runId, stripe_subscription_id: subId || null, user_id: userId || null, typ: 'alert', kod: a.kod, detail: { popis: a.popis, detail: a.detail } });
  };

  const stripeIds = await vsechnyStripeIds(z.stripe);
  const dbIds = await db.dbSubscriptionIds();
  const ids = [...new Set([...stripeIds, ...dbIds])];

  /** subId → { predtim: membership|null, report } */
  const vysledky = new Map();

  for (const id of ids) {
    const predtim = await db.membershipPodleSubscription(id);
    const sesbirane = [];
    let report;
    try {
      report = await sync(z.stripe, id, { db, alert: (a) => { sesbirane.push(...a); } });
    } catch (err) {
      hlas({ severity: 'critical', kod: 'sync_selhal', popis: 'syncSubscription selhal', detail: `${id} · ${err?.message || err}` }, id, predtim?.user_id);
      continue;
    }
    vysledky.set(id, { predtim, report });
    for (const a of sesbirane) hlas(a, id, report.userId);

    if (report.nenalezeno) {
      if (predtim && ZIVE_V_DB.has(predtim.status)) {
        hlas({ severity: 'critical', kod: 'db_aktivni_stripe_neexistuje', popis: 'Membership má subscription, která ve Stripe neexistuje, ale DB říká active/trial', detail: `${id} · user ${predtim.user_id}` }, id, predtim.user_id);
      }
      continue;
    }

    if (predtim?.stripe_subscription_id === id && ZIVE_V_DB.has(predtim.status) && MRTVE_VE_STRIPE.has(report.stripeStatus)) {
      hlas({ severity: 'critical', kod: 'db_aktivni_stripe_zruseno', popis: `Ve Stripe ${report.stripeStatus}, v DB ${predtim.status} — sync opravil`, detail: `${id} · user ${predtim.user_id}` }, id, predtim.user_id);
    }

    for (const [tabulka, rozdily] of Object.entries(report.zmeny || {})) {
      log.push({ run_id: runId, stripe_subscription_id: id, user_id: report.userId || null, typ: 'zmena', kod: tabulka, detail: rozdily });
    }
  }

  // ------------------------------------------------ poukazy
  const poukazy = await db.uplatnenePoukazy();
  for (const v of poukazy) {
    const m = [...vysledky.values()].find((x) => x.report.userId === v.redeemed_by && !x.report.nenalezeno);
    const clenstvi = m?.predtim || (await db.membershipUzivatele(v.redeemed_by));
    const subId = clenstvi?.stripe_subscription_id || m?.report.subscriptionId || null;
    if (!subId) continue; // poukaz bez předplatného — trial bez karty, nic ke kontrole
    if (!v.stripe_subscription_id) {
      hlas({ severity: 'warning', kod: 'poukaz_bez_subscription', popis: `Poukaz ${v.code} je uplatněný, uživatel má subscription, ale vouchers.stripe_subscription_id chybí`, detail: `${subId} · user ${v.redeemed_by}` }, subId, v.redeemed_by);
    }
    const r = vysledky.get(subId);
    const trialStripe = r?.report?.trialEnd ? Date.parse(r.report.trialEnd) : null;
    const trialDb = r?.predtim?.trial_ends_at ? Date.parse(r.predtim.trial_ends_at) : null;
    if (trialStripe && (!trialDb || Math.abs(trialStripe - trialDb) > HODINA_MS)) {
      hlas({ severity: 'warning', kod: 'poukaz_trial_nesedi', popis: `Poukaz ${v.code}: Stripe trial_end ≠ memberships.trial_ends_at (±1 h)`, detail: `${subId} · Stripe ${r.report.trialEnd} · DB ${r?.predtim?.trial_ends_at ?? '—'}` }, subId, v.redeemed_by);
    }
  }

  const zmen = log.filter((r) => r.typ === 'zmena').length;
  log.push({ run_id: runId, stripe_subscription_id: null, user_id: null, typ: 'souhrn', kod: 'beh', detail: { subscriptions: ids.length, ve_stripe: stripeIds.length, zmen, alertu: alerty.length } });

  const chyba = await db.zapisLog(log);
  if (chyba) console.error('[stripe-reconcile] zápis logu:', chyba.message);
  if (alerty.length) {
    try { await (z.alert || posliAlert)(alerty); } catch (err) { console.error('[stripe-reconcile] alert:', err?.message); }
  }

  return { runId, pocet: ids.length, zmen, alerty, log };
}
