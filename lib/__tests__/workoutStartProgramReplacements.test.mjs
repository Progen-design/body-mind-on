/**
 * Náhrady cviků START programu — hlídá tvar žebříčku, ne hodnoty (viz
 * hlavičky lib/seeds/nahradyCviku.js a lib/workoutStartProgramReplacements.js).
 *
 * Klíčové invarianty:
 *   - každý (prostředí, canonical_key) slot z workoutStartProgram.js má
 *     v tabulce žebříček 1–3 náhrad,
 *   - žádná náhrada se nerovná nahrazovanému cviku ani se v žebříčku
 *     neopakuje,
 *   - náhrada sedí na prostředí slotu (`envs` v metadatech),
 *   - náhrada má jiný pohybový vzor NEBO jinou partii než nahrazovaný cvik.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { START_PROGRAM_VARIANTS } from '../workoutStartProgram.js';
import {
  START_PROGRAM_REPLACEMENTS,
  REPLACEMENT_EXERCISE_META,
  replacementsForStartSlot,
} from '../workoutStartProgramReplacements.js';

/** Všechny (prostředí, canonical_key) dvojice skutečně použité v šablonách. */
function slotsFromTemplates() {
  const slots = new Set();
  for (const [envKey, variants] of Object.entries(START_PROGRAM_VARIANTS)) {
    for (const template of Object.values(variants)) {
      for (const exercise of template) {
        slots.add(`${envKey}::${exercise.canonical_key}`);
      }
    }
  }
  return [...slots].map((s) => {
    const [envKey, canonicalKey] = s.split('::');
    return { envKey, canonicalKey };
  });
}

test('každý slot ze šablon START programu má žebříček 1-3 náhrad', () => {
  for (const { envKey, canonicalKey } of slotsFromTemplates()) {
    const list = START_PROGRAM_REPLACEMENTS[envKey]?.[canonicalKey];
    assert.ok(
      Array.isArray(list) && list.length >= 1 && list.length <= 3,
      `chybí nebo má špatnou délku žebříček pro ${envKey}/${canonicalKey}`
    );
  }
});

test('žádná náhrada se nerovná nahrazovanému cviku a v žebříčku se neopakuje', () => {
  for (const [envKey, table] of Object.entries(START_PROGRAM_REPLACEMENTS)) {
    for (const [canonicalKey, list] of Object.entries(table)) {
      assert.ok(!list.includes(canonicalKey), `${envKey}/${canonicalKey} nabízí sám sebe jako náhradu`);
      assert.equal(new Set(list).size, list.length, `${envKey}/${canonicalKey} má v žebříčku duplicitu`);
    }
  }
});

test('každá náhrada má metadata a sedí na prostředí slotu', () => {
  for (const [envKey, table] of Object.entries(START_PROGRAM_REPLACEMENTS)) {
    for (const [canonicalKey, list] of Object.entries(table)) {
      for (const candidate of list) {
        const meta = REPLACEMENT_EXERCISE_META[candidate];
        assert.ok(meta, `náhrada ${candidate} (za ${envKey}/${canonicalKey}) nemá metadata`);
        assert.ok(
          meta.envs.includes(envKey),
          `náhrada ${candidate} nesedí na prostředí ${envKey} (za ${canonicalKey})`
        );
      }
    }
  }
});

test('každá náhrada má jiný pohybový vzor nebo jinou partii než nahrazovaný cvik', () => {
  for (const [envKey, table] of Object.entries(START_PROGRAM_REPLACEMENTS)) {
    for (const [canonicalKey, list] of Object.entries(table)) {
      const original = REPLACEMENT_EXERCISE_META[canonicalKey];
      assert.ok(original, `nahrazovaný cvik ${canonicalKey} (${envKey}) nemá metadata`);
      for (const candidate of list) {
        const meta = REPLACEMENT_EXERCISE_META[candidate];
        const different = meta.muscle !== original.muscle || meta.pattern !== original.pattern;
        assert.ok(
          different,
          `${candidate} má stejnou partii (${meta.muscle}) i vzor (${meta.pattern}) jako ${canonicalKey}`
        );
      }
    }
  }
});

test('replacementsForStartSlot vrací canonical_key + name_cs, prázdné pole pro neznámý slot', () => {
  const result = replacementsForStartSlot('gym', 'bench_press');
  assert.deepEqual(result, [
    { canonical_key: 'overhead_press', name_cs: 'Tlaky nad hlavu' },
    { canonical_key: 'lat_pulldown', name_cs: 'Stahování na kladce' },
    { canonical_key: 'tricep_extension', name_cs: 'Tricepsové tlaky' },
  ]);
  assert.deepEqual(replacementsForStartSlot('gym', 'neexistujici_cvik'), []);
  assert.deepEqual(replacementsForStartSlot('nezname_prostredi', 'plank'), []);
});
