/**
 * Registrace jen od 18 let — klient (krok 2) i server (POST /api/body-metrics,
 * /api/profile-body-data) se stejnou hláškou.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AGE_MIN, AGE_MIN_MESSAGE_CS, validateAge } from '../registrationRules.js';
import { validateBirthDate } from '../bodyMetricsBirthDate.js';
import { getStep2FieldBlurError, getStep2FieldErrors } from '../registration/registrationStepValidation.js';
import { parseAndValidateRegistrationBody } from '../registration/bodyMetricsRegistration.js';

const HLASKA = 'Body & Mind ON je pro lidi od 18 let.';

/** Datum narození přesně N let před dneškem (± dny), YYYY-MM-DD v lokálním čase. */
function narozenPred(let_, dnyNavic = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - let_);
  d.setDate(d.getDate() + dnyNavic);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const registrace = (birth_date) => ({
  email: 'test@example.com',
  height: 180,
  weight: 80,
  birth_date,
  goal: 'redukce',
  activity: 'stredne',
  workout_days: [1, 3, 5],
  souhlasy: ['obchodni_podminky', 'zdravotni_udaje'],
});

test('minimum je 18 a hláška zní přesně podle zadání', () => {
  assert.equal(AGE_MIN, 18);
  assert.equal(AGE_MIN_MESSAGE_CS, HLASKA);
});

test('den před 18. narozeninami → odmítnuto; v den 18. narozenin → projde', () => {
  assert.deepEqual(validateBirthDate(narozenPred(18, 1)), { valid: false, error: HLASKA });
  assert.equal(validateBirthDate(narozenPred(18)).valid, true);
  assert.equal(validateBirthDate(narozenPred(15)).error, HLASKA, '15 let dřív prošlo');
});

test('klient: krok 2 registrace i blur pole ukáže hlášku 18+', () => {
  assert.equal(getStep2FieldErrors({ gender: 'male', birth_date: narozenPred(17), height: '180', weight: '80' }).birth_date, HLASKA);
  assert.equal(getStep2FieldBlurError('birth_date', narozenPred(16)), HLASKA);
  assert.equal(getStep2FieldBlurError('birth_date', narozenPred(30)), null);
});

test('server: registrace s datem narození pod 18 let → 400 s hláškou', () => {
  const res = parseAndValidateRegistrationBody(registrace(narozenPred(17, 200)));
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.equal(res.error, HLASKA);
  assert.equal(parseAndValidateRegistrationBody(registrace(narozenPred(18))).ok, true);
});

test('server: záložní pole age pod 18 taky neprojde', () => {
  assert.deepEqual(validateAge(17), { valid: false, error: HLASKA });
  assert.equal(validateAge(18).valid, true);
  const { birth_date: _bd, ...bezData } = registrace('');
  const res = parseAndValidateRegistrationBody({ ...bezData, age: 16 });
  assert.equal(res.ok, false);
  assert.equal(res.error, HLASKA);
});

test('registrace: chyba serveru „od 18 let" se ukáže u pole Datum narození', () => {
  const ui = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'components', 'registrace', 'StartRegistrace.tsx'), 'utf8');
  assert.match(ui, /\/Věk musí být\|datum narození\|od 18 let\/i\.test\(zprava\)/);
});
