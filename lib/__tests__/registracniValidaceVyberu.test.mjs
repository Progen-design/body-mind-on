/**
 * docs/DALSI_KROK.md 9.1/C — neznámý goal/activity/den tréninku se má
 * odmítnout (400), ne tiše přepsat na výchozí hodnotu.
 *
 * Ověřeno 7. 9. 2026: `goal='lose_weight'` přes `POST /api/body-metrics`
 * vrátil 200 a plán na udržování; neděle poslaná jako `7` (formulář ji
 * posílá jako `0`) se tiše ztratila a nahradilo ji pondělí.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistrationChoices, GOALS, ACTIVITIES } from '../validation/onboardingSchema.js';
import { parseAndValidateRegistrationBody } from '../registration/bodyMetricsRegistration.js';

test('validateRegistrationChoices: platné hodnoty projdou', () => {
  for (const goal of GOALS) {
    assert.equal(validateRegistrationChoices({ goal }).ok, true, goal);
  }
  for (const activity of ACTIVITIES) {
    assert.equal(validateRegistrationChoices({ activity }).ok, true, activity);
  }
  assert.equal(validateRegistrationChoices({ workoutDays: [0, 1, 6] }).ok, true);
});

test('validateRegistrationChoices: chybějící hodnota není chyba', () => {
  assert.equal(validateRegistrationChoices({}).ok, true);
  assert.equal(validateRegistrationChoices({ goal: null, activity: undefined, workoutDays: null }).ok, true);
  assert.equal(validateRegistrationChoices({ goal: '' }).ok, true);
});

test('validateRegistrationChoices: neznámý goal se odmítne s konkrétní hláškou', () => {
  const v = validateRegistrationChoices({ goal: 'lose_weight' });
  assert.equal(v.ok, false);
  assert.match(v.error, /lose_weight/);
});

test('validateRegistrationChoices: neznámá aktivita se odmítne', () => {
  const v = validateRegistrationChoices({ activity: 'nizka' });
  assert.equal(v.ok, false);
  assert.match(v.error, /nizka/);
});

test('validateRegistrationChoices: den tréninku mimo 0–6 se odmítne, ne zahodí', () => {
  const v = validateRegistrationChoices({ workoutDays: [1, 3, 7] });
  assert.equal(v.ok, false);
  assert.match(v.error, /7/);
});

test('parseAndValidateRegistrationBody: neznámý goal vrátí 400, ne tichý default', () => {
  const res = parseAndValidateRegistrationBody({
    email: 'test@example.com',
    height: 180,
    weight: 80,
    birth_date: '1990-01-01',
    goal: 'lose_weight',
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.match(res.error, /cíl/i);
});

test('parseAndValidateRegistrationBody: den tréninku 7 vrátí 400, nedosadí pondělí', () => {
  const res = parseAndValidateRegistrationBody({
    email: 'test@example.com',
    height: 180,
    weight: 80,
    birth_date: '1990-01-01',
    workout_days: [7],
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test('parseAndValidateRegistrationBody: platné hodnoty z formuláře projdou dál', () => {
  const res = parseAndValidateRegistrationBody({
    email: 'test@example.com',
    height: 180,
    weight: 80,
    birth_date: '1990-01-01',
    goal: 'redukce',
    activity: 'stredne',
    workout_days: [1, 3, 5],
  });
  assert.equal(res.ok, true);
  assert.equal(res.payload.goal, 'redukce');
});
