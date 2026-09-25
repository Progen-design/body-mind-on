/**
 * syncSubscription — Stripe = zdroj pravdy, DB = zrcadlo.
 * Jen atrapa Stripe a DB (LIVE klíče se nikdy nevolají).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { radekSubscriptions, syncSubscription } from '../stripeSync.js';
import { predplatneProUi } from '../predplatneProUi.js';
import { DEN, TED_S, atrapaDb, atrapaStripe, iso, stripeSub } from './atrapaStripeDb.mjs';

const ENV = { STRIPE_PRICE_START_MONTHLY: 'price_start', STRIPE_PRICE_ON_CLUB_MONTHLY: 'price_club' };

async function sync(stripe, db, id = 'sub_1', extra = {}) {
  const alerty = [];
  const report = await syncSubscription(stripe, id, { db, env: ENV, alert: (a) => { alerty.push(...a); }, ...extra });
  return { report, alerty };
}

test('čerstvé načtení ze Stripe s expand items.data.price', async () => {
  const stripe = atrapaStripe([stripeSub()]);
  await sync(stripe, atrapaDb());
  assert.deepEqual(stripe.volani.retrieve[0], { id: 'sub_1', opt: { expand: ['items.data.price'] } });
});

test('trialing: subscriptions (START, 599 Kč, trial_end) + membership trial s trial_ends_at ze Stripe', async () => {
  const trialEnd = TED_S + 4 * DEN;
  const db = atrapaDb();
  const { report } = await sync(atrapaStripe([stripeSub({ status: 'trialing', trialEnd })]), db);
  const s = db.t.subscriptions[0];
  assert.equal(s.plan_name, 'START');
  assert.equal(s.price_czk, 599);
  assert.equal(s.billing_cycle, 'month');
  assert.equal(s.status, 'trialing');
  assert.equal(s.trial_end, iso(trialEnd));
  assert.equal(s.current_period_end, iso(TED_S + 20 * DEN), 'období z items.data[0] (API basil)');
  assert.equal(s.user_id, 'user-1');
  assert.equal(s.stripe_price_id, 'price_start');
  const m = db.t.memberships[0];
  assert.deepEqual(
    { tier: m.tier, status: m.status, trial_ends_at: m.trial_ends_at, sub: m.stripe_subscription_id, cus: m.stripe_customer_id },
    { tier: 'START', status: 'trial', trial_ends_at: iso(trialEnd), sub: 'sub_1', cus: 'cus_1' },
  );
  assert.equal(m.started_at, iso(TED_S - 10 * DEN), 'started_at ze Stripe start_date, ne „teď"');
  assert.deepEqual(Object.keys(report.zmeny).sort(), ['memberships', 'subscriptions']);
});

test('active ON CLUB se skutečnou cenou: membership active, trial_ends_at vynulovaný', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'START', status: 'trial', trial_ends_at: iso(TED_S), stripe_subscription_id: 'sub_1' }] });
  await sync(atrapaStripe([stripeSub({ cena: 'price_club', castka: 149900 })]), db);
  assert.equal(db.t.subscriptions[0].price_czk, 1499);
  assert.equal(db.t.subscriptions[0].plan_name, 'ON_CLUB');
  assert.equal(db.t.memberships[0].tier, 'ON_CLUB');
  assert.equal(db.t.memberships[0].status, 'active');
  assert.equal(db.t.memberships[0].trial_ends_at, null);
});

test('canceled: subscriptions status canceled, membership canceled, subscription ID zůstane', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'START', status: 'active', stripe_subscription_id: 'sub_1' }] });
  await sync(atrapaStripe([stripeSub({ status: 'canceled' })]), db);
  assert.equal(db.t.subscriptions[0].status, 'canceled');
  assert.equal(db.t.memberships[0].status, 'canceled');
  assert.equal(db.t.memberships[0].stripe_subscription_id, 'sub_1');
});

test('cancel_at_period_end: zapíše se příznak i cancel_at, membership zůstává active', async () => {
  const db = atrapaDb();
  await sync(atrapaStripe([stripeSub({ cancelAtPeriodEnd: true, cancelAt: TED_S + 20 * DEN })]), db);
  assert.equal(db.t.subscriptions[0].cancel_at_period_end, true);
  assert.equal(db.t.subscriptions[0].cancel_at, iso(TED_S + 20 * DEN));
  assert.equal(db.t.memberships[0].status, 'active');
  assert.equal(predplatneProUi(db.t.subscriptions, db.t.memberships[0]).konci_k, iso(TED_S + 20 * DEN));
});

test('neznámá cena: řádek UNKNOWN se zapíše, membership tier zůstane, alert', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'START', status: 'active', stripe_subscription_id: 'sub_1' }] });
  const { report, alerty } = await sync(atrapaStripe([stripeSub({ cena: 'price_zahada', castka: 99900, expected: null })]), db);
  assert.equal(db.t.subscriptions[0].plan_name, 'UNKNOWN');
  assert.equal(db.t.subscriptions[0].price_czk, 999);
  assert.equal(db.t.subscriptions[0].stripe_price_id, 'price_zahada');
  assert.equal(db.t.memberships[0].tier, 'START');
  assert.ok(!db.zapisy.some((z) => z.tabulka === 'memberships'), 'membership se nemění');
  assert.equal(report.tier, null);
  assert.deepEqual(alerty.map((a) => a.kod), ['stripe_neznama_cena']);
  assert.match(alerty[0].detail, /price_zahada/);
});

test('poukaz: redeemed_by sedí → vouchers.stripe_subscription_id se vyplní, voucher_code v subscriptions', async () => {
  const db = atrapaDb({ vouchers: [{ code: 'ABCD-EFGH-IJKL', redeemed_by: 'user-1', stripe_subscription_id: null }] });
  const { alerty } = await sync(atrapaStripe([stripeSub({ status: 'trialing', trialEnd: TED_S + 30 * DEN, voucher: 'ABCD-EFGH-IJKL' })]), db);
  assert.equal(db.t.vouchers[0].stripe_subscription_id, 'sub_1');
  assert.equal(db.t.subscriptions[0].voucher_code, 'ABCD-EFGH-IJKL');
  assert.deepEqual(alerty, []);
});

test('poukaz uplatnil jiný uživatel → alert a nic se nepřepíše', async () => {
  const db = atrapaDb({ vouchers: [{ code: 'ABCD-EFGH-IJKL', redeemed_by: 'user-2', stripe_subscription_id: null }] });
  const { alerty } = await sync(atrapaStripe([stripeSub({ voucher: 'ABCD-EFGH-IJKL' })]), db);
  assert.equal(db.t.vouchers[0].stripe_subscription_id, null);
  assert.ok(!db.zapisy.some((z) => z.tabulka === 'vouchers'));
  assert.deepEqual(alerty.map((a) => a.kod), ['poukaz_jiny_uzivatel']);
});

test('idempotence: druhý sync beze změny ve Stripe nic nezapíše', async () => {
  const stripe = atrapaStripe([stripeSub({ status: 'trialing', trialEnd: TED_S + 4 * DEN, voucher: 'ABCD-EFGH-IJKL' })]);
  const db = atrapaDb({ vouchers: [{ code: 'ABCD-EFGH-IJKL', redeemed_by: 'user-1', stripe_subscription_id: null }] });
  await sync(stripe, db);
  const zapisu = db.zapisy.length;
  const { report } = await sync(stripe, db);
  assert.deepEqual(report.zmeny, {});
  assert.equal(db.zapisy.length, zapisu);
});

test('subscription bez uživatele (metadata ani zákazník) → alert, řádek s user_id null, membership nic', async () => {
  const db = atrapaDb();
  const { alerty } = await sync(atrapaStripe([stripeSub({ user: null, customer: 'cus_cizi' })]), db);
  assert.deepEqual(alerty.map((a) => a.kod), ['stripe_bez_uzivatele']);
  assert.equal(db.t.subscriptions[0].user_id, null);
  assert.equal(db.t.memberships.length, 0);
});

test('uživatel dohledán přes zákazníka, když metadata.user_id chybí; hint z Checkoutu má přednost', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-9', tier: 'START', status: 'trial', stripe_customer_id: 'cus_1' }] });
  const { report } = await sync(atrapaStripe([stripeSub({ user: null })]), db);
  assert.equal(report.userId, 'user-9');
  const db2 = atrapaDb();
  const { report: r2 } = await sync(atrapaStripe([stripeSub({ user: null })]), db2, 'sub_1', { userIdHint: 'user-7' });
  assert.equal(r2.userId, 'user-7');
});

test('stará zrušená subscription nepřepíše membership, který patří nové', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'ON_CLUB', status: 'active', stripe_subscription_id: 'sub_nova' }] });
  await sync(atrapaStripe([stripeSub({ id: 'sub_stara', status: 'canceled' })]), db, 'sub_stara');
  assert.equal(db.t.memberships[0].status, 'active');
  assert.equal(db.t.memberships[0].stripe_subscription_id, 'sub_nova');
  assert.equal(db.t.subscriptions[0].status, 'canceled', 'do subscriptions se zapíše i stará');
});

test('subscription ve Stripe neexistuje → nenalezeno, nic se nezapíše', async () => {
  const db = atrapaDb();
  const { report } = await sync(atrapaStripe([]), db, 'sub_zmizela');
  assert.equal(report.nenalezeno, true);
  assert.equal(db.zapisy.length, 0);
});

test('tier z ceny ≠ metadata.expected_tier → alert, membership se nemění', async () => {
  const db = atrapaDb({ memberships: [{ user_id: 'user-1', tier: 'START', status: 'active', stripe_subscription_id: 'sub_1' }] });
  const { alerty } = await sync(atrapaStripe([stripeSub({ cena: 'price_club', castka: 149900, expected: 'START' })]), db);
  assert.deepEqual(alerty.map((a) => a.kod), ['stripe_tier_nesedi']);
  assert.equal(db.t.memberships[0].tier, 'START');
});

test('řádek subscriptions: čistá funkce', () => {
  const { radek, tier } = radekSubscriptions(stripeSub({ cena: 'price_club', castka: 149900, cancelAtPeriodEnd: true }), 'user-1', ENV);
  assert.equal(tier, 'ON_CLUB');
  assert.equal(radek.price_czk, 1499);
  assert.equal(radek.cancel_at_period_end, true);
  assert.equal(radek.current_period_start, iso(TED_S - 10 * DEN));
});

test('predplatneProUi: řádek členství má přednost, jinak nejnovější živý; mrtvý cizí se ignoruje', () => {
  const radky = [
    { stripe_subscription_id: 'sub_stara', status: 'canceled', plan_name: 'START', price_czk: 599 },
    { stripe_subscription_id: 'sub_1', status: 'trialing', plan_name: 'START', price_czk: 599, trial_end: iso(TED_S + 4 * DEN), current_period_end: iso(TED_S + 4 * DEN), voucher_code: 'ABCD-EFGH-IJKL' },
  ];
  const p = predplatneProUi(radky, { stripe_subscription_id: 'sub_1' });
  assert.deepEqual(p, { plan: 'START', cena_kc: 599, stav: 'trialing', trial_do: iso(TED_S + 4 * DEN), dalsi_platba: iso(TED_S + 4 * DEN), konci_k: null, poukaz: true });
  assert.equal(predplatneProUi([radky[0]], null), null);
  assert.equal(predplatneProUi(radky, null).stav, 'trialing');
});
