/**
 * Odstoupení od smlouvy do 14 dnů — POST/GET /api/subscription/withdraw.
 *
 * JEN ATRAPA STRIPE. V produkci běží LIVE klíče; refund ani zrušení se
 * nikdy nezkouší naostro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { vytvorHandler } from '../../api/subscription/withdraw.js';
import {
  narokNaOdstoupeni,
  prvniPlacenaFaktura,
  subscriptionIdFaktury,
  vypocetVratky,
} from '../odstoupeniOdSmlouvy.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_atrapa';

const DEN = 86_400_000;
const START = Date.parse('2026-09-25T10:00:00Z'); // první platba = začátek období
const OBDOBI_30 = { startMs: START, konecMs: START + 30 * DEN };

// ---------------------------------------------------------------- výpočet

test('vratka: den 0 → celá částka', () => {
  assert.deepEqual(vypocetVratky({ zaplacenoKc: 599, obdobi: OBDOBI_30, nowMs: START + 3 * 3600e3 }), { vratkaKc: 599, dnyVyuzito: 0, dnyObdobi: 30 });
});

test('vratka: den 7 → 599 − 7/30 × 599 = 459,23 → 459 Kč (dolů)', () => {
  assert.deepEqual(vypocetVratky({ zaplacenoKc: 599, obdobi: OBDOBI_30, nowMs: START + 7 * DEN + 3600e3 }), { vratkaKc: 459, dnyVyuzito: 7, dnyObdobi: 30 });
});

test('vratka: den 14 → 599 − 14/30 × 599 = 319,47 → 319 Kč', () => {
  assert.deepEqual(vypocetVratky({ zaplacenoKc: 599, obdobi: OBDOBI_30, nowMs: START + 14 * DEN }), { vratkaKc: 319, dnyVyuzito: 14, dnyObdobi: 30 });
});

test('vratka se zaokrouhluje DOLŮ, ne matematicky (31 dní, den 10: 405,77 → 405)', () => {
  const obdobi31 = { startMs: START, konecMs: START + 31 * DEN };
  assert.equal(vypocetVratky({ zaplacenoKc: 599, obdobi: obdobi31, nowMs: START + 10 * DEN }).vratkaKc, 405);
});

test('vratka nikdy záporná, dny se ořežou na délku období', () => {
  const v = vypocetVratky({ zaplacenoKc: 599, obdobi: OBDOBI_30, nowMs: START + 45 * DEN });
  assert.equal(v.vratkaKc, 0);
  assert.equal(v.dnyVyuzito, 30);
  assert.equal(vypocetVratky({ zaplacenoKc: 599, obdobi: OBDOBI_30, nowMs: START - DEN }).vratkaKc, 599);
});

// ---------------------------------------------------------------- nárok

const faktura = (extra = {}) => ({
  id: 'in_1', status: 'paid', amount_paid: 59900, billing_reason: 'subscription_cycle', created: START / 1000,
  status_transitions: { paid_at: START / 1000 },
  lines: { data: [{ period: { start: START / 1000, end: (START + 30 * DEN) / 1000 } }] },
  parent: { subscription_details: { subscription: 'sub_1' } },
  ...extra,
});

test('nárok: do 14 dnů od první platby ano, po lhůtě / bez platby / zrušené ne', () => {
  const sub = { status: 'active' };
  assert.deepEqual(narokNaOdstoupeni({ subscription: sub, prvniFaktura: faktura(), nowMs: START + 14 * DEN }), { narok: true });
  assert.deepEqual(narokNaOdstoupeni({ subscription: sub, prvniFaktura: faktura(), nowMs: START + 14 * DEN + 1 }), { narok: false, duvod: 'po_lhute' });
  assert.deepEqual(narokNaOdstoupeni({ subscription: sub, prvniFaktura: null, nowMs: START }), { narok: false, duvod: 'bez_platby' });
  assert.deepEqual(narokNaOdstoupeni({ subscription: { status: 'canceled' }, prvniFaktura: faktura(), nowMs: START }), { narok: false, duvod: 'zruseno' });
  assert.deepEqual(narokNaOdstoupeni({ subscription: null, prvniFaktura: faktura(), nowMs: START }), { narok: false, duvod: 'bez_predplatneho' });
});

test('první placená faktura: trialová za 0 Kč se nepočítá, bere se nejstarší zaplacená', () => {
  const trial = faktura({ id: 'in_0', amount_paid: 0, status_transitions: { paid_at: START / 1000 - 7 * 86400 } });
  const druha = faktura({ id: 'in_2', status_transitions: { paid_at: START / 1000 + 30 * 86400 } });
  assert.equal(prvniPlacenaFaktura([druha, trial, faktura()]).id, 'in_1');
  assert.equal(prvniPlacenaFaktura([trial]), null);
  assert.equal(subscriptionIdFaktury(faktura()), 'sub_1');
  assert.equal(subscriptionIdFaktury({ subscription: 'sub_stary' }), 'sub_stary');
});

// ---------------------------------------------------------------- endpoint

function atrapaStripe({ faktury = [faktura()], subStatus = 'active', chybaRefund = null, chybaCancel = null } = {}) {
  const z = { refundy: [], zruseni: [], klice: [] };
  const klient = {
    subscriptions: {
      async retrieve(id) { return { id, status: subStatus, items: { data: [{ current_period_start: START / 1000, current_period_end: (START + 30 * DEN) / 1000 }] } }; },
      async cancel(id, _p, opt) { z.klice.push(opt?.idempotencyKey); if (chybaCancel) throw chybaCancel; z.zruseni.push(id); return { id, status: 'canceled' }; },
    },
    invoices: { async list() { return { data: faktury }; } },
    invoicePayments: { async list() { return { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_1' } }] }; } },
    refunds: {
      async create(p, opt) { z.klice.push(opt?.idempotencyKey); if (chybaRefund) throw chybaRefund; z.refundy.push(p); return { id: 're_1', amount: p.amount }; },
    },
  };
  return { z, klient };
}

function sestav({ stripe, nowMs = START + 7 * DEN + 3600e3, clenstvi = { status: 'active', tier: 'START', stripe_subscription_id: 'sub_1' }, tabulka = true } = {}) {
  const db = { odstoupeni: new Map(), clenstvi: { ...clenstvi }, emaily: [] };
  const handler = vytvorHandler({
    overUzivatele: async () => ({ id: 'user-1', email: 'jan@seznam.cz', jmeno: 'Jan Novák' }),
    nactiClenstvi: async () => db.clenstvi,
    tabulkaDostupna: async () => tabulka,
    najdiOdstoupeni: async (sid) => db.odstoupeni.get(sid) || null,
    zapisOdstoupeni: async (radek) => {
      if (db.odstoupeni.has(radek.subscription_id)) return { error: { code: '23505', message: 'duplicate' } };
      db.odstoupeni.set(radek.subscription_id, radek);
      return { error: null };
    },
    // syncSubscription po okamžitém zrušení zapíše membership canceled (tady atrapa).
    sync: async () => { db.clenstvi.status = 'canceled'; return {}; },
    posliEmail: async (to, obsah) => { db.emaily.push({ to, obsah }); return { ok: true }; },
    stripe: () => stripe.klient,
    now: () => nowMs,
  });
  return { handler, db };
}

async function zavolej(handler, method = 'POST') {
  const res = { stav: null, telo: null };
  res.status = (s) => { res.stav = s; return res; };
  res.json = (t) => { res.telo = t; return res; };
  const puvodni = [console.info, console.error];
  console.info = () => {};
  console.error = () => {};
  try {
    await handler({ method, headers: { authorization: 'Bearer t' }, body: {} }, res);
  } finally {
    [console.info, console.error] = puvodni;
  }
  return res;
}

test('POST s nárokem (den 7): refund 459 Kč → zrušení → zápis → e-mail, v tomto pořadí', async () => {
  const stripe = atrapaStripe();
  const { handler, db } = sestav({ stripe });
  const res = await zavolej(handler);
  assert.equal(res.stav, 200);
  assert.equal(res.telo.vratka_kc, 459);
  assert.equal(stripe.z.refundy.length, 1);
  assert.equal(stripe.z.refundy[0].payment_intent, 'pi_1');
  assert.equal(stripe.z.refundy[0].amount, 45900, 'Stripe chce haléře');
  assert.deepEqual(stripe.z.zruseni, ['sub_1']);
  assert.deepEqual(stripe.z.klice, ['odstoupeni-refund-in_1', 'odstoupeni-cancel-sub_1']);
  assert.equal(db.clenstvi.status, 'canceled');
  assert.deepEqual(db.odstoupeni.get('sub_1'), { user_id: 'user-1', subscription_id: 'sub_1', invoice_id: 'in_1', paid_czk: 599, refund_czk: 459, days_used: 7 });
  assert.equal(db.emaily.length, 1);
  assert.equal(db.emaily[0].obsah.subject, 'Odstoupení od smlouvy přijato');
  assert.match(db.emaily[0].obsah.text, /Vrácená částka: 459 Kč/);
  assert.match(db.emaily[0].obsah.text, /5–10 pracovních dní/);
  assert.match(db.emaily[0].obsah.text, /Přijato: 2\. 10\. 2026 \d\d:\d\d/);
  assert.match(db.emaily[0].obsah.text, /Tarif: START/);
});

test('POST po lhůtě (den 15) → 409 s důvodem, Stripe se nic neprovede', async () => {
  const stripe = atrapaStripe();
  const { handler, db } = sestav({ stripe, nowMs: START + 15 * DEN });
  const res = await zavolej(handler);
  assert.equal(res.stav, 409);
  assert.equal(res.telo.duvod, 'po_lhute');
  assert.match(res.telo.error, /Lhůta 14 dnů/);
  assert.equal(stripe.z.refundy.length + stripe.z.zruseni.length, 0);
  assert.equal(db.odstoupeni.size, 0);
});

test('POST v trialu (bez placené faktury) → 409 bez_platby', async () => {
  const stripe = atrapaStripe({ faktury: [faktura({ amount_paid: 0 })] });
  const { handler } = sestav({ stripe });
  const res = await zavolej(handler);
  assert.equal(res.stav, 409);
  assert.equal(res.telo.duvod, 'bez_platby');
  const trial = sestav({ stripe, clenstvi: { status: 'trial', tier: 'START', stripe_subscription_id: 'sub_1' } });
  assert.equal((await zavolej(trial.handler)).telo.duvod, 'bez_platby');
});

test('POST bez subscription → 409; mrtvá subscription ve Stripe → 409 zruseno', async () => {
  const bez = sestav({ stripe: atrapaStripe(), clenstvi: { status: 'active', tier: 'START', stripe_subscription_id: null } });
  assert.equal((await zavolej(bez.handler)).stav, 409);
  const mrtva = sestav({ stripe: atrapaStripe({ subStatus: 'canceled' }) });
  const res = await zavolej(mrtva.handler);
  assert.equal(res.stav, 409);
  assert.equal(res.telo.duvod, 'zruseno');
});

test('selhání refundu → 502, subscription se NEZRUŠÍ a nic se nezapíše', async () => {
  const stripe = atrapaStripe({ chybaRefund: new Error('card_declined') });
  const { handler, db } = sestav({ stripe });
  const res = await zavolej(handler);
  assert.equal(res.stav, 502);
  assert.equal(stripe.z.zruseni.length, 0);
  assert.equal(db.odstoupeni.size, 0);
  assert.equal(db.clenstvi.status, 'active');
  assert.equal(db.emaily.length, 0);
});

test('selhání zrušení po refundu → 502 a nic se nezapíše', async () => {
  const stripe = atrapaStripe({ chybaCancel: new Error('api down') });
  const { handler, db } = sestav({ stripe });
  const res = await zavolej(handler);
  assert.equal(res.stav, 502);
  assert.equal(db.odstoupeni.size, 0);
  assert.equal(db.clenstvi.status, 'active');
  assert.equal(db.emaily.length, 0);
});

test('dvojí klik: druhý POST vrátí první výsledek, žádný další refund ani e-mail', async () => {
  const stripe = atrapaStripe();
  const { handler, db } = sestav({ stripe });
  const prvni = await zavolej(handler);
  const druhy = await zavolej(handler);
  assert.equal(prvni.stav, 200);
  assert.equal(druhy.stav, 200);
  assert.equal(druhy.telo.odstoupeno, true);
  assert.equal(druhy.telo.vratka_kc, 459);
  assert.equal(stripe.z.refundy.length, 1);
  assert.equal(stripe.z.zruseni.length, 1);
  assert.equal(db.emaily.length, 1);
});

test('dvojí klik souběžně: oba projdou kontrolou, e-mail odejde jen jednou (23505)', async () => {
  const stripe = atrapaStripe();
  const { handler, db } = sestav({ stripe });
  const [a, b] = await Promise.all([zavolej(handler), zavolej(handler)]);
  assert.equal(a.stav, 200);
  assert.equal(b.stav, 200);
  // Stripe dvojí refund zastaví idempotency key — oba pokusy nesou stejný.
  assert.ok(stripe.z.klice.filter((k) => k === 'odstoupeni-refund-in_1').length >= 1);
  assert.ok(stripe.z.klice.every((k) => k === 'odstoupeni-refund-in_1' || k === 'odstoupeni-cancel-sub_1'));
  assert.equal(db.odstoupeni.size, 1);
  assert.equal(db.emaily.length, 1);
});

test('den 0: vrací se celých 599 Kč', async () => {
  const stripe = atrapaStripe();
  const { handler } = sestav({ stripe, nowMs: START + 3600e3 });
  const res = await zavolej(handler);
  assert.equal(res.telo.vratka_kc, 599);
  assert.equal(stripe.z.refundy[0].amount, 59900);
});

test('GET: náhled pro profil (tarif, datum první platby, vratka) bez zásahu do Stripe', async () => {
  const stripe = atrapaStripe();
  const { handler } = sestav({ stripe });
  const res = await zavolej(handler, 'GET');
  assert.equal(res.stav, 200);
  assert.equal(res.telo.narok, true);
  assert.equal(res.telo.tarif, 'START');
  assert.equal(res.telo.datum_prvni_platby, '25. 9. 2026');
  assert.equal(res.telo.vratka_kc, 459);
  assert.equal(stripe.z.refundy.length + stripe.z.zruseni.length, 0);
});

test('GET po lhůtě → narok false (tlačítko se neukáže)', async () => {
  const { handler } = sestav({ stripe: atrapaStripe(), nowMs: START + 20 * DEN });
  const res = await zavolej(handler, 'GET');
  assert.deepEqual(res.telo, { narok: false, duvod: 'po_lhute' });
});

test('tabulka contract_withdrawals ještě není (migrace nenasazená) → GET nedostupné, POST 503 bez Stripe', async () => {
  const stripe = atrapaStripe();
  const { handler } = sestav({ stripe, tabulka: false });
  assert.deepEqual((await zavolej(handler, 'GET')).telo, { narok: false, duvod: 'nedostupne' });
  const res = await zavolej(handler);
  assert.equal(res.stav, 503);
  assert.equal(stripe.z.refundy.length + stripe.z.zruseni.length, 0);
});
