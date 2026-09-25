/**
 * Naplánovaný downgrade (subscription schedule) nesmí zablokovat zrušení
 * předplatného ani odstoupení od smlouvy. Stripe u subscription řízené
 * schedule odmítne update({ cancel_at_period_end }) — proto se schedule
 * nejdřív uvolní. Jen atrapa Stripe (LIVE klíče se nevolají).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.STRIPE_SECRET_KEY = 'sk_test_atrapa';

const { vytvorHandler: zruseni } = await import('../../api/subscription/cancel.js');
const { vytvorHandler: odstoupeni } = await import('../../api/subscription/withdraw.js');

const DEN = 86_400;
const TED_S = Math.floor(Date.parse('2026-09-25T10:00:00Z') / 1000);

/** Atrapa Stripe, která se chová jako skutečný: se schedule update/cancel odmítne. */
function atrapaStripe({ schedule = 'sub_sched_1' } = {}) {
  const poradi = [];
  let sched = schedule;
  const managed = () => Object.assign(new Error('The subscription is managed by the subscription schedule'), { statusCode: 400 });
  const sub = () => ({
    id: 'sub_1', status: 'active', schedule: sched, cancel_at_period_end: false,
    items: { data: [{ id: 'si_1', price: { id: 'price_club' }, current_period_start: TED_S - 3 * DEN, current_period_end: TED_S + 27 * DEN }] },
  });
  return {
    poradi,
    klient: {
      subscriptions: {
        async retrieve() { poradi.push('retrieve'); return sub(); },
        async update(id, p) {
          poradi.push(`update:${JSON.stringify(p)}`);
          if (sched && 'cancel_at_period_end' in p) throw managed();
          return { ...sub(), cancel_at_period_end: p.cancel_at_period_end === true };
        },
        async cancel() { poradi.push('cancel'); if (sched) throw managed(); return { ...sub(), status: 'canceled' }; },
      },
      subscriptionSchedules: {
        async release(id) { poradi.push(`release:${id}`); sched = null; return {}; },
      },
      invoices: {
        async list() {
          return { data: [{ id: 'in_1', status: 'paid', amount_paid: 149900, created: TED_S - 3 * DEN, status_transitions: { paid_at: TED_S - 3 * DEN }, lines: { data: [{ period: { start: TED_S - 3 * DEN, end: TED_S + 27 * DEN } }] } }] };
        },
      },
      invoicePayments: { async list() { return { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_1' } }] }; } },
      refunds: { async create() { poradi.push('refund'); return { id: 're_1' }; } },
    },
  };
}

async function zavolej(handler, body = {}) {
  const res = { stav: null, telo: null };
  res.status = (s) => { res.stav = s; return res; };
  res.json = (t) => { res.telo = t; return res; };
  const puvodni = [console.info, console.error];
  console.info = () => {}; console.error = () => {};
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res);
  } finally {
    [console.info, console.error] = puvodni;
  }
  return res;
}

const zrus = (stripe) => zruseni({
  overUzivatele: async () => ({ id: 'user-1' }),
  nactiClenstvi: async () => ({ data: { status: 'active', tier: 'ON_CLUB', stripe_subscription_id: 'sub_1' }, error: null }),
  stripe: () => stripe.klient,
  sync: async (_s, id) => { stripe.poradi.push(`sync:${id}`); return {}; },
});

test('zrušení s naplánovaným downgradem: nejdřív release schedule, pak cancel_at_period_end', async () => {
  const stripe = atrapaStripe();
  const res = await zavolej(zrus(stripe));
  assert.equal(res.stav, 200);
  assert.equal(res.telo.zruseno, true);
  assert.deepEqual(stripe.poradi, ['retrieve', 'release:sub_sched_1', 'update:{"cancel_at_period_end":true}', 'sync:sub_1']);
});

test('zrušení bez schedule: žádný release', async () => {
  const stripe = atrapaStripe({ schedule: null });
  const res = await zavolej(zrus(stripe));
  assert.equal(res.stav, 200);
  assert.ok(!stripe.poradi.some((k) => k.startsWith('release')));
});

test('obnovení (obnovit: true) se schedule nedotýká', async () => {
  const stripe = atrapaStripe({ schedule: null });
  const res = await zavolej(zrus(stripe), { obnovit: true });
  assert.equal(res.stav, 200);
  assert.deepEqual(stripe.poradi, ['update:{"cancel_at_period_end":false}', 'sync:sub_1']);
});

test('odstoupení s naplánovaným downgradem: refund → release → okamžité zrušení', async () => {
  const stripe = atrapaStripe();
  const zapisy = [];
  const handler = odstoupeni({
    overUzivatele: async () => ({ id: 'user-1', email: 'jan@seznam.cz', jmeno: 'Jan' }),
    nactiClenstvi: async () => ({ status: 'active', tier: 'ON_CLUB', stripe_subscription_id: 'sub_1' }),
    tabulkaDostupna: async () => true,
    najdiOdstoupeni: async () => null,
    zapisOdstoupeni: async (r) => { zapisy.push(r); return { error: null }; },
    sync: async () => ({}),
    posliEmail: async () => ({ ok: true }),
    stripe: () => stripe.klient,
    now: () => TED_S * 1000,
  });
  const res = await zavolej(handler);
  assert.equal(res.stav, 200);
  assert.deepEqual(stripe.poradi.filter((k) => k !== 'retrieve'), ['refund', 'release:sub_sched_1', 'cancel']);
  assert.equal(zapisy.length, 1);
});
