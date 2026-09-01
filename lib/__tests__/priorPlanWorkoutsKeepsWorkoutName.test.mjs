/**
 * PŘEGENEROVÁNÍ „BEZE ZMĚNY TRÉNINKU" NESMÍ ZTRATIT NÁZEV TRÉNINKU.
 *
 * docs/DALSI_KROK.md 8.2. Změřeno na produkci 31. 8. 2026 na plánu
 * `64bf0ee1…`: po mealsOnly regeneraci zůstaly cviky, počet i zaměření
 * stejné, ale `workout.workout_name` zmizel („Trénink B" → „Trénink") a
 * s ním i `workout.start_program_variant`.
 *
 * Banner (`src/components/CalorieMismatchBanner.tsx`) a komentář
 * u `api/profile-preferences.js` slibují, že trénink zůstane BEZE ZMĚNY —
 * tenhle test drží doslovné znění slibu: objekt tréninku musí být po
 * regeneraci shodný s originálem, ne jen mít stejný počet cviků.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveWorkoutsFromStoredPlanJson } from '../services/priorPlanWorkouts.js';

const ORCHESTRATOR = fs.readFileSync(
  new URL('../services/planOrchestrator.js', import.meta.url), 'utf8'
);

const ULOZENY_PLAN = {
  days: [
    {
      day_index: 3,
      workout: {
        day_index: 3,
        duration_minutes: 45,
        workout_name: 'Trénink B',
        start_program_variant: 'B',
        exercises: [
          { canonical_key: 'squat', sets: 3, reps: '10-12' },
          { canonical_key: 'bench_press', sets: 3, reps: '8-10' },
          { canonical_key: 'bent_over_row', sets: 3, reps: '10' },
          { canonical_key: 'plank', sets: 3, reps: null, duration_sec: 45 },
          { canonical_key: 'lunge', sets: 3, reps: '12' },
        ],
      },
    },
    {
      day_index: 4,
      workout: null,
    },
  ],
};

test('vrácený trénink je shodný s uloženým objektem, ne jen se stejným počtem cviků', () => {
  const [den] = resolveWorkoutsFromStoredPlanJson(ULOZENY_PLAN);
  assert.deepStrictEqual(den, ULOZENY_PLAN.days[0].workout);
});

test('workout_name a start_program_variant se nezahodí', () => {
  const [den] = resolveWorkoutsFromStoredPlanJson(ULOZENY_PLAN);
  assert.equal(den.workout_name, 'Trénink B');
  assert.equal(den.start_program_variant, 'B');
});

test('den bez tréninku (volno) se přeskočí, ne že by spadl na chybu', () => {
  const dny = resolveWorkoutsFromStoredPlanJson(ULOZENY_PLAN);
  assert.equal(dny.length, 1, 'den 4 nemá workout.exercises, nesmí se objevit ve výsledku');
});

test('prázdný/neplatný vstup vrátí null, ne prázdné pole nebo pád', () => {
  assert.equal(resolveWorkoutsFromStoredPlanJson(null), null);
  assert.equal(resolveWorkoutsFromStoredPlanJson({}), null);
  assert.equal(resolveWorkoutsFromStoredPlanJson({ days: [] }), null);
});

// ── planOrchestrator.js: den z prior_plan se do finálního plánu nesmí
// skládat znovu z kusů (den_index/exercises/startProgramDayMeta) — to je
// přesně to, co `workout_name` podruhé zahodilo, protože startProgramDayMeta
// se v mealsOnly větvi staví z NOVĚ generovaného structured.workout_plan,
// který se v ní vůbec nepočítá.

test('workoutsResolveSource === prior_plan přebírá workout objekt vcelku, ne skládá z kusů', () => {
  const iVetev = ORCHESTRATOR.indexOf("workoutsResolveSource === 'prior_plan'");
  assert.ok(iVetev > -1, 'chybí rozlišení prior_plan vs. čerstvě vyřešené tréninky u stavby dne');
  const vyrez = ORCHESTRATOR.slice(iVetev, iVetev + 1200);
  assert.match(vyrez, /\{\s*\.\.\.workout,\s*day_index:\s*dow\s*\}/,
    'prior_plan větev musí předat celý `workout` objekt (spread), ne jen jeho exercises');
});

