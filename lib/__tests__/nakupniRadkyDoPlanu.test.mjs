/**
 * Preskladani nakupnich radku z katalogu pri cteni profilu.
 *
 * Zmereno na produkci 22. 8. 2026: vsech 325 surovin ve 105 jidlech aktivnich
 * planu ma v katalogu `amount` i `unit` a ceske nazvy. Vady, ktere uzivatel
 * videl, byly zmrazene v ulozenem planu, ne v katalogu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  radkyProJidlo,
  pridejNakupniRadkyDoPlanu,
  SLOUPCE_KATALOGU_PRO_SUROVINY,
} from '../profile/nakupniRadkyDoPlanu.js';

const SUROVINY = [
  { name: 'ananas', unit: 'g', amount: 150 },
  { name: 'mandle', unit: 'g', amount: 30 },
  { name: 'citronová šťáva', unit: 'ml', amount: 10 },
];

function plan(jidlo) {
  return [{ id: 'p1', structured_plan_json: { days: [{ date: '2026-08-23', meals: [jidlo] }] } }];
}

test('radky se skladaji z katalogu, ne z ulozeneho textu', () => {
  const radky = radkyProJidlo(SUROVINY, 1);
  assert.deepEqual(radky, ['150 g ananas', '30 g mandle', '10 ml citronová šťáva']);
});

test('mnozstvi se skaluje podle porce jidla', () => {
  const radky = radkyProJidlo(SUROVINY, 1.2);
  // Kazdy radek musi nest cislo — prave o to stare plany prisly.
  for (const r of radky) assert.match(r, /\d/, `radek bez mnozstvi: ${r}`);
  assert.notDeepEqual(radky, radkyProJidlo(SUROVINY, 1), 'skalovani se neprojevilo');
});

test('neplatny nasobek spadne na zakladni porci, nespadne cely profil', () => {
  for (const spatny of [null, undefined, 0, -1, 'x', NaN]) {
    assert.deepEqual(radkyProJidlo(SUROVINY, spatny), radkyProJidlo(SUROVINY, 1));
  }
});

test('anglicke zbytky a rozseknuty zlomek se prepisou', () => {
  const jidlo = {
    catalog_id: 853,
    portion_multiplier: 1,
    shopping_ingredient_lines: ['whites', 'old fashioned oats', '1 /', 'Salt to taste'],
  };
  const plany = plan(jidlo);

  assert.equal(pridejNakupniRadkyDoPlanu(plany, new Map([['853', SUROVINY]])), 1);
  assert.deepEqual(jidlo.shopping_ingredient_lines,
    ['150 g ananas', '30 g mandle', '10 ml citronová šťáva']);
});

test('bez katalogovych surovin zustava puvodni seznam', () => {
  // Prazdny nakupni seznam je horsi nez seznam s vadou.
  const puvodni = ['nějaká surovina'];
  const jidlo = { catalog_id: 999, shopping_ingredient_lines: puvodni };
  const plany = plan(jidlo);

  assert.equal(pridejNakupniRadkyDoPlanu(plany, new Map()), 0);
  assert.deepEqual(jidlo.shopping_ingredient_lines, puvodni);

  // Ani prazdne pole surovin nesmi seznam vymazat.
  assert.equal(pridejNakupniRadkyDoPlanu(plany, new Map([['999', []]])), 0);
  assert.deepEqual(jidlo.shopping_ingredient_lines, puvodni);
});

test('prepis je idempotentni', () => {
  const jidlo = { catalog_id: 853, portion_multiplier: 1, shopping_ingredient_lines: ['whites'] };
  const plany = plan(jidlo);
  const mapa = new Map([['853', SUROVINY]]);

  pridejNakupniRadkyDoPlanu(plany, mapa);
  const poPrvnim = [...jidlo.shopping_ingredient_lines];
  pridejNakupniRadkyDoPlanu(plany, mapa);

  assert.deepEqual(jidlo.shopping_ingredient_lines, poPrvnim);
});

test('spatny vstup nespadne', () => {
  assert.equal(pridejNakupniRadkyDoPlanu(null, new Map()), 0);
  assert.equal(pridejNakupniRadkyDoPlanu([], null), 0);
  assert.equal(pridejNakupniRadkyDoPlanu([{}], new Map()), 0);
  assert.deepEqual(radkyProJidlo(null, 1), []);
  assert.deepEqual(radkyProJidlo([], 1), []);
});

test('sloupec pro select je opravdu ten, ze ktereho se cte', () => {
  assert.ok(SLOUPCE_KATALOGU_PRO_SUROVINY.includes('ingredients'));
});
