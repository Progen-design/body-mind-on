// Adresa jídla pro záměnu — `poziceVPlanu`.
//
// PROC TENHLE TEST EXISTUJE. POST /api/plan-replace-meal adresuje jídlo
// POZICI v `structured_plan_json.days[].meals`, ne typem. `mealyDne`
// (src/data/adaptery.ts) navíc výstup PŘEŘAZUJE podle typu jídla (snídaně
// před obědem před večeří) — kdyby se `poziceVPlanu` počítalo AŽ po tomhle
// řazení, sedělo by na zobrazené pořadí, ne na skutečnou pozici v poli,
// kterou čte server. Záměna by pak potichu přepsala JINÉ jídlo, než na
// které uživatel klikl. Žádný jiný test tohle nechytí.
import test from 'node:test';
import assert from 'node:assert/strict';

import { naJidla, naJidlaTydne } from './adaptery.ts';

// Záměrně NEsetříděné pořadí surových dat (oběd první, snídaně druhá) —
// stejný druh pasti jako u cviků, jen navíc přes řazení podle typu jídla.
const PLAN = {
  id: 'plan-1',
  structured_plan_json: {
    days: [
      {
        date: '2026-09-09',
        day_index: 3,
        day_name: 'Středa',
        meals: [
          { type: 'lunch', name_cs: 'Kuře s rýží', kcal: 700 },
          { type: 'breakfast', name_cs: 'Ovesná kaše', kcal: 450 },
          { type: 'snack', name_cs: 'Jogurt', kcal: 150 },
          { type: 'snack', name_cs: 'Ovoce', kcal: 120 },
          { type: 'dinner', name_cs: 'Losos se zeleninou', kcal: 600 },
        ],
      },
    ],
  },
};

test('každé jídlo zná svou pozici v plánu, i po přeřazení podle typu', () => {
  const jidla = naJidla(PLAN);
  assert.equal(jidla.length, 5);
  // Zobrazené pořadí je podle typu (snídaně, dopol. svačina, oběd, odpol. svačina, večeře),
  // ne podle surového pole — poziceVPlanu musí ukazovat na SUROVÝ index.
  const podleNazvu = Object.fromEntries(jidla.map((m) => [m.title, m.poziceVPlanu]));
  assert.equal(podleNazvu['Kuře s rýží'], 0);
  assert.equal(podleNazvu['Ovesná kaše'], 1);
  assert.equal(podleNazvu['Jogurt'], 2);
  assert.equal(podleNazvu['Ovoce'], 3);
  assert.equal(podleNazvu['Losos se zeleninou'], 4);
});

test('pozice sedí na pořadí v structured_plan_json, ne na zobrazené pořadí', () => {
  const jidla = naJidla(PLAN);
  const zdroj = PLAN.structured_plan_json.days[0].meals;
  for (const jidlo of jidla) {
    assert.equal(zdroj[jidlo.poziceVPlanu].name_cs, jidlo.title);
  }
});

test('dvě svačiny ve stejném dni mají různou pozici', () => {
  const jidla = naJidla(PLAN);
  const svaciny = jidla.filter((m) => m.type.includes('svačina'));
  assert.equal(svaciny.length, 2);
  assert.notEqual(svaciny[0].poziceVPlanu, svaciny[1].poziceVPlanu);
});

test('naJidlaTydne nese pozici stejně jako naJidla pro každý den zvlášť', () => {
  const denniJidla = naJidlaTydne(PLAN)[0].meals;
  const zdroj = PLAN.structured_plan_json.days[0].meals;
  for (const jidlo of denniJidla) {
    assert.equal(zdroj[jidlo.poziceVPlanu].name_cs, jidlo.title);
  }
});
