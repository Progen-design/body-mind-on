/**
 * Souhlas s obchodními podmínkami v Checkoutu + záchrana, když ve Stripe
 * Dashboardu chybí URL podmínek (Checkout se nesmí rozbít — LIVE platby).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jeChybaChybejiciUrlPodminek, SOUHLAS_V_CHECKOUTU, vytvorHandler } from '../../api/stripe/create-checkout-session.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_atrapa';
process.env.STRIPE_PRICE_START_MONTHLY = 'price_start_test';
process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';

const CHYBA_URL = Object.assign(
  new Error('You cannot collect consent to your terms of service unless a URL is set in the Stripe Dashboard. Update your public business details to include a terms of service URL.'),
  { type: 'StripeInvalidRequestError', statusCode: 400 },
);

function atrapa(chyby = []) {
  const volani = [];
  return {
    volani,
    klient: {
      subscriptions: { async retrieve() { return null; } },
      checkout: {
        sessions: {
          async create(p) {
            volani.push(p);
            const chyba = chyby.shift();
            if (chyba) throw chyba;
            return { url: 'https://checkout.stripe.test/s/1' };
          },
        },
      },
    },
  };
}

async function posli(stripe) {
  const handler = vytvorHandler({
    overUzivatele: async () => ({ id: 'user-1', email: 'jan@seznam.cz' }),
    nactiClenstvi: async () => null,
    poukazUzivatele: async () => null,
    stripe: () => stripe.klient,
  });
  const res = { stav: null, telo: null, logy: [] };
  res.status = (s) => { res.stav = s; return res; };
  res.json = (t) => { res.telo = t; return res; };
  const puvodni = [console.info, console.error];
  console.info = () => {};
  console.error = (...a) => { res.logy.push(a.map(String).join(' ')); };
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { tier: 'START' } }, res);
  } finally {
    [console.info, console.error] = puvodni;
  }
  return res;
}

test('Checkout žádá souhlas s podmínkami a má text o poměrné části', async () => {
  const stripe = atrapa();
  const res = await posli(stripe);
  assert.equal(res.stav, 200);
  const p = stripe.volani[0];
  assert.deepEqual(p.consent_collection, { terms_of_service: 'required' });
  assert.equal(
    p.custom_text.terms_of_service_acceptance.message,
    'Souhlasím s [obchodními podmínkami](https://bodyandmindon.cz/obchodni-podminky) a beru na vědomí, že služba začne hned a při odstoupení do 14 dnů zaplatím poměrnou část.',
  );
  assert.equal(p.mode, 'subscription');
  assert.equal(SOUHLAS_V_CHECKOUTU.consent_collection.terms_of_service, 'required');
});

test('chybí URL podmínek ve Stripe → jasný log a Checkout znovu bez souhlasu (platby nespadnou)', async () => {
  const stripe = atrapa([CHYBA_URL]);
  const res = await posli(stripe);
  assert.equal(res.stav, 200);
  assert.equal(res.telo.url, 'https://checkout.stripe.test/s/1');
  assert.equal(stripe.volani.length, 2);
  assert.ok(stripe.volani[0].consent_collection, 'první pokus se souhlasem');
  assert.equal(stripe.volani[1].consent_collection, undefined, 'druhý bez souhlasu');
  assert.equal(stripe.volani[1].custom_text, undefined);
  assert.equal(stripe.volani[1].line_items[0].price, 'price_start_test');
  assert.ok(res.logy.some((l) => /CHYBÍ URL OBCHODNÍCH PODMÍNEK/.test(l)), 'chyba musí být v logu vidět');
});

test('jiná chyba Stripe se nezamaskuje druhým pokusem', async () => {
  const stripe = atrapa([Object.assign(new Error('No such price'), { statusCode: 400 })]);
  const res = await posli(stripe);
  assert.equal(res.stav, 500);
  assert.equal(stripe.volani.length, 1);
});

test('rozpoznání chyby chybějící URL', () => {
  assert.equal(jeChybaChybejiciUrlPodminek(CHYBA_URL), true);
  assert.equal(jeChybaChybejiciUrlPodminek(new Error('No such price: price_x')), false);
  assert.equal(jeChybaChybejiciUrlPodminek(null), false);
});
