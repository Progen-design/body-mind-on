// lib/bmi.js vyčleněné z lib/withingsProfileImport.js (docs/DALSI_KROK.md 7.2d),
// aby ho lib/telesneSlozeni.js šlo naimportovat bez supabaseServer.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBmi } from '../bmi.js';
import { calculateBmi as reexportZWithingsImportu } from '../withingsProfileImport.js';

test('BMI = váha / (výška v metrech)²', () => {
  assert.equal(calculateBmi(105.7, 194), 28.1);
  assert.equal(calculateBmi(104.8, 182), 31.6);
});

test('chybějící nebo nesmyslný vstup vrátí null, ne NaN nebo 0', () => {
  assert.equal(calculateBmi(null, 194), null);
  assert.equal(calculateBmi(105.7, null), null);
  assert.equal(calculateBmi(0, 194), null);
  assert.equal(calculateBmi(105.7, 0), null);
  assert.equal(calculateBmi(undefined, undefined), null);
});

test('lib/withingsProfileImport.js re-exportuje tutéž implementaci, ne druhou', () => {
  assert.equal(reexportZWithingsImportu, calculateBmi);
});
