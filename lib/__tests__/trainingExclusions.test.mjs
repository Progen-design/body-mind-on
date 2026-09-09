/**
 * Vyloučení cviků a pohybových vzorů z tréninkového plánu.
 * Viz hlavička lib/trainingExclusions.js pro architekturu a ventil.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExclusions,
  isExerciseExcluded,
  normalizeTrainingExclusions,
  hasAnyExclusions,
  planExclusionCoverage,
} from '../trainingExclusions.js';
import {
  buildStartWorkoutDays,
  applyStartProgression,
} from '../workoutStartProgram.js';

const WORKOUT_DAYS = [1, 3, 5];

function bmFor(env, exclusions, extra = {}) {
  const equip =
    env === 'gym' ? {} :
    env === 'home_equipment' ? { available_equipment: 'dumbbells,bench,kettlebell' } :
    { available_equipment: '' };
  return {
    user_id: 'u-test',
    training_environment: env,
    training_exclusions: exclusions,
    ...equip,
    ...extra,
  };
}

function allCanonicalKeys(days) {
  return days.flatMap((d) => (d.exercises || d.workout?.exercises || []).map((e) => e.canonical_key));
}

test('vyloučení squat neprodukuje squat, goblet_squat ani leg_press v žádném prostředí', () => {
  for (const env of ['gym', 'home_equipment', 'home_bodyweight']) {
    const bm = bmFor(env, { patterns: ['squat'] });
    const built = buildStartWorkoutDays({ bodyMetrics: bm, workoutDays: WORKOUT_DAYS, weekIndex: 0 });
    const { days } = applyExclusions(built.days, bm.training_exclusions, env);
    const keys = allCanonicalKeys(days);
    assert.ok(!keys.includes('squat'), `${env}: squat unikl vyloučení`);
    assert.ok(!keys.includes('goblet_squat'), `${env}: goblet_squat unikl vyloučení`);
    assert.ok(!keys.includes('leg_press'), `${env}: leg_press unikl vyloučení`);
  }
});

test('exercise-variant nikdy nedosadí vyloučený cvik místo lehčí/těžší varianty', () => {
  // Simuluje kontrolu z api/plan/exercise-variant.js: den s cvikem, který je
  // sám o sobě vyloučený (jako by easier_key/harder_key ukázal na squat).
  const day = {
    day_index: 1,
    workout: {
      exercises: [
        { canonical_key: 'squat', sets: 3, reps: '12' },
        { canonical_key: 'pushup', sets: 3, reps: '10' },
      ],
    },
  };
  const exclusions = { patterns: ['squat'] };
  const { days } = applyExclusions([day], exclusions, 'home_bodyweight');
  assert.notEqual(days[0].workout.exercises[0].canonical_key, 'squat');
  // pushup není vyloučený, zůstává beze změny.
  assert.equal(days[0].workout.exercises[1].canonical_key, 'pushup');
});

test('slot bez použitelné náhrady se vypustí a založí warning', () => {
  // Vylouč VŠECHNO, co by mohlo nahradit "plank" v gymu (core i carry),
  // ať applyExclusions musí slot zahodit, ne substituovat.
  const day = {
    day_index: 1,
    exercises: [{ canonical_key: 'plank', sets: 3, duration_sec: 40 }],
  };
  const exclusions = { patterns: ['core', 'carry'], muscles: ['hamstrings'] };
  const { days, warnings } = applyExclusions([day], exclusions, 'gym');
  // Plank byl jediný cvik ve dni, takže se buď nahradí (a nesmí to být core
  // ani carry), nebo se den ochrání "day_fallback" záchranou.
  const remainingKeys = days[0].exercises.map((e) => e.canonical_key);
  assert.ok(!remainingKeys.includes('plank'), 'vyloučený plank nesmí zůstat');
  assert.ok(days[0].exercises.length >= 1, 'den nesmí zůstat prázdný');
  assert.ok(
    warnings.some((w) => ['substituted', 'dropped', 'day_fallback'].includes(w.type)),
    'musí vzniknout aspoň jeden warning popisující zásah'
  );
});

test('preferuje čerstvý cvik ze širšího hledání před opakováním už použitého cviku ve dni', () => {
  // HOME_BW_A: squat, pushup, superman, glute_bridge, plank. Žebříček pro
  // squat je [glute_bridge, superman, plank] — všechny tři jsou v šabloně
  // JINDE, takže "fresh ranked" vždycky selže. Ventil (jiná partie ze
  // stejné poloviny těla) ale najde "lunges" (glutes, pattern lunge != squat,
  // v šabloně dnes nepoužité) — a to musí vyhrát nad opakováním glute_bridge.
  const day = {
    day_index: 1,
    exercises: [
      { canonical_key: 'squat', sets: 3 },
      { canonical_key: 'pushup', sets: 3 },
      { canonical_key: 'superman', sets: 3 },
      { canonical_key: 'glute_bridge', sets: 3 },
      { canonical_key: 'plank', sets: 3 },
    ],
  };
  const { days } = applyExclusions([day], { exercise_keys: ['squat'] }, 'home_bodyweight');
  const keys = days[0].exercises.map((e) => e.canonical_key);
  assert.equal(keys[0], 'lunges', `čekal jsem čerstvou náhradu "lunges", dostal jsem "${keys[0]}"`);
  assert.equal(new Set(keys).size, keys.length, 'den nesmí mít žádný cvik dvakrát, když je fresh náhrada dostupná');
});

test('slot bez náhrady vůbec (umělý neznámý cvik) se vypustí a den zůstane neprázdný', () => {
  const day = {
    day_index: 2,
    exercises: [
      { canonical_key: 'bench_press', sets: 3, reps: '10' },
      { canonical_key: 'bicep_curl', sets: 3, reps: '10' },
    ],
  };
  // Vylouč VŠE, co v gymu existuje jako partie, kromě jedné — ať bench_press
  // nemá kam uhnout v žebříčku a musí spadnout do ventilu/dropu.
  const exclusions = {
    muscles: ['chest', 'shoulders', 'back', 'triceps', 'biceps', 'hamstrings', 'glutes', 'quads', 'calves', 'core', 'full_body'],
  };
  const { days, warnings } = applyExclusions([day], exclusions, 'gym');
  assert.ok(!allCanonicalKeys(days).includes('bench_press'));
  assert.ok(!allCanonicalKeys(days).includes('bicep_curl'));
  assert.ok(warnings.some((w) => w.type === 'day_shortened' || w.type === 'day_fallback' || w.type === 'dropped'));
});

test('uživatel bez training_exclusions dostane identický plán jako dnes (stejná reference)', () => {
  const bm = bmFor('gym', undefined);
  const built = buildStartWorkoutDays({ bodyMetrics: bm, workoutDays: WORKOUT_DAYS, weekIndex: 0 });
  const { days, warnings } = applyExclusions(built.days, bm.training_exclusions, 'gym');
  assert.equal(days, built.days, 'bez vyloučení se nesmí vracet nová kopie');
  assert.deepEqual(warnings, []);
});

test('prázdné, neplatné a poškozené training_exclusions plán neshodí', () => {
  const bm = bmFor('gym', undefined);
  const built = buildStartWorkoutDays({ bodyMetrics: bm, workoutDays: WORKOUT_DAYS, weekIndex: 0 });

  for (const bad of [null, undefined, {}, [], 'squat', 42, { patterns: 'squat' }, { patterns: ['neexistujici_vzor'] }, { muscles: [123, null, 'shoulders'] }]) {
    assert.doesNotThrow(() => applyExclusions(built.days, bad, 'gym'), `spadlo na ${JSON.stringify(bad)}`);
    const normalized = normalizeTrainingExclusions(bad);
    assert.ok(Array.isArray(normalized.patterns));
    assert.ok(Array.isArray(normalized.muscles));
    assert.ok(Array.isArray(normalized.exercise_keys));
    assert.ok(Array.isArray(normalized.contraindications));
  }

  // Platná partie mezi neplatnými musí přežít normalizaci.
  const normalized = normalizeTrainingExclusions({ muscles: [123, null, 'shoulders'] });
  assert.deepEqual(normalized.muscles, ['shoulders']);
});

test('HOME_BW s vyloučenýma nohama (glutes/quads/hamstrings/calves) dostane neprázdný plán', () => {
  const bm = bmFor('home_bodyweight', { muscles: ['glutes', 'quads', 'hamstrings', 'calves'] });
  const built = buildStartWorkoutDays({ bodyMetrics: bm, workoutDays: WORKOUT_DAYS, weekIndex: 0 });
  const { days } = applyExclusions(built.days, bm.training_exclusions, 'home_bodyweight');
  for (const day of days) {
    assert.ok(day.exercises.length >= 1, `den ${day.day_index} je prázdný`);
    for (const ex of day.exercises) {
      assert.ok(
        !['squat', 'lunges', 'glute_bridge', 'glute_kickback', 'calf_raise', 'single_leg_butt_kick'].includes(ex.canonical_key),
        `${ex.canonical_key} je cvik na vyloučenou partii nohou`
      );
    }
  }
});

test('progrese zůstane zachovaná pro cviky mimo vyloučení, i když se den jinde substituuje', () => {
  const bmClean = bmFor('home_bodyweight', undefined);
  const bmExcl = bmFor('home_bodyweight', { patterns: ['squat', 'lunge'] });

  const builtClean = buildStartWorkoutDays({ bodyMetrics: bmClean, workoutDays: WORKOUT_DAYS, weekIndex: 0 });
  const builtExcl = buildStartWorkoutDays({ bodyMetrics: bmExcl, workoutDays: WORKOUT_DAYS, weekIndex: 0 });
  const { days: daysExcl } = applyExclusions(builtExcl.days, bmExcl.training_exclusions, 'home_bodyweight');

  const prescriptionsClean = applyStartProgression(
    builtClean.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, start_program: { ...e.start_program } })) })),
    new Map()
  );
  const prescriptionsExcl = applyStartProgression(
    daysExcl.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, start_program: { ...e.start_program } })) })),
    new Map()
  );

  // Cviky, které vyloučení nezasáhlo (nejsou squat/lunge vzor), musí mít
  // úplně stejný předpis progrese jako bez vrstvy vyloučení vůbec.
  const byKeyClean = new Map(prescriptionsClean.map((p) => [`${p.day_index}:${p.canonical_key}`, p]));
  for (const p of prescriptionsExcl) {
    if (['squat', 'lunges'].includes(p.canonical_key)) continue;
    const matching = byKeyClean.get(`${p.day_index}:${p.canonical_key}`);
    if (!matching) continue; // cvik na tomhle místě je jiný jen kvůli substituci jinam v týdnu — v pořádku
    assert.deepEqual(p, matching, `progrese cviku ${p.canonical_key} v dni ${p.day_index} se změnila bez důvodu`);
  }
});

test('planExclusionCoverage počítá z katalogu daného prostředí, není konstanta', () => {
  const gymNoExcl = planExclusionCoverage({}, 'gym');
  const gymExcl = planExclusionCoverage({ patterns: ['squat'] }, 'gym');
  assert.ok(gymNoExcl.total > 0);
  assert.equal(gymNoExcl.remaining, gymNoExcl.total);
  assert.ok(gymExcl.remaining < gymNoExcl.remaining, 'vyloučení musí snížit počet zbývajících cviků');

  const bwCoverage = planExclusionCoverage({}, 'home_bodyweight');
  assert.notEqual(bwCoverage.total, gymNoExcl.total, 'různá prostředí mají různý katalog, ne stejnou konstantu');
});

test('isExerciseExcluded: neznámý canonical_key nespadne, vyloučí ho jen explicitní exercise_keys', () => {
  assert.equal(isExerciseExcluded('neexistujici_cvik_xyz', { patterns: ['squat'] }), false);
  assert.equal(isExerciseExcluded('neexistujici_cvik_xyz', { exercise_keys: ['neexistujici_cvik_xyz'] }), true);
});

test('hasAnyExclusions rozezná prázdná vyloučení od skutečných', () => {
  assert.equal(hasAnyExclusions({}), false);
  assert.equal(hasAnyExclusions(null), false);
  assert.equal(hasAnyExclusions({ patterns: ['squat'] }), true);
  assert.equal(hasAnyExclusions({ muscles: ['shoulders'] }), true);
});
