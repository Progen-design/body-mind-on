/**
 * POST /api/stripe/create-checkout-session — druhé předplatné se nezakládá.
 *
 * Po Checkoutu během trialu zůstával status 'trial' a UI dál nabízelo
 * „Odemknout". Druhé kliknutí vytvořilo druhý Checkout → druhé předplatné.
 * Teď: členství se `stripe_subscription_id`, jehož subscription ve Stripe
 * žije → 409 a žádná nová session.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HLASKA_PREDPLATNE_BEZI, vytvorHandler } from '../../api/stripe/create-checkout-session.js';
import { jePredplatneZive } from '../stripeSubscriptionStatus.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_atrapa';
process.env.STRIPE_PRICE_START_MONTHLY = 'price_start_test';
process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';

/** Atrapa Stripe: subscriptions.retrieve + checkout.sessions.create. */
function atrapaStripe({ subscription = null, chybaRetrieve = null } = {}) {
  const zaznam = { retrieve: [], sessions: [] };
  const klient = {
    subscriptions: {
      async retrieve(id) {
        zaznam.retrieve.push(id);
        if (chybaRetrieve) throw chybaRetrieve;
        return subscription;
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          zaznam.sessions.push(params);
          return { url: 'https://checkout.stripe.test/s/1' };
        },
      },
    },
  };
  return { zaznam, klient };
}

function sestav({ clenstvi = null, stripe }) {
  return vytvorHandler({
    overUzivatele: async () => ({ id: 'user-1', email: 'jan@example.cz' }),
    nactiClenstvi: async () => clenstvi,
    poukazUzivatele: async () => null,
    stripe: () => stripe.klient,
  });
}

async function posli(handler, body = { tier: 'START' }) {
  const res = { stav: null, telo: null };
  res.status = (s) => { res.stav = s; return res; };
  res.json = (t) => { res.telo = t; return res; };
  const puvodni = [console.info, console.error];
  console.info = () => {};
  console.error = () => {};
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res);
  } finally {
    [console.info, console.error] = puvodni;
  }
  return res;
}

const TRIAL_S_KARTOU = {
  status: 'trial',
  tier: 'START',
  trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  stripe_subscription_id: 'sub_123',
};

test('trial s kartou (Stripe trialing) → 409 „Předplatné už máš aktivní.", žádný nový Checkout', async () => {
  const stripe = atrapaStripe({ subscription: { id: 'sub_123', status: 'trialing' } });
  const res = await posli(sestav({ clenstvi: TRIAL_S_KARTOU, stripe }));

  assert.equal(res.stav, 409);
  assert.deepEqual(res.telo, { error: 'Předplatné už máš aktivní.' });
  assert.equal(HLASKA_PREDPLATNE_BEZI, 'Předplatné už máš aktivní.');
  assert.deepEqual(stripe.zaznam.retrieve, ['sub_123']);
  assert.equal(stripe.zaznam.sessions.length, 0, 'druhý Checkout se nesmí vytvořit');
});

test('aktivní, past_due i unpaid předplatné → 409', async () => {
  for (const status of ['active', 'past_due', 'unpaid', 'incomplete']) {
    const stripe = atrapaStripe({ subscription: { id: 'sub_123', status } });
    const res = await posli(sestav({ clenstvi: { ...TRIAL_S_KARTOU, status: 'active' }, stripe }));
    assert.equal(res.stav, 409, status);
    assert.equal(stripe.zaznam.sessions.length, 0, status);
  }
});

test('zrušené předplatné ve Stripe → nový Checkout projde', async () => {
  const stripe = atrapaStripe({ subscription: { id: 'sub_123', status: 'canceled' } });
  const res = await posli(sestav({ clenstvi: { ...TRIAL_S_KARTOU, status: 'canceled', trial_ends_at: null }, stripe }));
  assert.equal(res.stav, 200);
  assert.equal(res.telo.url, 'https://checkout.stripe.test/s/1');
  assert.equal(stripe.zaznam.sessions.length, 1);
});

test('subscription ve Stripe neexistuje (resource_missing) → Checkout projde', async () => {
  const chyba = Object.assign(new Error('No such subscription'), { code: 'resource_missing', statusCode: 404 });
  const stripe = atrapaStripe({ chybaRetrieve: chyba });
  const res = await posli(sestav({ clenstvi: TRIAL_S_KARTOU, stripe }));
  assert.equal(res.stav, 200);
});

test('Stripe neodpoví (jiná chyba) → 502, radši nic nezaložit', async () => {
  const chyba = Object.assign(new Error('API unavailable'), { statusCode: 500 });
  const stripe = atrapaStripe({ chybaRetrieve: chyba });
  const res = await posli(sestav({ clenstvi: TRIAL_S_KARTOU, stripe }));
  assert.equal(res.stav, 502);
  assert.equal(stripe.zaznam.sessions.length, 0);
});

test('trial bez karty (bez subscription) → Checkout s trial_end, Stripe se na subscription neptá', async () => {
  const stripe = atrapaStripe();
  const res = await posli(sestav({ clenstvi: { ...TRIAL_S_KARTOU, stripe_subscription_id: null }, stripe }));
  assert.equal(res.stav, 200);
  assert.equal(stripe.zaznam.retrieve.length, 0);
  assert.equal(stripe.zaznam.sessions[0].subscription_data.trial_end, Math.floor(Date.parse(TRIAL_S_KARTOU.trial_ends_at) / 1000));
});

test('nový uživatel bez členství → Checkout se 7denním trialem', async () => {
  const stripe = atrapaStripe();
  const res = await posli(sestav({ clenstvi: null, stripe }));
  assert.equal(res.stav, 200);
  assert.equal(stripe.zaznam.sessions[0].subscription_data.trial_period_days, 7);
});

test('jePredplatneZive: canceled a incomplete_expired jsou mrtvé, ostatní živé', () => {
  assert.equal(jePredplatneZive({ status: 'canceled' }), false);
  assert.equal(jePredplatneZive({ status: 'incomplete_expired' }), false);
  assert.equal(jePredplatneZive(null), false);
  for (const s of ['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused']) {
    assert.equal(jePredplatneZive({ status: s }), true, s);
  }
});
