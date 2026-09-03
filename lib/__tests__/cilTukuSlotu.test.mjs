// TUK NEMÁ NA CÍL ŽÁDNOU VAZBU — docs/DALSI_KROK.md 8.4.
//
// Zmereno na produkci na 140 dnech / 20 aktivnich planech: bilkoviny 94 %
// cile (45 % dnu v ±10 %), sacharidy 79 % (25 %), TUKY 148 % (jen 10 % dnu
// v ±10 %). Asymetrie je OBRACENA oproti bilkovinam: penalizuje se
// prestreleni, ne podstreleni.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  podilTuku,
  cilPodiluTukuProZbytekDne,
  penalizaceZaTuk,
  trefaTukuPoTypuJidla,
  MEZE_PODILU_TUKU,
} from '../nutrition/cilTukuSlotu.js';
import { MEZE_PODILU } from '../nutrition/cilBilkovinSlotu.js';
import { catalogPickRank, sortCatalogRowsForSimplePick } from '../recipeSimplicityScore.js';

test('podil tuku je energie z tuku deleno kcal', () => {
  // 20 g tuku = 180 kcal z 400 kcal = 45 %
  assert.equal(podilTuku(400, 20), 0.45);
  assert.equal(podilTuku(900, 10), 0.1);
});

test('bez pouzitelnych cisel se podil tuku nevymysli', () => {
  assert.equal(podilTuku(0, 20), null);
  assert.equal(podilTuku(400, null), null);
  assert.equal(podilTuku(null, null), null);
  assert.equal(podilTuku('nesmysl', 20), null);
  assert.equal(podilTuku(400, -5), null);
});

test('podil tuku se strope, aby jeden extrem (cisty olej) nezkreslil razeni', () => {
  assert.equal(podilTuku(100, 90), MEZE_PODILU_TUKU.MAX_PODIL);
});

test('strop tuku je vyssi nez bilkovinny — cisty tuk unese vetsi podil kalorii nez cista bilkovina', () => {
  assert.ok(MEZE_PODILU_TUKU.MAX_PODIL > MEZE_PODILU.MAX_PODIL);
});

test('cil pro zbytek dne klesa, kdyz uz den snedl hodne tuku', () => {
  // Den: 2634 kcal, cil 82 g tuku -> pocatecni narok 28 %
  const start = cilPodiluTukuProZbytekDne(2634, 82);
  assert.ok(Math.abs(start - 0.280) < 0.005, `start ${start}`);

  // Obed dal 700 kcal a 45 g tuku (vic, nez mel) -> zbytek musi byt prisnejsi
  const poObede = cilPodiluTukuProZbytekDne(2634 - 700, 82 - 45);
  assert.ok(poObede < start, `po obede ${poObede} musi byt min nez ${start}`);
});

test('kdyz je denni tuk uz vycerpany nebo prestrelely, narok na zbytek klesne na nulu', () => {
  assert.equal(cilPodiluTukuProZbytekDne(700, 0), 0);
  // Prestreleno o 5 g -> zaporny zbytek, porad nula (ne zaporny cil)
  assert.equal(cilPodiluTukuProZbytekDne(700, -5), 0);
});

test('bez zbylych kalorii se narok nepocita', () => {
  assert.equal(cilPodiluTukuProZbytekDne(0, 50), null);
  assert.equal(cilPodiluTukuProZbytekDne(null, 50), null);
});

test('penalizace tuku je nulova, kdyz cil neni znam', () => {
  assert.equal(penalizaceZaTuk({ kcal: 400, fat_g: 10 }, 500, null), 0);
});

test('recept bez maker se nepenalizuje ani nezvyhodnuje', () => {
  assert.equal(penalizaceZaTuk({ kcal: 400, fat_g: null }, 500, 0.28), 0);
});

test('OBRACENA asymetrie: prestreleni tuku boli vic nez podstreleni (opak bilkovin)', () => {
  const cil = 0.28;
  const slot = 800;
  const pod = penalizaceZaTuk({ kcal: 400, fat_g: 72 / 9 }, slot, cil); // podil 0,18 (pod cilem o 0,10)
  const nad = penalizaceZaTuk({ kcal: 400, fat_g: 152 / 9 }, slot, cil); // podil 0,38 (nad cilem o 0,10)
  // Stejna vzdalenost 0,10 na obe strany, ale nad cilem boli vic.
  assert.ok(nad > pod, `nad ${nad} musi byt vic nez pod ${pod}`);
  assert.equal(Math.round(pod), Math.round(slot * 0.10 * MEZE_PODILU_TUKU.VAHA_POD_CILEM_TUK));
  assert.equal(Math.round(nad), Math.round(slot * 0.10 * MEZE_PODILU_TUKU.VAHA_NAD_CILEM_TUK));
});

