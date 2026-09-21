// Registrace START = 7 dní trialu, ne zamčený plán.
//
// 21. 9. 2026: `membershipFromRegistration('START')` vracela `pending_payment`,
// zatímco produkce (DB trigger `trg_start_trial_on_signup`) dávala `trial`.
// Rozpor hlídal jen `scripts/verify-paid-membership-gate.mjs`, který se
// v `npm run check` nespouští — proto to nikdo neviděl.
import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipFromRegistration, shouldPreserveMembership } from '../membershipRegistration.js';

const OD = '2026-07-01T10:00:00.000Z';

test('START se při registraci stává trialem na 7 dní', () => {
  const m = membershipFromRegistration('START', OD);
  assert.equal(m.tier, 'START');
  assert.equal(m.status, 'trial');
  assert.equal(m.trial_ends_at, '2026-07-08T10:00:00.000Z');
  assert.equal(m.started_at, OD);
});

test('bez programu je to START s trialem', () => {
  assert.equal(membershipFromRegistration(undefined, OD).status, 'trial');
  assert.equal(membershipFromRegistration('start', OD).tier, 'START');
});

test('ON_CLUB a VIP čekají na platbu, ne na trial', () => {
  for (const program of ['ON_CLUB', 'VIP']) {
    const m = membershipFromRegistration(program, OD);
    assert.equal(m.tier, program);
    assert.equal(m.status, 'pending_payment');
    assert.equal(m.trial_ends_at, null);
  }
});

test('platné členství se registrací nepřepíše', () => {
  for (const status of ['active', 'trial', 'past_due']) assert.equal(shouldPreserveMembership({ status }), true);
  assert.equal(shouldPreserveMembership({ status: 'pending_payment' }), false);
  assert.equal(shouldPreserveMembership(null), false);
});
