/**
 * ODVOZENÉ HODNOTY TRÉNINKU.
 *
 * Tyhle funkce ležely 366 řádků uprostřed pages/profil.js a nikdy neměly test,
 * přitom počítají čísla, která uživatel vidí jako fakt: kolik uběhl, kolik
 * spálil, jak těžký měl týden. Refaktor 13. 8. 2026 je vytáhl do lib/ —
 * test je tu proto, aby se přesun dal ověřit a aby se pravidla dala měnit
 * vědomě, ne omylem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeWorkoutTypeId,
  getWorkoutTypeSpec,
  parseWorkoutMetaFromNotes,
  parsePositiveNumber,
  normalizeDistanceKmForType,
  serializeWorkoutNotesWithMeta,
  getWorkoutDistanceKm,
  getWorkoutDurationMinutes,
  getWorkoutDetailLabel,
  estimatedCalories,
  getWorkoutLoadPoints,
  WORKOUT_TYPES,
  WORKOUT_TYPE_SPECS,
} from '../workoutFormat.js';

const beh = (notes, duration) => ({ workout_type: 'beh', notes, duration_min: duration });

test('typ bez diakritiky se srovná na jeden klíč', () => {
  // V datech jsou obě varianty — bez tohohle by „strecink“ spadl na „ostatni“
  // a počítal se jinou sazbou.
  assert.equal(normalizeWorkoutTypeId('strecink'), 'strečink');
  assert.equal(normalizeWorkoutTypeId('STREČINK'), 'strečink');
  assert.equal(normalizeWorkoutTypeId(null), 'ostatni');
  assert.equal(getWorkoutTypeSpec('strecink'), WORKOUT_TYPE_SPECS['strečink']);
  assert.equal(getWorkoutTypeSpec('neznamy'), WORKOUT_TYPE_SPECS.ostatni);
});

test('každý nabízený typ má svoji sazbu', () => {
  // Typ v nabídce bez sazby by se tiše počítal jako „ostatni“.
  for (const t of WORKOUT_TYPES) {
    assert.ok(
      WORKOUT_TYPE_SPECS[normalizeWorkoutTypeId(t.id)],
      `${t.id} nemá záznam ve WORKOUT_TYPE_SPECS`
    );
  }
});

test('metadata se z poznámek přečtou a zapíšou zpátky', () => {
  const zapis = serializeWorkoutNotesWithMeta('Šlo to ztuha', { distance_km: 12.5 });
  assert.match(zapis, /\[BMO_META\]/);

  const { userNotes, meta } = parseWorkoutMetaFromNotes(zapis);
  assert.equal(userNotes, 'Šlo to ztuha');
  assert.equal(meta.distance_km, 12.5);

  // Poznámka bez metadat zůstane poznámkou.
  assert.deepEqual(parseWorkoutMetaFromNotes('jen text'), { userNotes: 'jen text', meta: {} });
  assert.deepEqual(parseWorkoutMetaFromNotes(null), { userNotes: '', meta: {} });

  // Rozbitý JSON nesmí shodit stránku.
  const rozbite = parseWorkoutMetaFromNotes('text\n[BMO_META]{neni json');
  assert.deepEqual(rozbite.meta, {});

  // Nuly a nesmysly se do metadat nezapisují — jinak by „0 km“ přebilo dopočet.
  assert.equal(serializeWorkoutNotesWithMeta('a', { distance_km: 0 }), 'a');
  assert.equal(serializeWorkoutNotesWithMeta('a', { distance_km: 'abc' }), 'a');
});

test('desetinná čárka je platné číslo', () => {
  assert.equal(parsePositiveNumber('12,5'), 12.5);
  assert.equal(parsePositiveNumber('12.5'), 12.5);
  assert.equal(parsePositiveNumber('-3'), 0);
  assert.equal(parsePositiveNumber(''), 0);
  assert.equal(parsePositiveNumber(null), 0);
});

test('metry zadané místo kilometrů se poznají podle rychlosti', () => {
  // 5000 „km“ za 30 minut je nesmysl → jsou to metry.
  assert.equal(normalizeDistanceKmForType('beh', 5000, 30), 5);
  // 10 km za 60 minut běhu je normální — nesahat na to.
  assert.equal(normalizeDistanceKmForType('beh', 10, 60), 10);
  // Bez trvání se řeší jen hrubý strop 200.
  assert.equal(normalizeDistanceKmForType('beh', 1000, 0), 1);
  assert.equal(normalizeDistanceKmForType('beh', 15, 0), 15);
});

test('plavání se ukládá v metrech, ostatní v kilometrech', () => {
  const plavani = {
    workout_type: 'plavani',
    notes: serializeWorkoutNotesWithMeta('', { distance_m: 1500 }),
    duration_min: 40,
  };
  assert.equal(getWorkoutDistanceKm(plavani), 1.5);
  assert.equal(getWorkoutDetailLabel(plavani), '1500 m');

  const behTrenink = beh(serializeWorkoutNotesWithMeta('', { distance_km: 8 }), 45);
  assert.equal(getWorkoutDistanceKm(behTrenink), 8);
  assert.equal(getWorkoutDetailLabel(behTrenink), '8.0 km');

  // Bez vzdálenosti se popisek nevymýšlí.
  assert.equal(getWorkoutDetailLabel({ workout_type: 'silovy', duration_min: 60 }), '');
});

test('chybějící trvání se dopočítá z tempa, ne z ničeho', () => {
  const bezCasu = beh(serializeWorkoutNotesWithMeta('', { distance_km: 10 }), null);
  assert.equal(getWorkoutDurationMinutes(bezCasu), 65); // 10 km × 6,5 min/km

  // Zadané trvání má přednost.
  assert.equal(getWorkoutDurationMinutes(beh(null, 30)), 30);

  // Silový trénink nemá tempo — bez trvání je to nula, ne odhad.
  assert.equal(getWorkoutDurationMinutes({ workout_type: 'silovy' }), 0);
});

test('kalorie: vzdálenost má přednost před časem', () => {
  const sVzdalenosti = beh(serializeWorkoutNotesWithMeta('', { distance_km: 10 }), 60);
  assert.equal(estimatedCalories(sVzdalenosti), 600); // 10 km × 60 kcal/km

  // Bez vzdálenosti se počítá z minut.
  assert.equal(estimatedCalories({ workout_type: 'silovy', duration_min: 60 }), 300);

  // Prázdný trénink nevyrobí kalorie z ničeho.
  assert.equal(estimatedCalories({ workout_type: 'silovy' }), 0);
});

test('zátěž zohledňuje pocit z tréninku', () => {
  const zaklad = { workout_type: 'silovy', duration_min: 60 };
  const lehky = getWorkoutLoadPoints({ ...zaklad, perceived_difficulty: 'easy' });
  const akorat = getWorkoutLoadPoints({ ...zaklad, perceived_difficulty: 'just_right' });
  const tezky = getWorkoutLoadPoints({ ...zaklad, perceived_difficulty: 'too_hard' });

  assert.ok(lehky < akorat && akorat < tezky, 'těžší trénink musí mít vyšší zátěž');
  assert.equal(akorat, 66); // 60 min × 1,1
  assert.equal(getWorkoutLoadPoints(zaklad), 66, 'bez hodnocení se násobí jedničkou');

  // U pohybových typů rozhoduje vzdálenost, ne čas.
  const behSKm = beh(serializeWorkoutNotesWithMeta('', { distance_km: 10 }), 60);
  assert.equal(getWorkoutLoadPoints(behSKm), 95); // 10 × 9,5
});
