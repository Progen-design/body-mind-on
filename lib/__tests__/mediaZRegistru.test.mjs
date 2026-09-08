/**
 * lib/profile/svalyDoPlanu.js — médium cviku bere registr, ne uložený plán.
 *
 * Snímek se do structured_plan_json zapíše v den generování a zůstane tam
 * i poté, co se katalog opraví. Uživatel tak u „Tlaky s jednoručkami" viděl
 * ještě po opravě katalogu vadný obrázek gluteálního mostu se španělským
 * popiskem (migrace 20260908160000). Registr je zdroj pravdy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doplnSvalyDoPlanu, SLOUPCE_REGISTRU_PRO_SVALY } from '../profile/svalyDoPlanu.js';

function planSCvikem(cvik) {
  return [{
    id: 'p1',
    structured_plan_json: {
      days: [{ date: '2026-09-08', workout: { exercises: [cvik] } }],
    },
  }];
}

function cvikZVysledku(plany) {
  return plany[0].structured_plan_json.days[0].workout.exercises[0];
}

test('registr přebije zastaralý snímek uložený v plánu', () => {
  const plany = planSCvikem({
    canonical_key: 'dumbbell_press',
    display_name_cs: 'Tlaky s jednoručkami',
    image_url: 'https://wger.de/media/exercise-images/2534/vadny.png',
  });
  const vysledek = doplnSvalyDoPlanu(plany, [{
    canonical_key: 'dumbbell_press',
    primary_muscle: 'chest',
    image_url: 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Bench_Press/0.jpg',
  }]);

  assert.equal(
    cvikZVysledku(vysledek).image_url,
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Bench_Press/0.jpg'
  );
});

test('cvik, který v registru snímek nemá, zůstane bez obrázku — starý se nedrží', () => {
  const plany = planSCvikem({
    canonical_key: 'step_up',
    display_name_cs: 'Step up',
    image_url: 'https://wger.de/media/exercise-images/2534/vadny.png',
  });
  const vysledek = doplnSvalyDoPlanu(plany, [{ canonical_key: 'step_up', primary_muscle: 'glutes' }]);

  assert.equal(cvikZVysledku(vysledek).image_url, null);
  assert.equal(cvikZVysledku(vysledek).gif_url, null);
});

test('animace z registru se propíše stejně jako statický snímek', () => {
  const plany = planSCvikem({ canonical_key: 'squat', display_name_cs: 'Dřepy' });
  const vysledek = doplnSvalyDoPlanu(plany, [{
    canonical_key: 'squat',
    primary_muscle: 'glutes',
    gif_url: 'https://static.exercisedb.dev/media/squat.gif',
  }]);

  assert.equal(cvikZVysledku(vysledek).gif_url, 'https://static.exercisedb.dev/media/squat.gif');
});

test('cvik mimo registr se nechává být — médium se mu nemaže', () => {
  const plany = planSCvikem({
    canonical_key: 'neznamy_cvik',
    display_name_cs: 'Neznámý',
    image_url: 'https://example.test/obrazek.jpg',
  });
  const vysledek = doplnSvalyDoPlanu(plany, [{ canonical_key: 'squat', primary_muscle: 'glutes' }]);

  assert.equal(cvikZVysledku(vysledek).image_url, 'https://example.test/obrazek.jpg');
});

test('SELECT si o média řekne — jinak by v řádku registru nebyla', () => {
  for (const sloupec of ['gif_url', 'image_url', 'wger_exercise_image_url']) {
    assert.ok(SLOUPCE_REGISTRU_PRO_SVALY.includes(sloupec), `chybí sloupec ${sloupec}`);
  }
});
