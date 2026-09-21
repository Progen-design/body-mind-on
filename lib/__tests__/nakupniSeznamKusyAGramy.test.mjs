// „banán 135 g" a „banán 3 ks" jako dva řádky — 21. 9. 2026, po tisku do PDF.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateShoppingIngredientLines } from '../shoppingListAggregate.js';
import { PIECE_WEIGHT_G } from '../ingredientAliasSeed.js';

const radky = (l) => aggregateShoppingIngredientLines(l);
const bananove = (l) => l.filter((r) => /banán|banan/i.test(r));

test('banán v gramech i kusech je jeden řádek', () => {
  const vysledek = bananove(radky(['banán 135 g', 'banán 3 ks']));
  assert.equal(vysledek.length, 1, `čekal jsem jeden řádek, je: ${vysledek.join(' | ')}`);
  // 135 g + 3 × 120 g = 495 g, zaokrouhleno na 5 g
  assert.match(vysledek[0], /495\s*g/);
});

test('samotné kusy zůstanou kusy', () => {
  const vysledek = bananove(radky(['banán 2 ks', 'banán 1 ks']));
  assert.equal(vysledek.length, 1);
  assert.match(vysledek[0], /3\s*(ks|kusy|kusů)/);
});

test('vejce g + ks se sloučí podle váhy kusu 55 g', () => {
  const vysledek = radky(['vejce 110 g', 'vejce 2 ks']).filter((r) => /vejc/i.test(r));
  assert.equal(vysledek.length, 1, vysledek.join(' | '));
  assert.match(vysledek[0], /220\s*g/);
});

test('bez známé váhy kusu zůstanou dva řádky, ne špatný součet', () => {
  assert.equal(PIECE_WEIGHT_G['kureci prsa'], undefined, 'kus masa nemá mít pevnou váhu');
  const vysledek = radky(['kuřecí prsa 300 g', 'kuřecí prsa 2 ks']).filter((r) => /ku[řr]ec/i.test(r));
  assert.equal(vysledek.length, 2, vysledek.join(' | '));
});
