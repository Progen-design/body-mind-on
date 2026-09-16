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
import fs from 'node:fs';
import path from 'node:path';

import { naTreninky, cvikZPlanu } from './adaptery.ts';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

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

// PROMPT_PRO_CODE.md A — záměna lehčí/těžší varianty ve WorkoutSection.tsx.
//
// handleZamenitVariantu je async handler s fetchem a React state, integrační
// test by potřeboval renderer + mock apiFetch. Repo má na tohle zavedený
// vzor (viz src/components/zmenaTreninku.test.ts, lib/__tests__/
// planExerciseVariantEndpoint.test.mjs): ověřit TVAR zdroje na místě, kde by
// jinak šlo testovat jen end-to-end.
const TRENINK = cti('src/components/WorkoutSection.tsx');
const idxZamena = TRENINK.indexOf('const handleZamenitVariantu');
const idxVymena = TRENINK.indexOf('const handleVymenitCvik');
const TELO_ZAMENY = TRENINK.slice(idxZamena, idxVymena);

test('A1: zaměněná varianta dostane skutečnou pozici cviku, ne natvrdo 0', () => {
  assert.ok(idxZamena > -1 && idxVymena > idxZamena, 'handleZamenitVariantu nenalezen');
  // Natvrdo 0 posílalo KAŽDOU zaměněnou variantu jako cvik #0 — odškrtnutí
  // i "vyměnit cvik" pak mířily na první cvik dne místo na zaměněný.
  assert.doesNotMatch(
    TELO_ZAMENY,
    /cvikZPlanu\(\s*odpoved\.exercise,\s*0\s*,/,
    'cvikZPlanu se pořád volá s natvrdo 0 místo skutečné pozice'
  );
  assert.match(
    TELO_ZAMENY,
    /cvikZPlanu\(\s*odpoved\.exercise,\s*ex\.poziceVPlanu\s*,/,
    'cvikZPlanu nedostává ex.poziceVPlanu jako pozici cviku'
  );
  // Bez ex.poziceVPlanu nemá požadavek spolehlivou adresu — stejná podmínka
  // jako u handleVymenitCvik (ex.poziceVPlanu == null v guardu).
  assert.match(
    TELO_ZAMENY,
    /ex\.poziceVPlanu == null/,
    'chybí guard na ex.poziceVPlanu == null'
  );
});

test('A2: po úspěšné záměně varianty se přenačte i globální plán (onPlanZmenen)', () => {
  const idxSet = TELO_ZAMENY.indexOf('setZamenaPodleKlice');
  const idxOnPlanZmenen = TELO_ZAMENY.indexOf('onPlanZmenen()');
  const idxCatch = TELO_ZAMENY.indexOf('} catch');
  assert.ok(idxSet > -1, 'chybí lokální vykreslení nového cviku (setZamenaPodleKlice)');
  assert.ok(idxOnPlanZmenen > -1, 'handleZamenitVariantu nevolá onPlanZmenen() — DB má nový cvik, appka starý');
  assert.ok(
    idxSet < idxOnPlanZmenen && idxOnPlanZmenen < idxCatch,
    'onPlanZmenen() se nevolá v try bloku po úspěšném vykreslení nového cviku'
  );
});

// PROMPT_PRO_CODE.md A3 — odpověď POST /api/plan/exercise-variant.
const EXERCISE_VARIANT = cti('api/plan/exercise-variant.js');

test('A3: odpověď endpointu nenese structured_plan_json ani plan_html', () => {
  const idxJson = EXERCISE_VARIANT.lastIndexOf('res.status(200).json({');
  assert.ok(idxJson > -1, 'chybí úspěšná odpověď 200');
  const konec = EXERCISE_VARIANT.indexOf('});', idxJson);
  const usek = EXERCISE_VARIANT.slice(idxJson, konec);
  assert.doesNotMatch(usek, /structured_plan_json/, 'odpověď pořád posílá celý structured_plan_json klientovi');
  assert.doesNotMatch(usek, /plan_html/, 'odpověď pořád posílá plan_html klientovi');
  assert.match(usek, /exercise: result\.exercise/, 'odpověď musí dál nést zaměněný cvik');
});

test('A3: do DB se structured_plan_json i plan_html dál zapisují', () => {
  const m = /\.update\(\{\s*structured_plan_json:\s*result\.structuredPlan,\s*plan_html:\s*result\.planHtml,/.exec(EXERCISE_VARIANT);
  assert.ok(m, 'update do ai_generated_plans už nezapisuje structured_plan_json + plan_html');
});
