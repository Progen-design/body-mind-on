/**
 * Klíč odškrtnutého jídla — regrese k bugu z testování trenérem (15. 8. 2026).
 *
 * „Splněno“ u jedné svačiny zaškrtlo obě. Příčina: `mealActivityKey` vracel
 * holý `meal.type`, takže dvě svačiny v jednom dni měly týž klíč. Kromě
 * checkboxu tím padal i počet splněných aktivit — jedno odškrtnutí se
 * započítalo dvakrát.
 *
 * Reálný den z plánu 76bdeee1: breakfast, lunch, snack, snack, dinner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mealActivityKey, completionsToSet, applyOptimisticToggle } from '../dailyActivationClient.js';

const DEN = [
  { type: 'breakfast' },
  { type: 'lunch' },
  { type: 'snack' },
  { type: 'snack' },
  { type: 'dinner' },
];

test('dvě svačiny v jednom dni mají různý klíč', () => {
  const klice = DEN.map((m, i) => mealActivityKey(m, i));
  assert.equal(new Set(klice).size, DEN.length, `klíče se opakují: ${klice.join(', ')}`);
  assert.notEqual(klice[2], klice[3], 'obě svačiny nesmí sdílet klíč');
});

test('odškrtnutí jedné svačiny nezaškrtne druhou', () => {
  const klicPrvni = mealActivityKey(DEN[2], 2);
  const klicDruha = mealActivityKey(DEN[3], 3);

  const po = applyOptimisticToggle([], 'meal', klicPrvni, false);
  const set = completionsToSet(po);

  assert.equal(set.has(`meal:${klicPrvni}`), true, 'odškrtnutá svačina je splněná');
  assert.equal(set.has(`meal:${klicDruha}`), false, 'druhá svačina zůstává nesplněná');
});

test('jedno odškrtnutí se do průběhu dne započítá jednou', () => {
  const klice = DEN.map((m, i) => mealActivityKey(m, i));
  const set = completionsToSet(applyOptimisticToggle([], 'meal', klice[2], false));
  const splneno = klice.filter((k) => set.has(`meal:${k}`)).length;
  assert.equal(splneno, 1, 'počítadlo nesmí započítat totéž jídlo dvakrát');
});

test('klíč je stabilní — stejné jídlo na stejné pozici dá totéž', () => {
  assert.equal(mealActivityKey({ type: 'snack' }, 2), mealActivityKey({ type: 'snack' }, 2));
  assert.equal(mealActivityKey({ type: 'SNACK' }, 2), mealActivityKey({ type: 'snack' }, 2));
  assert.equal(mealActivityKey({ meal_type: 'snack' }, 2), mealActivityKey({ type: 'snack' }, 2));
});

test('chybějící typ i index nerozbijí klíč', () => {
  assert.equal(typeof mealActivityKey(null, 0), 'string');
  assert.equal(mealActivityKey(null, 0).length > 0, true);
  assert.notEqual(mealActivityKey(null, 0), mealActivityKey(null, 1));
  assert.equal(mealActivityKey({ type: 'snack' }, undefined).length > 0, true);
});

test('klíč se vejde do limitu sloupce (80 znaků)', () => {
  const dlouhy = { type: 'x'.repeat(200) };
  assert.ok(mealActivityKey(dlouhy, 3).length <= 80);
});
