// Adresa cviku pro vymenu — `poziceVPlanu`.
//
// PROC TENHLE TEST EXISTUJE. POST /api/plan-replace-workout-exercise adresuje
// cvik POZICI v `structured_plan_json.days[].workout.exercises`, ne klicem.
// Kdyz se pozice rozejde s realitou, endpoint prepise JINY cvik nez ten,
// na ktery uzivatel klikl — a nijak to nehlasi, protoze zamena sama probehne
// uspesne. Zadny jiny test tohle nechyti.
//
// Klic by adresu nenahradil: jeden den muze obsahovat dva stejne cviky
// (tricepsovy tlak v supersete) a podle klice by nesly rozlisit.
import test from 'node:test';
import assert from 'node:assert/strict';

import { naTreninky, cvikZPlanu } from './adaptery.ts';

const PLAN = {
  id: 'plan-1',
  structured_plan_json: {
    days: [
      {
        date: '2026-09-09',
        day_index: 3,
        day_name: 'Středa',
        workout: {
          exercises: [
            { display_name_cs: 'Rumunský mrtvý tah', canonical_key: 'romanian_deadlift', sets: 3, reps: '12-14' },
            { display_name_cs: 'Tlaky nad hlavu', canonical_key: 'overhead_press', sets: 3, reps: '12-14' },
            { display_name_cs: 'Stahování na kladce', canonical_key: 'lat_pulldown', sets: 3, reps: '14-16' },
          ],
        },
        meals: [],
      },
    ],
  },
};

test('kazdy cvik zna svou pozici v planu', () => {
  const dny = naTreninky(PLAN);
  const den = dny.find((d) => d.exercises.length > 0);
  assert.ok(den, 'den s treninkem musi existovat');
  assert.deepEqual(den.exercises.map((e) => e.poziceVPlanu), [0, 1, 2]);
});

test('pozice sedi na poradi v structured_plan_json, ne na nazev', () => {
  const den = naTreninky(PLAN).find((d) => d.exercises.length > 0);
  const zdroj = PLAN.structured_plan_json.days[0].workout.exercises;
  for (const cvik of den.exercises) {
    assert.equal(zdroj[cvik.poziceVPlanu].display_name_cs, cvik.name);
  }
});

test('dva stejne cviky v jednom dni maji ruznou pozici', () => {
  // Superset nebo dropset: stejny klic dvakrat. Kdyby se cvik adresoval
  // klicem, vymena by netrefila ten spravny.
  const plan = {
    id: 'plan-2',
    structured_plan_json: {
      days: [{
        date: '2026-09-09',
        day_index: 3,
        workout: {
          exercises: [
            { display_name_cs: 'Tricepsový tlak', canonical_key: 'triceps_pushdown', sets: 3, reps: '10' },
            { display_name_cs: 'Tricepsový tlak', canonical_key: 'triceps_pushdown', sets: 2, reps: '15' },
          ],
        },
      }],
    },
  };
  const den = naTreninky(plan).find((d) => d.exercises.length > 0);
  assert.deepEqual(den.exercises.map((e) => e.poziceVPlanu), [0, 1]);
});

test('cvikZPlanu nese pozici i pri samostatnem volani po zamene varianty', () => {
  // WorkoutSection po zamene varianty prevadi odpoved endpointu pres
  // `cvikZPlanu`. Kdyby se tam pozice ztratila, tlacitko vymeny by u prave
  // zameneneho cviku zmizelo.
  const cvik = cvikZPlanu({ display_name_cs: 'Dřep', canonical_key: 'squat' }, 2, '2026-09-09', 'plan-1', 3);
  assert.equal(cvik.poziceVPlanu, 2);
  assert.equal(cvik.planId, 'plan-1');
  assert.equal(cvik.planDay, 3);
});
