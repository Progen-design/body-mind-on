// Strop na `uz_mame` v promptu generatoru — docs/DALSI_KROK.md.
//
// PROC TENHLE TEST EXISTUJE. Do 9. 9. 2026 sel do promptu CELY seznam nazvu
// receptu daneho chodu. Na produkci to bylo 306 nazvu pro `obed`, ~4 600
// tokenu z ~9 500 tokenu vstupu jedne davky, a rostlo to s katalogem — cena
// jednoho vygenerovaneho receptu tedy rostla s tim, kolik jich uz mame.
// Regrese by se v testech neprojevila nijak jinak nez tady: model se
// nevola, cena se nemeri a vsechno ostatni by dal prochazelo.
//
// Deduplikace na tomhle strope NEZAVISI — `isDuplicateRecipe()` porovnava
// proti celemu katalogu slotu v kodu, ne v promptu. Test to drzi explicitne
// (posledni pripad), aby nekdo pri ladeni stropu nezacal skrtat i tam.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGeneratorInput, MAX_UZ_MAME, isDuplicateRecipe } from '../recipeGenerator.js';
import { nazvyProPrompt } from '../recipeGeneratorRun.js';

const POLOZKA = { meal_type: 'obed', diet_tags: [], kcal_min: 450, kcal_max: 700 };

function nazvy(pocet, predpona = 'Recept') {
  return Array.from({ length: pocet }, (_, i) => `${predpona} ${i + 1}`);
}

test('uz_mame se orizne na MAX_UZ_MAME', () => {
  const vstup = buildGeneratorInput(POLOZKA, ['kuřecí prsa'], nazvy(306), 5);
  assert.equal(vstup.uz_mame.length, MAX_UZ_MAME);
});

test('orez bere PRVNI polozky, poradi od volajiciho tedy rozhoduje', () => {
  const vstup = buildGeneratorInput(POLOZKA, ['kuřecí prsa'], nazvy(306), 5);
  assert.equal(vstup.uz_mame[0], 'Recept 1');
  assert.equal(vstup.uz_mame[MAX_UZ_MAME - 1], `Recept ${MAX_UZ_MAME}`);
});

test('kratsi seznam nez strop projde beze zmeny', () => {
  const vstup = buildGeneratorInput(POLOZKA, ['kuřecí prsa'], ['Kuřecí salát'], 5);
  assert.deepEqual(vstup.uz_mame, ['Kuřecí salát']);
});

test('chybejici seznam nespadne, vrati prazdne pole', () => {
  const vstup = buildGeneratorInput(POLOZKA, ['kuřecí prsa'], undefined, 5);
  assert.deepEqual(vstup.uz_mame, []);
});

test('nazvyProPrompt bez hlavni bilkoviny nemeni poradi a vyhodi prazdne nazvy', () => {
  const existujici = [
    { name_cs: 'Losos s bramborem', ingredients: [{ name: 'losos', amount: 150 }] },
    { name_cs: null, ingredients: [] },
    { name_cs: 'Kuřecí salát', ingredients: [{ name: 'kuřecí prsa', amount: 150 }] },
  ];
  assert.deepEqual(nazvyProPrompt(existujici), ['Losos s bramborem', 'Kuřecí salát']);
});

test('nazvyProPrompt da recepty se stejnou hlavni bilkovinou dopredu', () => {
  const existujici = [
    { name_cs: 'Losos s bramborem', ingredients: [{ name: 'losos', amount: 150 }] },
    { name_cs: 'Čočka na kyselo', ingredients: [{ name: 'čočka', amount: 120 }] },
    { name_cs: 'Kuřecí salát', ingredients: [{ name: 'kuřecí prsa', amount: 150 }] },
    { name_cs: 'Kuřecí kari', ingredients: [{ name: 'kuřecí prsa', amount: 180 }] },
  ];
  assert.deepEqual(
    nazvyProPrompt(existujici, 'drubez'),
    ['Kuřecí salát', 'Kuřecí kari', 'Losos s bramborem', 'Čočka na kyselo'],
  );
});

test('recept s hlavni bilkovinou pod hranici gramaze neni "shoda"', () => {
  // 20 g kureciho je ochuceni, ne porce (MIN_GRAMU_HLAVNI = 40).
  const existujici = [
    { name_cs: 'Zeleninový vývar s kouskem kuřete', ingredients: [{ name: 'kuřecí prsa', amount: 20 }] },
    { name_cs: 'Kuřecí kari', ingredients: [{ name: 'kuřecí prsa', amount: 180 }] },
  ];
  assert.deepEqual(
    nazvyProPrompt(existujici, 'drubez'),
    ['Kuřecí kari', 'Zeleninový vývar s kouskem kuřete'],
  );
});

test('strop v promptu NEOSLABUJE deduplikaci — ta jede proti celemu katalogu', () => {
  const existujici = nazvy(300).map((n) => ({ name_cs: n, ingredients: [{ name: 'rýže', amount: 100 }] }));
  // "Recept 300" je az za stropem promptu, presto ho dedup musi najit.
  const vstup = buildGeneratorInput(POLOZKA, ['rýže'], nazvyProPrompt(existujici), 5);
  assert.ok(!vstup.uz_mame.includes('Recept 300'));
  const dup = isDuplicateRecipe(
    { name_cs: 'Recept 300', ingredients: [{ name: 'rýže', amount: 100 }] },
    existujici,
  );
  assert.equal(dup.duplicita, true);
});