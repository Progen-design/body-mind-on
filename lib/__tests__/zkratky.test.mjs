/**
 * Zkratky z Apple Watch česky.
 *
 * Chyba, kterou to opravuje: „HRV 42 ms“ a „58 bpm“ bez vysvětlení. Rozepsání
 * existovalo, ale jen v tooltipu na ikonce — na mobilu nedosažitelném.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { jednotkaCesky, popisSeZkratkou, vysvetliZkratku } from '../health/zkratky.js';

test('bpm se píše česky', () => {
  assert.equal(jednotkaCesky('bpm'), 'tepů/min');
  assert.equal(jednotkaCesky('count/min'), 'tepů/min');
});

test('známé jednotky projdou beze změny', () => {
  assert.equal(jednotkaCesky('ms'), 'ms');
  assert.equal(jednotkaCesky('kcal'), 'kcal');
  assert.equal(jednotkaCesky('%'), '%');
  assert.equal(jednotkaCesky('km'), 'km');
});

test('prázdná jednotka nevyrobí text', () => {
  assert.equal(jednotkaCesky(''), '');
  assert.equal(jednotkaCesky(null), '');
  assert.equal(jednotkaCesky(undefined), '');
});

test('zkratky se rozepíšou', () => {
  assert.equal(vysvetliZkratku('HRV'), 'variabilita tepu');
  assert.equal(vysvetliZkratku('hrv'), 'variabilita tepu');
  assert.equal(vysvetliZkratku('SpO2'), 'okysličení krve');
  assert.equal(vysvetliZkratku('VO2max'), 'aerobní kapacita');
  assert.equal(vysvetliZkratku('BMI'), 'index tělesné hmotnosti');
});

test('česky srozumitelné názvy se nerozepisují', () => {
  // Druhý řádek pod „Klidový tep“ by jen zabíral místo.
  assert.equal(vysvetliZkratku('Klidový tep'), null);
  assert.equal(vysvetliZkratku('Kroky'), null);
  assert.equal(vysvetliZkratku('Spánek'), null);
  assert.equal(vysvetliZkratku(''), null);
  assert.equal(vysvetliZkratku(null), null);
});

test('rozepsání neobsahuje zdravotní tvrzení', () => {
  // Interpretace („nízké HRV znamená únavu“) patří do insights.ts, kde je
  // vázaná na skutečná data. Tady je jen překlad zkratky.
  for (const zkratka of ['HRV', 'SpO2', 'VO2max', 'BMI', 'RHR']) {
    const v = vysvetliZkratku(zkratka) || '';
    assert.ok(!/nemoc|diagnóz|léčb|riziko|zdrav[íě]|únav/i.test(v), `${zkratka}: „${v}“ tvrdí něco o zdraví`);
  }
});

test('jednořádkový popisek spojí zkratku s významem', () => {
  assert.equal(popisSeZkratkou('HRV'), 'HRV (variabilita tepu)');
  assert.equal(popisSeZkratkou('Kroky'), 'Kroky');
});
