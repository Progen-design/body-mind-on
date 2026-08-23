// Bilkoviny musi vstupovat do vyberu jidla, ne byt vedlejsim produktem katalogu.
//
// Merene na produkci 23. 8. 2026 na vsech aktivnich planech: kalorie sedely
// vzdy do 2 %, bilkoviny se rozjely tim vic, cim vyssi byl cil.
//   cil 158 g -> 150 g (95 %)      cil 185 g -> 106 g (57 %)
//   cil 161 g -> 168 g (104 %)     cil 234 g -> 196 g (84 %)
// Duvod: catalogPickRank pocital jen |kcal - cil| a skore jednoduchosti.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  podilBilkovin,
  cilPodiluProZbytekDne,
  penalizaceZaBilkoviny,
  MEZE_PODILU,
} from '../nutrition/cilBilkovinSlotu.js';
import { catalogPickRank, sortCatalogRowsForSimplePick } from '../recipeSimplicityScore.js';

test('podil bilkovin je energie z bilkovin deleno kcal', () => {
  // 40 g bilkovin = 160 kcal ze 400 kcal = 40 %
  assert.equal(podilBilkovin(400, 40), 0.4);
  assert.equal(podilBilkovin(800, 20), 0.1);
});

test('bez pouzitelnych cisel se podil nevymysli', () => {
  assert.equal(podilBilkovin(0, 40), null);
  assert.equal(podilBilkovin(400, null), null);
  assert.equal(podilBilkovin(null, null), null);
  assert.equal(podilBilkovin('nesmysl', 40), null);
  assert.equal(podilBilkovin(400, -5), null);
});

test('podil se strope, aby jeden extrem nezkreslil razeni', () => {
  assert.equal(podilBilkovin(100, 90), MEZE_PODILU.MAX_PODIL);
});

test('cil pro zbytek dne roste, kdyz snidane dodala malo bilkovin', () => {
  // Den: 2164 kcal, 185 g bilkovin -> pocatecni narok 34 %
  const start = cilPodiluProZbytekDne(2164, 185);
  assert.ok(Math.abs(start - 0.342) < 0.005, `start ${start}`);

  // Snidane dala 435 kcal a jen 11 g bilkovin -> zbytek musi utahnout vic
  const poSnidani = cilPodiluProZbytekDne(2164 - 435, 185 - 11);
  assert.ok(poSnidani > start, `po snidani ${poSnidani} musi byt vic nez ${start}`);
  assert.ok(Math.abs(poSnidani - 0.402) < 0.005, `po snidani ${poSnidani}`);
});

test('kdyz je cil bilkovin splneny, narok na zbytek klesne na nulu', () => {
  assert.equal(cilPodiluProZbytekDne(700, 0), 0);
  assert.equal(cilPodiluProZbytekDne(700, -3), 0);
});

test('bez zbylych kalorii se narok nepocita', () => {
  assert.equal(cilPodiluProZbytekDne(0, 50), null);
  assert.equal(cilPodiluProZbytekDne(null, 50), null);
});

test('penalizace je nulova, kdyz cil neni znam', () => {
  assert.equal(penalizaceZaBilkoviny({ kcal: 400, protein_g: 10 }, 500, null), 0);
});

test('recept bez maker se nepenalizuje ani nezvyhodnuje', () => {
  assert.equal(penalizaceZaBilkoviny({ kcal: 400, protein_g: null }, 500, 0.34), 0);
});

test('nedosazeni cile se penalizuje vic nez prekroceni', () => {
  const cil = 0.30;
  const slot = 800;
  const pod = penalizaceZaBilkoviny({ kcal: 400, protein_g: 20 }, slot, cil); // podil 0,20
  const nad = penalizaceZaBilkoviny({ kcal: 400, protein_g: 40 }, slot, cil); // podil 0,40
  // Stejna vzdalenost 0,10 na obe strany, ale pod cilem boli vic.
  assert.ok(pod > nad, `pod ${pod} musi byt vic nez nad ${nad}`);
  assert.equal(Math.round(pod), Math.round(slot * 0.10 * MEZE_PODILU.VAHA_POD_CILEM));
  assert.equal(Math.round(nad), Math.round(slot * 0.10 * MEZE_PODILU.VAHA_NAD_CILEM));
});

test('bez cile se rank chova jako pred zavedenim bilkovin', () => {
  const row = { kcal: 500, protein_g: 10, name_cs: 'Ovesná kaše', ingredients: [], instructions: [] };
  const bezCile = catalogPickRank(row, 500, 'breakfast');
  const nullCil = catalogPickRank(row, 500, 'breakfast', null);
  assert.equal(bezCile, nullCil);
});

test('pri stejnych kaloriich vyhraje recept s vic bilkovinami', () => {
  const chudy = { id: 1, kcal: 600, protein_g: 12, name_cs: 'Rýže se zeleninou', ingredients: ['a', 'b'], instructions: ['1'] };
  const bohaty = { id: 2, kcal: 600, protein_g: 45, name_cs: 'Kuře s rýží', ingredients: ['a', 'b'], instructions: ['1'] };

  assert.ok(
    catalogPickRank(bohaty, 600, 'lunch', 0.34) < catalogPickRank(chudy, 600, 'lunch', 0.34),
    'bohatsi na bilkoviny musi mit nizsi rank'
  );

  const poradi = sortCatalogRowsForSimplePick([chudy, bohaty], 600, 'lunch', 0.34);
  assert.equal(poradi[0].id, 2, 'prvni musi byt recept s vic bilkovinami');
});

test('bilkoviny neprebiji kalorie uplne — recept mimo pasmo neprojde nahoru', () => {
  // Bilkovinovy, ale o 400 kcal vedle. Slaby, ale kaloricky presny.
  const mimoPasmo = { id: 1, kcal: 200, protein_g: 30, name_cs: 'Tvaroh', ingredients: ['a'], instructions: ['1'] };
  const presny = { id: 2, kcal: 600, protein_g: 30, name_cs: 'Kuře s rýží', ingredients: ['a'], instructions: ['1'] };
  assert.ok(
    catalogPickRank(presny, 600, 'lunch', 0.30) < catalogPickRank(mimoPasmo, 600, 'lunch', 0.30),
    'kaloricky presny recept se stejnym podilem musi vyhrat'
  );
});
