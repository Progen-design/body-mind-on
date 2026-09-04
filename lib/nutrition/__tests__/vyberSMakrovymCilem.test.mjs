/**
 * PŘEDNOSTNÍ POOL PODLE TUKU VE VÝBĚRU — docs/DALSI_KROK.md 8.11.
 *
 * 8.11 navazuje na 8.4/8.8: penalta v `catalogPickRank` je spojitá a dá se
 * "přeplatit" kalorickou trefou, a losování z TOP-K ji dál rozřeďuje. Řešení
 * není (jen) zvednout váhu — to jen posune hranici přeplacení. Skutečná
 * oprava je TVRDÝ STROP na to, kdo se vůbec dostane do užšího výběru
 * (`prednostniPoolPodleTuku`, lib/nutrition/cilTukuSlotu.js), mirror vzoru,
 * který `sortCatalogRowsForSimplePick` používá pro `simplicity`.
 *
 * Bod 1 (stejné zadání): nouzová větev "TITLE/FILTER MISS" dřív makra
 * neznala vůbec — `pickClosestCatalogRow` je musí zohledňovat úplně stejně
 * jako `pickFromTopKCatalogRow`, jinak by ladění/pool část plánů minulo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickFromTopKCatalogRow,
  pickClosestCatalogRow,
} from '../portionScaling.js';
import { STROP_TUKU_VYBERU } from '../cilTukuSlotu.js';

function recept(id, kcal, fatG, proteinG = 20) {
  return {
    id, kcal, fat_g: fatG, protein_g: proteinG,
    name_cs: `Recept ${id}`, ingredients: ['a'], instructions: ['1'],
  };
}

const podilNaGramy = (podil, kcal) => (podil * kcal) / 9;

// ------------------------------------------------- bez cíle na tuk = beze změny

test('bez cílového podílu tuku zůstává variabilita na plných topK (beze změny chování)', () => {
  // Pět receptů se stejnými kcal — bez cíle na tuk se má vybírat ze všech
  // pěti podle seedu, přesně jako dřív (starší volání bez cilovyPodilTuku).
  const rows = Array.from({ length: 5 }, (_, i) => recept(`r${i}`, 700, 20));
  const vybrane = new Set();
  for (let salt = 0; salt < 50; salt += 1) {
    const r = pickFromTopKCatalogRow(rows, 700, 12345, salt, 5, {});
    vybrane.add(r.id);
  }
  assert.ok(vybrane.size > 2, `bez cíle na tuk by se mělo protočit víc než 2 z 5, protočilo se ${vybrane.size}`);
});

// ------------------------------------------------- přednostní pool funguje

test('PŘI DOSTATKU LIBOVÝCH KANDIDÁTŮ se tučný nedostane do losování', () => {
  const slot = 700;
  const cilTuku = 0.28;
  // 6 libových (do STROP_TUKU_VYBERU = 0,35) + 2 tučné (nad strop). Přednostní
  // pool má 6 kandidátů, což je >= topK (5) — tučné se do losování nedostanou.
  const libove = Array.from({ length: 6 }, (_, i) =>
    recept(`libovy${i}`, slot, podilNaGramy(0.20 + i * 0.02, slot)));
  const tucne = [
    recept('tucny1', slot, podilNaGramy(0.50, slot)),
    recept('tucny2', slot, podilNaGramy(0.60, slot)),
  ];
  const rows = [...libove, ...tucne];

  const vybrane = new Set();
  for (let salt = 0; salt < 80; salt += 1) {
    const r = pickFromTopKCatalogRow(rows, slot, 777, salt, 5, { cilovyPodilTuku: cilTuku });
    vybrane.add(r.id);
  }
  assert.ok(!vybrane.has('tucny1'), 'tučný recept se nesmí vylosovat, když je dost libových');
  assert.ok(!vybrane.has('tucny2'), 'tučný recept se nesmí vylosovat, když je dost libových');
});

test('KDYŽ JE LIBOVÝCH MÍŇ NEŽ topK, pool se doplní zbytkem a nic nespadne', () => {
  const slot = 700;
  const cilTuku = 0.28;
  // Jen 2 libové, topK = 5 -> přednostní pool (2) je pod stropem, doplní se
  // zbytkem (tučnými), aby losování mělo z čeho vybírat.
  const rows = [
    recept('libovy0', slot, podilNaGramy(0.25, slot)),
    recept('libovy1', slot, podilNaGramy(0.30, slot)),
    recept('tucny0', slot, podilNaGramy(0.45, slot)),
    recept('tucny1', slot, podilNaGramy(0.50, slot)),
    recept('tucny2', slot, podilNaGramy(0.55, slot)),
  ];
  for (let salt = 0; salt < 30; salt += 1) {
    const r = pickFromTopKCatalogRow(rows, slot, 42, salt, 5, { cilovyPodilTuku: cilTuku });
    assert.ok(r, `pick nesmí spadnout ani vrátit nic (salt ${salt})`);
    assert.ok(rows.some((x) => x.id === r.id), 'vybraný recept musí být z původního poolu');
  }
});

test('topK = 1 a prázdný vstup nespadnou', () => {
  const slot = 700;
  const rows = [recept('a', slot, 20), recept('b', slot, 20)];
  const r = pickFromTopKCatalogRow(rows, slot, 1, 1, 1, { cilovyPodilTuku: 0.28 });
  assert.ok(r);

  assert.equal(pickFromTopKCatalogRow([], slot, 1, 1, 5, { cilovyPodilTuku: 0.28 }), null);
  assert.equal(pickFromTopKCatalogRow(null, slot, 1, 1, 5, { cilovyPodilTuku: 0.28 }), null);
});

// --------------------------------- diagnostika (docs/DALSI_KROK.md 8.11 bod 5)

test('diag.vyberZPrednostnihoPoolu = true, když pool stačil', () => {
  const slot = 700;
  const rows = Array.from({ length: 6 }, (_, i) =>
    recept(`libovy${i}`, slot, podilNaGramy(0.20 + i * 0.02, slot)));
  const diag = {};
  pickFromTopKCatalogRow(rows, slot, 1, 1, 5, { cilovyPodilTuku: 0.28, diag });
  assert.equal(diag.vyberZPrednostnihoPoolu, true);
});

test('diag.vyberZPrednostnihoPoolu = false, když pool nestačil (doplnilo se zbytkem)', () => {
  const slot = 700;
  const rows = [
    recept('libovy0', slot, podilNaGramy(0.25, slot)),
    recept('tucny0', slot, podilNaGramy(0.50, slot)),
  ];
  const diag = {};
  pickFromTopKCatalogRow(rows, slot, 1, 1, 5, { cilovyPodilTuku: 0.28, diag });
  assert.equal(diag.vyberZPrednostnihoPoolu, false);
});

test('diag.vyberZPrednostnihoPoolu = null, když cíl na tuk vůbec nebyl zadaný', () => {
  const slot = 700;
  const rows = [recept('a', slot, 20), recept('b', slot, 20)];
  const diag = {};
  pickFromTopKCatalogRow(rows, slot, 1, 1, 5, { diag });
  assert.equal(diag.vyberZPrednostnihoPoolu, null);
});

// ------------------------------------ bod 1: nouzová větev znala kalorie, ne makra

test('OPRAVA BODU 1: pickClosestCatalogRow s cílovým podílem tuku vybere libovější recept než bez něj', () => {
  const slot = 700;
  const cilTuku = 0.28;
  const presny = recept('presny', slot, podilNaGramy(cilTuku, slot));
  const tucny = recept('tucny', slot, podilNaGramy(0.45, slot));

  // Stejné kcal u obou (kcalDiff=0), liší se jen tukem — bez opravy by tahle
  // nouzová větev makra vůbec neřešila (defaultovala na null) a výsledek by
  // závisel jen na pořadí vstupu, ne na tuku.
  const sCilem = pickClosestCatalogRow([tucny, presny], slot, { cilovyPodilTuku: cilTuku });
  assert.equal(sCilem.id, 'presny', 's cílovým podílem tuku musí vyhrát libovější recept');
});

test('bez zadaného cíle se pickClosestCatalogRow chová jako dřív (jen kalorie)', () => {
  const slot = 700;
  const blizsiATucnejsi = recept('a', 700, 60);
  const dalsiALibovejsi = recept('b', 650, 10);
  const vybrano = pickClosestCatalogRow([dalsiALibovejsi, blizsiATucnejsi], slot);
  assert.equal(vybrano.id, 'a', 'bez cíle rozhoduje jen kalorická blízkost');
});

test('pickClosestCatalogRow zapíše diag stejně jako pickFromTopKCatalogRow', () => {
  const slot = 700;
  const rows = [recept('presny', slot, podilNaGramy(0.28, slot)), recept('tucny', slot, podilNaGramy(0.5, slot))];
  const diag = {};
  pickClosestCatalogRow(rows, slot, { cilovyPodilTuku: 0.28, diag });
  assert.equal(diag.vyberZPrednostnihoPoolu, true);

  const diagBezCile = {};
  pickClosestCatalogRow(rows, slot, { diag: diagBezCile });
  assert.equal(diagBezCile.vyberZPrednostnihoPoolu, null);
});

test('STROP_TUKU_VYBERU je 0,35 (navržená hodnota z měření 4. 9. 2026)', () => {
  assert.equal(STROP_TUKU_VYBERU, 0.35);
});
