/**
 * lib/planExerciseVariantBuilder.js sestavVariantuCviku()
 * Čistá logika pro POST /api/plan/exercise-variant — žádná DB, žádné
 * síťové volání (viz komentář v modulu, proč je oddělená od
 * lib/planExerciseVariant.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sestavVariantuCviku } from '../planExerciseVariantBuilder.js';

const TARGET_ROW = {
  canonical_key: 'chest_press',
  display_name_cs: 'Chest press',
  gif_url: null,
  image_url: 'https://wger.de/chest-press.jpg',
  wger_exercise_image_url: null,
  wger_exercise_id: 123,
  level: 'beginner',
  instructions_cs: ['Krok jedna.', 'Krok dva.'],
  easier_key: null,
  harder_key: 'bench_press',
};

test('sestaví cvik s převzatými sets/reps/duration_sec z nahrazovaného cviku', () => {
  const out = sestavVariantuCviku({
    targetRow: TARGET_ROW,
    nazevPodleKlice: new Map([['bench_press', { display_name_cs: 'Tlak na lavici' }]]),
    previousTitle: 'Tlak na lavici',
    current: { sets: 4, reps: '10', duration_sec: null },
  });

  assert.equal(out.canonical_key, 'chest_press');
  assert.equal(out.display_name_cs, 'Chest press');
  assert.equal(out.name_cs, 'Chest press');
  assert.equal(out.sets, 4);
  assert.equal(out.reps, '10');
  assert.equal(out.duration_sec, null);
  assert.equal(out.replaced_from, 'Tlak na lavici');
  assert.equal(out.exercise_verified, true);
  assert.equal(out.level, 'beginner');
  assert.equal(out.obtiznost, 'lehké');
  assert.deepEqual(out.instructions_cs, ['Krok jedna.', 'Krok dva.']);
  assert.equal(out.harder_key, 'bench_press');
  assert.equal(out.harder_display_name_cs, 'Tlak na lavici');
  assert.ok(!('easier_key' in out), 'easier_key je u tohoto cviku NULL, nesmí se propsat');
});

test('chybějící cílový řádek -> null (volající to má hlásit jako NO_VARIANT)', () => {
  assert.equal(sestavVariantuCviku({ targetRow: null, nazevPodleKlice: new Map(), previousTitle: 'X' }), null);
});

test('cílový řádek bez display_name_cs -> null, i když canonical_key existuje', () => {
  const out = sestavVariantuCviku({
    targetRow: { canonical_key: 'chest_press', display_name_cs: '' },
    nazevPodleKlice: new Map(),
    previousTitle: 'X',
  });
  assert.equal(out, null);
});

test('bez current (chybí sets/reps) padá na výchozí 3 série', () => {
  const out = sestavVariantuCviku({
    targetRow: TARGET_ROW,
    nazevPodleKlice: new Map(),
    previousTitle: 'X',
    current: undefined,
  });
  assert.equal(out.sets, 3);
  assert.equal(out.reps, null);
});
