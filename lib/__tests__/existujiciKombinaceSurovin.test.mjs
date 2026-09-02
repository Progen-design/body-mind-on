/**
 * GENERÁTOR OPAKUJE SUROVINY — docs/DALSI_KROK.md 8.6(a).
 *
 * Změřeno naostro: z 5 receptů se 4 zahodily kvůli `prunik_surovin`, všechny
 * proti položkám, které v katalogu UŽ BYLY. `uz_mame` posílá jen názvy a
 * model si podle nich shodu nevšiml. `existujiciKombinaceSurovin()` posílá
 * konkrétní suroviny — jednoznačnější signál, na kterém nezáleží, jak recept
 * pojmenuje.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeneratorInput,
  existujiciKombinaceSurovin,
  MAX_KOMBINACI_V_PROMPTU,
} from '../recipeGenerator.js';

const ing = (...jmena) => jmena.map((name) => ({ name, amount: 100, unit: 'g' }));

test('vrátí kombinaci jako čitelný řetězec surovin oddělený čárkou', () => {
  const existujici = [{ name_cs: 'Banánové plátky s arašídovým máslem a chia', ingredients: ing('banán', 'arašídové máslo', 'chia semínka') }];
  const v = existujiciKombinaceSurovin(existujici);
  assert.deepEqual(v, ['banán, arašídové máslo, chia semínka']);
});

test('porcové varianty téhož jídla se sloučí na jednu kombinaci', () => {
  // Stejný problém, který pestrostReceptu.js řeší přes zakladNazvuJidla —
  // tady řeší normalizovaná množina surovin totéž.
  const existujici = [
    { name_cs: 'Kuře s bramborem — porce 180/300', ingredients: ing('kuřecí prsa', 'brambory', 'olivový olej') },
    { name_cs: 'Kuře s bramborem — porce 150/350', ingredients: ing('Kuřecí prsa', 'Brambory', 'Olivový olej') },
    { name_cs: 'Kuře s bramborem — porce 200/250', ingredients: ing('kuřecí prsa', 'brambory', 'olivový olej') },
  ];
  const v = existujiciKombinaceSurovin(existujici);
  assert.equal(v.length, 1, 'tři porcové varianty musí dát jednu kombinaci');
});

test('různé kombinace zůstávají různé položky', () => {
  const existujici = [
    { name_cs: 'A', ingredients: ing('banán', 'ovesné vločky') },
    { name_cs: 'B', ingredients: ing('vejce', 'špenát') },
  ];
  const v = existujiciKombinaceSurovin(existujici);
  assert.equal(v.length, 2);
});

test('recept bez surovin se přeskočí, ne že by vyrobil prázdnou položku', () => {
  const existujici = [{ name_cs: 'Bez ingrediencí', ingredients: [] }, { name_cs: 'Taky bez', ingredients: null }];
  assert.deepEqual(existujiciKombinaceSurovin(existujici), []);
});

test('prázdný nebo chybějící vstup nespadne', () => {
  assert.deepEqual(existujiciKombinaceSurovin([]), []);
  assert.deepEqual(existujiciKombinaceSurovin(null), []);
  assert.deepEqual(existujiciKombinaceSurovin(undefined), []);
});

test('ořízne se na strop MAX_KOMBINACI_V_PROMPTU', () => {
  const existujici = Array.from({ length: MAX_KOMBINACI_V_PROMPTU + 20 }, (_, i) => ({
    name_cs: `Recept ${i}`,
    ingredients: ing(`surovina-${i}`),
  }));
  const v = existujiciKombinaceSurovin(existujici);
  assert.equal(v.length, MAX_KOMBINACI_V_PROMPTU);
});

test('vlastní strop (limit) jde zadat explicitně', () => {
  const existujici = Array.from({ length: 10 }, (_, i) => ({ name_cs: `R${i}`, ingredients: ing(`s${i}`) }));
  assert.equal(existujiciKombinaceSurovin(existujici, 3).length, 3);
});

// ------------------------------------------- buildGeneratorInput integrace

test('buildGeneratorInput pošle existujici_kombinace_surovin, když nějaké jsou', () => {
  const polozka = { meal_type: 'svacina', diet_tags: [], kcal_min: 170, kcal_max: 370 };
  const vstup = buildGeneratorInput(
    polozka, ['banán', 'arašídové máslo'], ['Banánový toast'], 5,
    [], null, null, ['banán, arašídové máslo, chia semínka'],
  );
  assert.deepEqual(vstup.existujici_kombinace_surovin, ['banán, arašídové máslo, chia semínka']);
});

test('buildGeneratorInput bez kombinací pole vůbec nepřidá', () => {
  const polozka = { meal_type: 'svacina', diet_tags: [], kcal_min: 170, kcal_max: 370 };
  const vstup = buildGeneratorInput(polozka, ['banán'], ['Banánový toast'], 5);
  assert.equal('existujici_kombinace_surovin' in vstup, false);
});
