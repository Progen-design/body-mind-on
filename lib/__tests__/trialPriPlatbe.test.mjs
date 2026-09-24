/**
 * Platba během trialu nesmí sebrat zbývající dny zdarma (25. 9. 2026).
 *
 * START má trial od registrace (status 'trial' + trial_ends_at). Kdo si
 * během něj zaplatil, dostal checkout bez trialu a Stripe strhl 599 Kč hned.
 * Teď dostane `trial_end` = konec trialu → první platba 8. den (s poukazem
 * 31.). Stripe Checkout chce `trial_end` aspoň 48 h dopředu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MIN_STRIPE_TRIAL_MS,
  TRIAL_PERIOD_DAYS,
  stripeTrialEndZMembership,
  stripeTrialProCheckout,
} from '../trialEligibility.js';
import { konecObdobiSubscription } from '../stripeSubscriptionStatus.js';
import { membershipFromRegistration } from '../membershipRegistration.js';

const KOREN = join(import.meta.dirname, '..', '..');
const cti = (p) => readFileSync(join(KOREN, p), 'utf8');

const TED = Date.parse('2026-09-25T10:00:00Z');
const DEN = 24 * 60 * 60 * 1000;
const za = (ms) => new Date(TED + ms).toISOString();
const unix = (iso) => Math.floor(Date.parse(iso) / 1000);
const ZRUSIT_BEZ_KARTY = { end_behavior: { missing_payment_method: 'cancel' } };

const vTrialu = (konecZa) => ({ status: 'trial', trial_ends_at: za(konecZa), stripe_subscription_id: null });

// ---------------------------------------------------------------- trial_end

test('zbývá 5 dní → trial_end = konec trialu, první platba až po něm', () => {
  const clenstvi = vTrialu(5 * DEN);
  assert.equal(stripeTrialEndZMembership(clenstvi, TED), unix(clenstvi.trial_ends_at));
  assert.deepEqual(stripeTrialProCheckout('START', clenstvi, TED), {
    trial_end: unix(clenstvi.trial_ends_at),
    trial_settings: ZRUSIT_BEZ_KARTY,
  });
});

test('zbývá 1 den (< 48 h) → bez trialu, platí se hned', () => {
  const clenstvi = vTrialu(1 * DEN);
  assert.equal(stripeTrialEndZMembership(clenstvi, TED), undefined);
  assert.deepEqual(stripeTrialProCheckout('START', clenstvi, TED), {});
});

test('hranice 48 h: přesně 48 h ještě trial, o minutu méně už ne', () => {
  assert.equal(MIN_STRIPE_TRIAL_MS, 48 * 60 * 60 * 1000);
  assert.ok(stripeTrialEndZMembership(vTrialu(MIN_STRIPE_TRIAL_MS), TED));
  assert.equal(stripeTrialEndZMembership(vTrialu(MIN_STRIPE_TRIAL_MS - 60_000), TED), undefined);
});

test('trial vypršel → bez trialu, platí se hned (dnešní chování)', () => {
  const clenstvi = vTrialu(-2 * DEN);
  assert.equal(stripeTrialEndZMembership(clenstvi, TED), undefined);
  assert.deepEqual(stripeTrialProCheckout('START', clenstvi, TED), {});
});

test('poukaz 30 dní → trial_end na konci poukazového trialu (beze změny)', () => {
  const registrace = membershipFromRegistration('START', new Date(TED).toISOString(), 30);
  const clenstvi = { ...registrace, stripe_subscription_id: null };
  assert.equal(clenstvi.status, 'trial');
  const trial = stripeTrialProCheckout('START', clenstvi, TED + 3 * DEN); // platí 4. den
  assert.equal(trial.trial_end, unix(za(30 * DEN)), 'zbývajících 27 dní zůstane zdarma');
});

test('běžný 7denní trial z registrace, platba 3. den → trial_end = 8. den', () => {
  const registrace = membershipFromRegistration('START', new Date(TED).toISOString());
  const trial = stripeTrialProCheckout('START', { ...registrace, stripe_subscription_id: null }, TED + 2 * DEN);
  assert.equal(trial.trial_end, unix(za(7 * DEN)));
});

test('nový uživatel bez členství → trial_period_days 7', () => {
  assert.equal(TRIAL_PERIOD_DAYS, 7);
  assert.deepEqual(stripeTrialProCheckout('START', null, TED), {
    trial_period_days: 7,
    trial_settings: ZRUSIT_BEZ_KARTY,
  });
});

test('bez trialu: už má subscription, jiný stav než trial, jiný tier', () => {
  assert.deepEqual(stripeTrialProCheckout('START', { ...vTrialu(5 * DEN), stripe_subscription_id: 'sub_1' }, TED), {});
  assert.deepEqual(stripeTrialProCheckout('START', { status: 'active', trial_ends_at: za(5 * DEN) }, TED), {});
  assert.deepEqual(stripeTrialProCheckout('START', { status: 'canceled', trial_ends_at: za(5 * DEN) }, TED), {});
  assert.deepEqual(stripeTrialProCheckout('ON_CLUB', vTrialu(5 * DEN), TED), {});
  assert.deepEqual(stripeTrialProCheckout('VIP', null, TED), {});
});

test('checkout: jedno rozhodnutí pro běžný trial i poukaz, žádná paralelní logika', () => {
  const api = cti('api/stripe/create-checkout-session.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(api, /const trial = stripeTrialProCheckout\(tier, membership\);/);
  assert.match(api, /\.\.\.trial,/);
  assert.doesNotMatch(api, /trial_period_days\s*=|trial_end\s*=/, 'trial se nastavuje ručně vedle stripeTrialProCheckout');
  assert.doesNotMatch(cti('lib/poukazy.js'), /trial_end\b|MIN_STRIPE_TRIAL/, 'poukaz má vlastní Stripe trial logiku');
});

// ---------------------------------------------------------------- cancel.js — konec období

test('konec období: nový tvar (API basil, stripe-node v20) — items.data[0]', () => {
  const sub = { id: 'sub_1', status: 'active', items: { data: [{ current_period_end: 1790000000 }] } };
  assert.equal(konecObdobiSubscription(sub), new Date(1790000000 * 1000).toISOString());
});

test('konec období: starý tvar — přímo na subscription', () => {
  assert.equal(konecObdobiSubscription({ current_period_end: 1790000000 }), new Date(1790000000 * 1000).toISOString());
});

test('konec období: nový tvar má přednost, chybějící hodnota → null', () => {
  assert.equal(
    konecObdobiSubscription({ current_period_end: 1, items: { data: [{ current_period_end: 1790000000 }] } }),
    new Date(1790000000 * 1000).toISOString(),
  );
  assert.equal(konecObdobiSubscription({ items: { data: [] } }), null);
  assert.equal(konecObdobiSubscription(null), null);
});

test('cancel.js bere konec období přes konecObdobiSubscription, ne přímo ze subscription', () => {
  const api = cti('api/subscription/cancel.js');
  assert.match(api, /const konecObdobi = konecObdobiSubscription\(subscription\);/);
  assert.doesNotMatch(api, /subscription\.current_period_end/);
  // Nikde jinde v api/ a lib/ se období ze subscription nečte napřímo.
  for (const soubor of ['api/webhooks/stripe.js', 'api/stripe/create-checkout-session.js']) {
    assert.doesNotMatch(cti(soubor), /\.current_period_(end|start)/, soubor);
  }
});

// ---------------------------------------------------------------- webhook

test('webhook: subscription trialing (START) → členství trial + trial_ends_at ze Stripe trial_end', async () => {
  const { membershipStateFromSubscription } = await import('../../api/webhooks/stripe.js');
  const trialEnd = unix(za(5 * DEN));
  assert.deepEqual(membershipStateFromSubscription({ status: 'trialing', trial_end: trialEnd }, 'START'), {
    status: 'trial',
    trialEndsAt: new Date(trialEnd * 1000).toISOString(),
  });
  // Po první platbě Stripe pošle subscription.updated se stavem active.
  assert.deepEqual(membershipStateFromSubscription({ status: 'active', trial_end: trialEnd }, 'START'), {
    status: 'active',
    trialEndsAt: null,
  });
});

test('webhook: checkout i subscription.updated zapisují stripe_subscription_id a trial_ends_at', () => {
  const api = cti('api/webhooks/stripe.js');
  const upsert = api.slice(api.indexOf('async function upsertMembership'), api.indexOf('export function membershipStateFromSubscription'));
  assert.match(upsert, /if \(status === 'trial'\) \{[\s\S]*row\.trial_ends_at = trialEndsAt;/);
  assert.match(upsert, /if \(status === 'active'\) \{[\s\S]*row\.trial_ends_at = null;/);
  assert.match(upsert, /if \(stripeSubscriptionId\) row\.stripe_subscription_id = stripeSubscriptionId;/);
  // Obě větve předávají subscription id a konec trialu.
  const volani = api.match(/await upsertMembership\(userId, \{[\s\S]*?\}\);/g) || [];
  assert.ok(volani.length >= 2);
  for (const v of volani) {
    assert.match(v, /stripeSubscriptionId: subscriptionId/);
    assert.match(v, /trialEndsAt: state\.trialEndsAt/);
  }
});
