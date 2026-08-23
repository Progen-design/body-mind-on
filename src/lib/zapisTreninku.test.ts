// Telo pro POST /api/workouts nese jen to, co uzivatel zadal.
// Chybejici pole = "nevime". Vymyslena hodnota = tvrzeni o treninku,
// ktery jsme nevideli.
import test from 'node:test';
import assert from 'node:assert/strict';

import { minutyZeStopek, sestavZapisTreninku } from './zapisTreninku.ts';
import { PERCEIVED_DIFFICULTIES, WORKOUT_TYPES } from '../../lib/workoutTypes.js';

test('datum je jediné povinné pole', () => {
  const telo = sestavZapisTreninku({ datum: '2026-08-22' });

  assert.deepEqual(telo, { workout_date: '2026-08-22' });
  assert.equal('duration_min' in telo, false);
  assert.equal('perceived_difficulty' in telo, false);
  assert.equal('workout_type' in telo, false);
});

test('stopky, které neběžely, délku neposílají', () => {
  for (const sekundy of [undefined, 0, -5, NaN]) {
    const telo = sestavZapisTreninku({ datum: '2026-08-22', sekundyStopek: sekundy as number });
    assert.equal('duration_min' in telo, false, `sekundy=${sekundy} poslaly delku`);
  }
});

test('pod minutu se délka neposílá místo nuly', () => {
  // duration_min: 0 se dole cte jako "trenink trval nula minut", ne jako
  // "nemereno". Vynechat pole je pravdivejsi.
  for (const s of [1, 30, 59]) {
    assert.equal(minutyZeStopek(s), undefined, `${s} s poslalo delku`);
    assert.equal('duration_min' in sestavZapisTreninku({ datum: '2026-08-22', sekundyStopek: s }), false);
  }
});

test('minuty se zaokrouhlují dolů, ne nahoru', () => {
  // Zaokrouhleni nahoru by z 90 s udelalo 2 minuty — jednu, kterou uzivatel
  // necvicil.
  assert.equal(minutyZeStopek(60), 1);
  assert.equal(minutyZeStopek(90), 1);
  assert.equal(minutyZeStopek(119), 1);
  assert.equal(minutyZeStopek(120), 2);
  assert.equal(minutyZeStopek(3599), 59);
  assert.equal(minutyZeStopek(3600), 60);
  assert.equal(sestavZapisTreninku({ datum: '2026-08-22', sekundyStopek: 2700 }).duration_min, 45);
});

test('obtížnost projde jen z výčtu', () => {
  for (const o of PERCEIVED_DIFFICULTIES) {
    assert.equal(sestavZapisTreninku({ datum: '2026-08-22', obtiznost: o }).perceived_difficulty, o);
  }
  for (const o of [null, undefined, '', 'velmi_tezke', 'HARD', 5]) {
    const telo = sestavZapisTreninku({ datum: '2026-08-22', obtiznost: o as string });
    assert.equal('perceived_difficulty' in telo, false, `"${o}" proslo`);
  }
});

test('typ tréninku projde jen z výčtu, volný text se vynechá', () => {
  for (const t of WORKOUT_TYPES) {
    assert.equal(sestavZapisTreninku({ datum: '2026-08-22', typKandidat: t }).workout_type, t);
  }
  // Presne to, co by prislo z planu — server by to ulozil jak prislo
  // a workout_name by dopadl na klic misto popisku.
  for (const t of ['Záda', 'Hrudník & Biceps', 'Varianta A', '', null]) {
    const telo = sestavZapisTreninku({ datum: '2026-08-22', typKandidat: t });
    assert.equal('workout_type' in telo, false, `"${t}" proslo jako typ`);
  }
});

test('prázdné poznámky se neposílají', () => {
  for (const n of ['', '   ', null, undefined]) {
    const telo = sestavZapisTreninku({ datum: '2026-08-22', notes: n as string });
    assert.equal('notes' in telo, false);
  }
  assert.equal(sestavZapisTreninku({ datum: '2026-08-22', notes: '  těžké  ' }).notes, 'těžké');
});

test('vyplněný zápis nese jen zadaná pole', () => {
  const telo = sestavZapisTreninku({
    datum: '2026-08-22',
    sekundyStopek: 3300,
    obtiznost: 'hard',
    typKandidat: 'silovy',
    notes: 'poslední série do selhání'
  });

  assert.deepEqual(telo, {
    workout_date: '2026-08-22',
    duration_min: 55,
    perceived_difficulty: 'hard',
    workout_type: 'silovy',
    notes: 'poslední série do selhání'
  });
});

test('výčty jsou sdílené s API, ne zkopírované', () => {
  // api/workouts.js importuje WORKOUT_TYPE_LABELS ze stejneho modulu.
  assert.equal(WORKOUT_TYPES.length, 13);
  assert.deepEqual(PERCEIVED_DIFFICULTIES, ['easy', 'just_right', 'hard', 'too_hard']);
});
