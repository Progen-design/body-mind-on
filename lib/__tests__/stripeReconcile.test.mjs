/**
 * Denní rekonciliace Stripe ↔ DB — každý typ nesrovnalosti → log + alert,
 * druhý běh bez změn ve Stripe nezapíše žádnou změnu. Jen atrapy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reconcile } from '../stripeReconcile.js';
import { syncSubscription } from '../stripeSync.js';
import { vytvorHandler } from '../../api/cron/stripe-reconcile.js';
import { DEN, TED_S, atrapaDb, atrapaStripe, iso, stripeSub } from './atrapaStripeDb.mjs';

const ENV = { STRIPE_PRICE_START_MONTHLY: 'price_start', STRIPE_PRICE_ON_CLUB_MONTHLY: 'price_club' };
const syncEnv = (stripe, id, opts) => syncSubscription(stripe, id, { ...opts, env: ENV });

async function beh(stripe, db) {
  const alerty = [];
  const v = await reconcile({ stripe, db, sync: syncEnv, alert: (a) => { alerty.push(...a); }, runId: 'run-1' });
  return { ...v, poslane: alerty };
}

const kody = (alerty) => alerty.map((a) => a.kod).sort();

test('backfill: prázdné subscriptions se naplní ze Stripe, změny v logu, žádný alert', async () => {
  const stripe = atrapaStripe([stripeSub({ status: 'trialing', trialEnd: TED_S + 4 * DEN })]);
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'START', status: 'trial', trial_ends_at: iso(TED_S + 4 * DEN), stripe_subscription_id: 'sub_1', started_at: iso(TED_S - 10 * DEN), stripe_customer_id: 'cus_1' }] });
  const v = await beh(stripe, db);
  assert.equal(v.pocet, 1);
  assert.equal(db.t.subscriptions.length, 1);
  assert.ok(db.t.log.some((r) => r.typ === 'zmena' && r.kod === 'subscriptions' && r.stripe_subscription_id === 'sub_1'));
  assert.deepEqual(v.poslane, []);
  assert.ok(db.t.log.some((r) => r.typ === 'souhrn'));
});

test('membership se subscription, která ve Stripe neexistuje, a DB říká active → alert', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'START', status: 'active', stripe_subscription_id: 'sub_zmizela' }] });
  const v = await beh(atrapaStripe([]), db);
  assert.deepEqual(kody(v.poslane), ['db_aktivni_stripe_neexistuje']);
  assert.ok(db.t.log.some((r) => r.typ === 'alert' && r.kod === 'db_aktivni_stripe_neexistuje' && r.user_id === 'user-1'));
  assert.equal(db.t.memberships[0].status, 'active', 'rekonciliace sama nic neruší — jen hlásí');
});

test('ve Stripe canceled, v DB active → alert a sync opraví na canceled', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'START', status: 'active', stripe_subscription_id: 'sub_1' }] });
  const v = await beh(atrapaStripe([stripeSub({ status: 'canceled' })]), db);
  assert.deepEqual(kody(v.poslane), ['db_aktivni_stripe_zruseno']);
  assert.equal(db.t.memberships[0].status, 'canceled');
  assert.ok(db.t.log.some((r) => r.typ === 'zmena' && r.kod === 'memberships'));
});

test('Stripe subscription bez uživatele → alert', async () => {
  const db = atrapaDb();
  const v = await beh(atrapaStripe([stripeSub({ id: 'sub_cizi', user: null, customer: 'cus_cizi' })]), db);
  assert.deepEqual(kody(v.poslane), ['stripe_bez_uzivatele']);
  assert.ok(db.t.log.some((r) => r.typ === 'alert' && r.kod === 'stripe_bez_uzivatele' && r.stripe_subscription_id === 'sub_cizi'));
});

test('cena mimo mapu → alert, řádek UNKNOWN', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'START', status: 'active', stripe_subscription_id: 'sub_1' }] });
  const v = await beh(atrapaStripe([stripeSub({ cena: 'price_stara', expected: null })]), db);
  assert.deepEqual(kody(v.poslane), ['stripe_neznama_cena']);
  assert.equal(db.t.subscriptions[0].plan_name, 'UNKNOWN');
});

test('poukaz: trial_end ve Stripe ≠ memberships.trial_ends_at (víc než hodina) → alert, sync srovná', async () => {
  const trialStripe = TED_S + 30 * DEN;
  const db = atrapaDb({
    memberships: [{ user_id: 'user-1', tier: 'START', status: 'trial', trial_ends_at: iso(TED_S + 7 * DEN), stripe_subscription_id: 'sub_1' }],
    vouchers: [{ code: 'ABCD-EFGH-IJKL', redeemed_by: 'user-1', stripe_subscription_id: 'sub_1' }],
  });
  const v = await beh(atrapaStripe([stripeSub({ status: 'trialing', trialEnd: trialStripe, voucher: 'ABCD-EFGH-IJKL' })]), db);
  assert.deepEqual(kody(v.poslane), ['poukaz_trial_nesedi']);
  assert.equal(db.t.memberships[0].trial_ends_at, iso(trialStripe));
});

test('poukaz: rozdíl do hodiny je v pořádku', async () => {
  const trialStripe = TED_S + 30 * DEN;
  const db = atrapaDb({
    memberships: [{ user_id: 'user-1', tier: 'START', status: 'trial', trial_ends_at: iso(trialStripe - 1800), stripe_subscription_id: 'sub_1' }],
    vouchers: [{ code: 'ABCD-EFGH-IJKL', redeemed_by: 'user-1', stripe_subscription_id: 'sub_1' }],
  });
  const v = await beh(atrapaStripe([stripeSub({ status: 'trialing', trialEnd: trialStripe, voucher: 'ABCD-EFGH-IJKL' })]), db);
  assert.deepEqual(v.poslane, []);
});

test('poukaz: uživatel má subscription, vouchers.stripe_subscription_id chybí a metadata kód nenesou → alert', async () => {
  const db = atrapaDb({
    memberships: [{ user_id: 'user-1', tier: 'START', status: 'active', stripe_subscription_id: 'sub_1' }],
    vouchers: [{ code: 'ABCD-EFGH-IJKL', redeemed_by: 'user-1', stripe_subscription_id: null }],
  });
  const v = await beh(atrapaStripe([stripeSub()]), db);
  assert.deepEqual(kody(v.poslane), ['poukaz_bez_subscription']);
});

test('poukaz s kódem v metadatech: první běh vyplní vouchers, druhý už nehlásí nic', async () => {
  const stripe = atrapaStripe([stripeSub({ status: 'trialing', trialEnd: TED_S + 30 * DEN, voucher: 'ABCD-EFGH-IJKL' })]);
  const db = atrapaDb({
    memberships: [{ user_id: 'user-1', tier: 'START', status: 'trial', trial_ends_at: iso(TED_S + 30 * DEN), stripe_subscription_id: 'sub_1' }],
    vouchers: [{ code: 'ABCD-EFGH-IJKL', redeemed_by: 'user-1', stripe_subscription_id: null }],
  });
  await beh(stripe, db);
  assert.equal(db.t.vouchers[0].stripe_subscription_id, 'sub_1');
  const druhy = await beh(stripe, db);
  assert.equal(druhy.zmen, 0);
  assert.deepEqual(druhy.poslane, []);
});

test('idempotence: druhý běh bez změn ve Stripe nezapíše žádnou změnu', async () => {
  const stripe = atrapaStripe([
    stripeSub({ status: 'trialing', trialEnd: TED_S + 4 * DEN }),
    stripeSub({ id: 'sub_2', user: 'user-2', customer: 'cus_2', cena: 'price_club', castka: 149900 }),
    stripeSub({ id: 'sub_3', user: 'user-3', customer: 'cus_3', status: 'canceled' }),
  ]);
  const db = atrapaDb();
  const prvni = await beh(stripe, db);
  assert.ok(prvni.zmen > 0);
  const zapisu = db.zapisy.length;
  const druhy = await beh(stripe, db);
  assert.equal(druhy.zmen, 0);
  assert.equal(db.zapisy.length, zapisu, 'žádný zápis do subscriptions / memberships / vouchers');
  assert.deepEqual(druhy.poslane, []);
});

test('stránkování: projde všechny subscriptions ve Stripe (status all)', async () => {
  const subs = Array.from({ length: 5 }, (_, i) => stripeSub({ id: `sub_${i}`, user: `user-${i}`, customer: `cus_${i}` }));
  const stripe = atrapaStripe(subs, { strana: 2 });
  const db = atrapaDb();
  const v = await beh(stripe, db);
  assert.equal(v.pocet, 5);
  assert.equal(stripe.volani.list.length, 3);
  assert.ok(stripe.volani.list.every((p) => p.status === 'all'));
  assert.equal(stripe.volani.list[1].starting_after, 'sub_1');
});

// ---------------------------------------------------------------- cron endpoint

async function zavolejCron(handler, method, token) {
  const res = { stav: null, telo: null };
  res.status = (s) => { res.stav = s; return res; };
  res.json = (t) => { res.telo = t; return res; };
  const puvodni = console.info; console.info = () => {};
  try { await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {} }, res); } finally { console.info = puvodni; }
  return res;
}

test('cron: GET jen s CRON_SECRET, POST i s ADMIN_TOKEN; bez tokenu 401', async () => {
  process.env.CRON_SECRET = 'cron-tajne';
  process.env.ADMIN_TOKEN = 'admin-tajne';
  process.env.STRIPE_SECRET_KEY = 'sk_test_atrapa';
  const beh = [];
  const handler = vytvorHandler({
    stripe: () => ({}),
    reconcile: async () => { beh.push(1); return { runId: 'r', pocet: 2, zmen: 1, alerty: [{ kod: 'x' }] }; },
  });
  assert.equal((await zavolejCron(handler, 'GET')).stav, 401);
  assert.equal((await zavolejCron(handler, 'GET', 'admin-tajne')).stav, 401, 'admin token jen pro ruční POST');
  const g = await zavolejCron(handler, 'GET', 'cron-tajne');
  assert.equal(g.stav, 200);
  assert.deepEqual({ zmen: g.telo.zmen, alertu: g.telo.alertu }, { zmen: 1, alertu: 1 });
  assert.equal((await zavolejCron(handler, 'POST', 'admin-tajne')).stav, 200);
  assert.equal(beh.length, 2);
});
