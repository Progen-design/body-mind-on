/**
 * Doplneni postupu do ulozeneho planu.
 *
 * Zmereno na produkci: 105 ze 105 jidel v aktivnich planech ma catalog_id,
 * vsech 105 se pari na recipes_catalog a vsech 105 tam ma cesky postup
 * (prumer 4,7 kroku). Zadne z nich nema instructions primo v planu — proto
 * se dopáruje pri cteni profilu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogIdyZPlanu,
  postupZKatalogu,
  pridejPostupyDoPlanu,
} from '../profile/postupyDoPlanu.js';

/** Tvar odpovidajici skutecnemu structured_plan_json. */
function plan(jidla) {
  return { id: 'p1', structured_plan_json: { days: [{ date: '2026-08-21', meals: jidla }] } };
}

// ----------------------------------------------------------------- sber id

test('posbírá catalog_id ze všech dnů a plánů, bez duplicit', () => {
  const plany = [
    plan([{ catalog_id: 1023 }, { catalog_id: 1213 }]),
    plan([{ catalog_id: '1023' }, { catalog_id: 865 }]),
  ];

  assert.deepEqual(catalogIdyZPlanu(plany).sort(), ['1023', '1213', '865']);
});

test('id se vrací jako řetězce — v plánu je jednou číslo, jindy text', () => {
  assert.deepEqual(catalogIdyZPlanu([plan([{ catalog_id: 1023 }])]), ['1023']);
});

test('jídlo bez catalog_id se přeskočí, nespadne to', () => {
  const plany = [plan([{ catalog_id: null }, { catalog_id: '' }, {}, { catalog_id: 5 }])];
  assert.deepEqual(catalogIdyZPlanu(plany), ['5']);
});

test('plán bez dnů ani jídel nevrací nic', () => {
  assert.deepEqual(catalogIdyZPlanu([]), []);
  assert.deepEqual(catalogIdyZPlanu(null), []);
  assert.deepEqual(catalogIdyZPlanu([{ structured_plan_json: null }]), []);
  assert.deepEqual(catalogIdyZPlanu([plan([])]), []);
});

// -------------------------------------------------------------- cteni radku

test('postup se vezme z instructions_cs', () => {
  // Skutecna data: recipes_catalog id=1, llm_generated.
  const radek = {
    id: 1,
    instructions_cs: [
      'V hrnci přiveďte mléko k mírnému varu a vsypte ovesné vločky.',
      'Vařte 5 minut a průběžně míchejte.',
      'Nakrájejte banán na kolečka.',
      'Kaši přendejte do misky a ozdobte banánem.',
    ],
    prep_minutes_estimated: 12,
  };

  const postup = postupZKatalogu(radek);
  assert.equal(postup.kroky.length, 4);
  assert.equal(postup.prepMinut, 12);
});

test('recept bez postupu nedá nic — nevymýšlí se náhradní kroky', () => {
  assert.equal(postupZKatalogu({ id: 1, instructions_cs: null }), null);
  assert.equal(postupZKatalogu({ id: 1, instructions_cs: [] }), null);
  assert.equal(postupZKatalogu({ id: 1, instructions_cs: ['', '  '] }), null);
  assert.equal(postupZKatalogu(null), null);
});

test('chybějící odhad doby je null, ne nula', () => {
  const bezOdhadu = { id: 1, instructions_cs: ['Uvař vejce natvrdo.'], prep_minutes_estimated: null };
  assert.equal(postupZKatalogu(bezOdhadu).prepMinut, null);

  // Nula minut je nesmysl, ne namerena hodnota.
  const nula = { id: 1, instructions_cs: ['Uvař vejce natvrdo.'], prep_minutes_estimated: 0 };
  assert.equal(postupZKatalogu(nula).prepMinut, null);
});

test('kostrbatý postup se bere taky — dva kroky jsou pořád skutečný recept', () => {
  // recipes_catalog id=466, coach_seed_v1. Radsi strohy postup nez vymysleny.
  const radek = { id: 466, instructions_cs: ['Uvař vejce natvrdo.', 'Podávej s pečivem a zeleninou.'] };
  assert.equal(postupZKatalogu(radek).kroky.length, 2);
});

// ------------------------------------------------------------- zapis do planu

test('postup se zapíše do recipe u správného jídla', () => {
  const plany = [plan([{ catalog_id: 1023, recipe: { title_cs: 'Pita' } }, { catalog_id: 999 }])];
  const postupy = new Map([['1023', { kroky: ['Nakrájej pitu.', 'Namaž hummus.'], prepMinut: 8 }]]);

  assert.equal(pridejPostupyDoPlanu(plany, postupy), 1);

  const jidla = plany[0].structured_plan_json.days[0].meals;
  assert.deepEqual(jidla[0].recipe.instructions_cs, ['Nakrájej pitu.', 'Namaž hummus.']);
  assert.equal(jidla[0].recipe.prep_minutes, 8);
  assert.equal(jidla[0].recipe.title_cs, 'Pita', 'zbytek recipe zustava');
});

test('jídlo bez odpovídajícího receptu zůstane bez postupu', () => {
  // Nesmi dostat postup jineho jidla ani prazdne pole.
  const plany = [plan([{ catalog_id: 999, recipe: { title_cs: 'Neznámé' } }])];
  assert.equal(pridejPostupyDoPlanu(plany, new Map([['1023', { kroky: ['x'], prepMinut: null }]])), 0);
  assert.equal(plany[0].structured_plan_json.days[0].meals[0].recipe.instructions_cs, undefined);
});

test('chybějící objekt recipe se založí', () => {
  const plany = [plan([{ catalog_id: 1023 }])];
  pridejPostupyDoPlanu(plany, new Map([['1023', { kroky: ['Uvař.'], prepMinut: null }]]));

  assert.deepEqual(plany[0].structured_plan_json.days[0].meals[0].recipe.instructions_cs, ['Uvař.']);
});

test('číselné i textové catalog_id se spárují stejně', () => {
  const plany = [plan([{ catalog_id: 1023 }, { catalog_id: '1023' }])];
  assert.equal(pridejPostupyDoPlanu(plany, new Map([['1023', { kroky: ['Uvař.'], prepMinut: null }]])), 2);
});

test('prázdná mapa ani rozbitý vstup nic nerozbijí', () => {
  const plany = [plan([{ catalog_id: 1023 }])];
  assert.equal(pridejPostupyDoPlanu(plany, new Map()), 0);
  assert.equal(pridejPostupyDoPlanu(plany, null), 0);
  assert.equal(pridejPostupyDoPlanu(null, new Map()), 0);
});