test('maximalni vaha tuku je nizsi nez bilkovinna — pri konfliktu vyhrajou bilkoviny', () => {
  assert.ok(MEZE_PODILU_TUKU.VAHA_NAD_CILEM_TUK < MEZE_PODILU.VAHA_POD_CILEM);
});

test('bez cile se rank chova jako pred zavedenim tuku', () => {
  const row = { kcal: 500, fat_g: 20, name_cs: 'Ovesná kaše', ingredients: [], instructions: [] };
  const bezCile = catalogPickRank(row, 500, 'breakfast');
  const nullCil = catalogPickRank(row, 500, 'breakfast', null, null);
  assert.equal(bezCile, nullCil);
});

test('pri stejnych kaloriich vyhraje recept blize cilovemu podilu tuku', () => {
  const tucny = { id: 1, kcal: 600, fat_g: 40, name_cs: 'Kuře se smetanovou omáčkou', ingredients: ['a', 'b'], instructions: ['1'] };
  const stedry = { id: 2, kcal: 600, fat_g: 18, name_cs: 'Kuře s rýží', ingredients: ['a', 'b'], instructions: ['1'] };

  assert.ok(
    catalogPickRank(stedry, 600, 'lunch', null, 0.28) < catalogPickRank(tucny, 600, 'lunch', null, 0.28),
    'blizsi cilovemu podilu tuku musi mit nizsi rank'
  );

  const poradi = sortCatalogRowsForSimplePick([tucny, stedry], 600, 'lunch', null, 0.28);
  assert.equal(poradi[0].id, 2, 'prvni musi byt recept blize cilovemu podilu tuku');
});

test('pri konfliktu bilkovin a tuku (stejna absolutni odchylka podilu) vyhraje recept presny na bilkoviny', () => {
  const cilBilkovin = 0.34;
  const cilTuku = 0.28;
  const odchylka = 0.10;
  const kcal = 600;

  // A: presny na bilkoviny, prestreli tuk o `odchylka`.
  const a = {
    id: 'a', kcal,
    protein_g: (cilBilkovin * kcal) / 4,
    fat_g: ((cilTuku + odchylka) * kcal) / 9,
    name_cs: 'Kuře A', ingredients: ['x'], instructions: ['1'],
  };
  // B: presny na tuk, podstreli bilkoviny o stejnou `odchylka`.
  const b = {
    id: 'b', kcal,
    protein_g: ((cilBilkovin - odchylka) * kcal) / 4,
    fat_g: (cilTuku * kcal) / 9,
    name_cs: 'Kuře B', ingredients: ['x'], instructions: ['1'],
  };
  assert.ok(
    catalogPickRank(a, kcal, 'lunch', cilBilkovin, cilTuku) < catalogPickRank(b, kcal, 'lunch', cilBilkovin, cilTuku),
    'stejne velka odchylka musi vazit min na tuku nez na bilkovinach'
  );
});

test('trefaTukuPoTypuJidla pocita prumerny podil zvlast pro kazdy meal_type', () => {
  const resolvedDny = [
    { meals: [
      { type: 'breakfast', kcal: 500, fat_g: 25 }, // 0,45
      { type: 'lunch', kcal: 700, fat_g: 14 },      // 0,18
    ] },
    { meals: [
      { type: 'breakfast', kcal: 500, fat_g: 15 }, // 0,27
      { type: 'lunch', kcal: 700, fat_g: 28 },      // 0,36
    ] },
  ];
  const vysledek = trefaTukuPoTypuJidla(resolvedDny);
  assert.equal(vysledek.breakfast.pocet, 2);
  assert.ok(Math.abs(vysledek.breakfast.prumerny_podil - 0.36) < 0.005);
  assert.equal(vysledek.lunch.pocet, 2);
  assert.ok(Math.abs(vysledek.lunch.prumerny_podil - 0.27) < 0.005);
});

test('trefaTukuPoTypuJidla preskoci jidla bez pouzitelnych maker', () => {
  const resolvedDny = [{ meals: [{ type: 'snack', kcal: 300, fat_g: null }] }];
  assert.deepEqual(trefaTukuPoTypuJidla(resolvedDny), {});
});

test('trefaTukuPoTypuJidla je bezpecna na prazdny/chybejici vstup', () => {
  assert.deepEqual(trefaTukuPoTypuJidla([]), {});
  assert.deepEqual(trefaTukuPoTypuJidla(null), {});
  assert.deepEqual(trefaTukuPoTypuJidla(undefined), {});
});
