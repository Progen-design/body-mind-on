/**
 * Pořadí kandidátů z katalogu musí být deterministické, reprodukovatelné podle
 * seedu a nesmí zvýhodňovat nízká ani vysoká id.
 *
 * PROČ TENHLE TEST EXISTUJE. `fetchCatalogCandidates` volalo `.limit()` BEZ
 * `ORDER BY`, takže Postgres vracel libovolné řádky — dvě stejná volání mohla
 * dát jinou množinu. Zároveň bylo v okně oběda 166 receptů proti stropu 150,
 * takže se 16 zahazovalo, a katalog roste ~33 receptů denně. Míchalo se navíc
 * `Math.random()`, takže se plán nedal reprodukovat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  seededShuffle,
  seededRandom,
  mixSeed,
  CATALOG_FETCH_CEILING,
} from '../catalogCandidateOrder.js';

const ZDROJ = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'recipesCatalog.js'),
  'utf8'
);

/** 166 receptů = dnešní okno oběda, tedy přesně případ, kdy se řezalo. */
const RADKY = Array.from({ length: 166 }, (_, i) => ({ id: 1000 + i * 7 }));
const ids = (rows) => rows.map((r) => r.id);

test('stejný seed vrátí totožné pořadí', () => {
  const a = seededShuffle(RADKY, 123456789);
  const b = seededShuffle(RADKY, 123456789);
  assert.deepEqual(ids(a), ids(b));
});

test('jiný seed vrátí jiné pořadí', () => {
  const a = seededShuffle(RADKY, 123456789);
  const b = seededShuffle(RADKY, 987654321);
  assert.notDeepEqual(ids(a), ids(b));
});

test('zamíchání nic neztratí ani nezduplikuje a nemodifikuje vstup', () => {
  const puvodni = ids(RADKY);
  const out = seededShuffle(RADKY, 42);
  assert.equal(out.length, RADKY.length);
  assert.deepEqual([...ids(out)].sort((x, y) => x - y), [...puvodni].sort((x, y) => x - y));
  assert.deepEqual(ids(RADKY), puvodni, 'vstupní pole se nesmí přepsat');
});

test('nezvýhodňuje nízká ani vysoká id', () => {
  // Kdyby pořadí korelovalo s id (jako ORDER BY id + limit), byla by první
  // polovina výstupu plná nízkých id. Přes 200 seedů se to musí vyrovnat.
  const stred = RADKY.length / 2;
  let nizkychVPrvniPulce = 0;
  const SEEDU = 200;
  for (let s = 1; s <= SEEDU; s++) {
    const out = seededShuffle(RADKY, s * 2654435761);
    const prvniPulka = out.slice(0, stred);
    nizkychVPrvniPulce += prvniPulka.filter((r) => r.id < RADKY[stred].id).length;
  }
  const prumer = nizkychVPrvniPulce / SEEDU;
  // Nezaujaté míchání dá v průměru polovinu z 83, tedy ~41,5.
  assert.ok(
    prumer > stred * 0.4 && prumer < stred * 0.6,
    `nízkých id v první půlce průměrně ${prumer.toFixed(1)}, čekáno kolem ${(stred / 2).toFixed(1)} — pořadí koreluje s id`
  );
});

test('krajní vstupy nespadnou', () => {
  assert.deepEqual(seededShuffle([], 1), []);
  assert.deepEqual(ids(seededShuffle([{ id: 5 }], 1)), [5]);
  assert.deepEqual(seededShuffle(null, 1), []);
});

test('seededRandom je deterministický a drží se v [0,1)', () => {
  const a = seededRandom(mixSeed(7, 0));
  const b = seededRandom(mixSeed(7, 0));
  for (let i = 0; i < 50; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1, `hodnota ${x} mimo [0,1)`);
  }
});

test('dotaz do katalogu má ORDER BY před LIMITem', () => {
  const dotaz = ZDROJ.match(/from\('recipes_catalog'\)[\s\S]*?\.limit\(fetchLimit\);/);
  assert.ok(dotaz, 'dotaz na recipes_catalog s .limit(fetchLimit) se nenašel');
  assert.match(
    dotaz[0],
    /\.order\(\s*'id'/,
    'chybí .order() — bez řazení vrací Postgres libovolné řádky'
  );
  const poradiOrder = dotaz[0].indexOf(".order('id'");
  const poradiLimit = dotaz[0].indexOf('.limit(fetchLimit)');
  assert.ok(poradiOrder < poradiLimit, '.order() musí být PŘED .limit()');
});

test('strop načtení pokrývá celý katalog a Math.random se nepoužívá se seedem', () => {
  // Katalog má dnes ~570 receptů celkem, na slot ~166 v okně.
  assert.ok(CATALOG_FETCH_CEILING >= 1000, `strop ${CATALOG_FETCH_CEILING} je nízký`);
  assert.match(ZDROJ, /const fetchLimit = CATALOG_FETCH_CEILING/, 'fetchLimit musí brát strop z konstanty');
  assert.match(ZDROJ, /seededShuffle\(rows, seed, rows\.length\)/, 'se seedem se musí míchat seedovaně');
  assert.match(ZDROJ, /STROP NACTENI VYCERPAN/, 'vyčerpání stropu se musí logovat');
});
