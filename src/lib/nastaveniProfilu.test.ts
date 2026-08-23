// Rozdeleni zmen mezi /api/profile-preferences a /api/profile-settings.
import test from 'node:test';
import assert from 'node:assert/strict';

import { PRAZDNE_NASTAVENI, rozdelZmenyNastaveni } from './nastaveniProfilu.ts';

test('cílová váha a výška jdou na profile-settings, ne na preferences', () => {
  const r = rozdelZmenyNastaveni({ goal_weight_kg: '95', height_cm: '188' });

  assert.deepEqual(r.nastaveni, { goal_weight_kg: 95, height_cm: 188 });
  assert.equal(r.preference, null, 'plan se nema pregenerovat kvuli cilove vaze');
});

test('bez změn v preferencích se to volání vůbec nepošle', () => {
  // Prazdne telo by znamenalo zbytecnou regeneraci planu a e-mail navic.
  assert.equal(rozdelZmenyNastaveni({}).preference, null);
  assert.equal(rozdelZmenyNastaveni({}).nastaveni, null);
});

test('frequency se posílá jako freq_choice', () => {
  const r = rozdelZmenyNastaveni({ frequency: '2-3x týdně' });

  assert.deepEqual(r.preference, { freq_choice: '2-3x týdně' });
  assert.equal('frequency' in (r.preference || {}), false);
});

test('NÁVYKY SE POSÍLAJÍ JEN KDYŽ SE ZMĚNILY', () => {
  // Endpoint dela DELETE all + INSERT. Kdyz INSERT selze, uzivatel o navyky
  // prijde a server to jen zaloguje — vrati 200. Neposlat klic vubec ten blok
  // preskoci (`if (Array.isArray(b.selected_habits))`).
  const bezNavyku = rozdelZmenyNastaveni({ goal: 'redukce' });
  assert.equal('selected_habits' in (bezNavyku.preference || {}), false);

  const sNavyky = rozdelZmenyNastaveni({ selected_habits: ['hydration'] });
  assert.deepEqual(sNavyky.preference, { selected_habits: ['hydration'] });
});

test('prázdná cílová váha neznamená vynulovat', () => {
  // Uzivatel pole vymazal — to neni pokyn zapsat nulu.
  for (const prazdne of ['', '   ', '0', 'abc']) {
    const r = rozdelZmenyNastaveni({ goal_weight_kg: prazdne });
    assert.equal(r.nastaveni, null, `"${prazdne}" se poslalo na server`);
  }
});

test('desetinná čárka projde', () => {
  assert.deepEqual(rozdelZmenyNastaveni({ goal_weight_kg: '95,5' }).nastaveni, { goal_weight_kg: 95.5 });
});

test('smíšená změna se rozdělí na dvě volání', () => {
  const r = rozdelZmenyNastaveni({
    goal: 'redukce',
    workout_days: [1, 3, 5],
    height_cm: '188'
  });

  assert.deepEqual(r.preference, { goal: 'redukce', workout_days: [1, 3, 5] });
  assert.deepEqual(r.nastaveni, { height_cm: 188 });
});

test('prázdný výchozí stav má všechna pole, aby formulář nespadl', () => {
  for (const [klic, hodnota] of Object.entries(PRAZDNE_NASTAVENI)) {
    assert.notEqual(hodnota, undefined, `${klic} chybi`);
  }
  assert.deepEqual(PRAZDNE_NASTAVENI.workout_days, []);
  assert.deepEqual(PRAZDNE_NASTAVENI.selected_habits, []);
});
