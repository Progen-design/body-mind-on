/**
 * lib/seeds/obtiznostAPostupCviku.js — 47 ručně psaných klíčů, ze kterých
 * je supabase/migrations/20260908120000_obtiznost_a_postup_cviku.sql ručně
 * přepsaná do SQL. Test hlídá tvar seedu, ne obsah vět (ten je subjektivní).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_OBTIZNOST_A_POSTUP_CVIKU, seedKlice } from '../seeds/obtiznostAPostupCviku.js';

const OCEKAVANE_KLICE = [
  'bench_press', 'bent_over_row', 'bicep_curl', 'burpee', 'cable_row', 'calf_raise',
  'chest_press', 'dead_bug', 'deadlift', 'dumbbell_romanian_deadlift', 'dumbbell_row',
  'farmer_carry', 'glute_bridge', 'goblet_squat', 'hammer_curl', 'hamstring_curl',
  'lat_pulldown', 'leg_press', 'lunges', 'mountain_climber', 'overhead_press', 'plank',
  'plank_side', 'pushup', 'romanian_deadlift', 'russian_twist', 'squat', 'superman',
  'tricep_extension', 'box_jump', 'bulgarian_squat', 'chest_fly', 'crunch', 'dips',
  'dumbbell_press', 'face_pull', 'hip_thrust', 'incline_bench_press', 'jumping_jack',
  'lateral_raise', 'leg_raise', 'pull_up', 'step_up', 'tricep_dip', 'warmup', 'rest',
  'cooldown',
];

test('seed má přesně těch 47 klíčů ze zadání, žádný navíc ani chybí', () => {
  assert.equal(seedKlice().length, 47);
  assert.deepEqual([...seedKlice()].sort(), [...OCEKAVANE_KLICE].sort());
});

test('každý klíč má 4-7 kroků postupu', () => {
  for (const [klic, radek] of Object.entries(SEED_OBTIZNOST_A_POSTUP_CVIKU)) {
    assert.ok(Array.isArray(radek.instructions_cs), `${klic}: instructions_cs není pole`);
    assert.ok(
      radek.instructions_cs.length >= 4 && radek.instructions_cs.length <= 7,
      `${klic}: má ${radek.instructions_cs.length} kroků, čekáno 4-7`
    );
    for (const krok of radek.instructions_cs) {
      assert.equal(typeof krok, 'string');
      assert.ok(krok.trim().length > 0, `${klic}: prázdný krok`);
    }
  }
});

test('warmup/rest/cooldown mají level i mechanic NULL, ostatní 44 klíčů obojí vyplněné', () => {
  const bezObtiznosti = new Set(['warmup', 'rest', 'cooldown']);
  for (const [klic, radek] of Object.entries(SEED_OBTIZNOST_A_POSTUP_CVIKU)) {
    if (bezObtiznosti.has(klic)) {
      assert.equal(radek.level, null, `${klic}: level má být NULL`);
      assert.equal(radek.mechanic, null, `${klic}: mechanic má být NULL`);
    } else {
      assert.ok(['beginner', 'intermediate', 'expert'].includes(radek.level), `${klic}: neplatný level ${radek.level}`);
      assert.ok(['compound', 'isolation'].includes(radek.mechanic), `${klic}: neplatný mechanic ${radek.mechanic}`);
    }
  }
});

test('easier_key/harder_key mají tvar canonical_key — cíl smí ležet i mimo seed', () => {
  // Varianta nemusí být jeden z těch 47 ručně psaných klíčů: lehčí verzí
  // kliků jsou "kliky na šikmé lavici", které do seedu nepatří, ale v
  // katalogu jsou. Že cíl v katalogu OPRAVDU existuje a má český název i
  // postup, hlídá kontrolní blok v migraci 20260908160000 — tady se dá
  // ověřit jen tvar klíče.
  const TVAR = /^[a-z0-9]+(_[a-z0-9]+)*$/;
  for (const [klic, radek] of Object.entries(SEED_OBTIZNOST_A_POSTUP_CVIKU)) {
    if (radek.easier_key) assert.match(radek.easier_key, TVAR, `${klic}.easier_key nemá tvar canonical_key`);
    if (radek.harder_key) assert.match(radek.harder_key, TVAR, `${klic}.harder_key nemá tvar canonical_key`);
  }
});

test('žádný klíč není sám sobě lehčí/těžší variantou', () => {
  for (const [klic, radek] of Object.entries(SEED_OBTIZNOST_A_POSTUP_CVIKU)) {
    assert.notEqual(radek.easier_key, klic, `${klic}: easier_key ukazuje sám na sebe`);
    assert.notEqual(radek.harder_key, klic, `${klic}: harder_key ukazuje sám na sebe`);
  }
});

test('pushup má lehčí variantu na šikmé lavici a těžší dipy', () => {
  assert.equal(SEED_OBTIZNOST_A_POSTUP_CVIKU.pushup.easier_key, 'incline_push_up_wide');
  assert.equal(SEED_OBTIZNOST_A_POSTUP_CVIKU.pushup.harder_key, 'dips');
});
