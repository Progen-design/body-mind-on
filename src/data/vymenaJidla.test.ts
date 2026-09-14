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

import { naJidla, naJidlaTydne, najdiJidloPodleSouradnic } from './adaptery.ts';

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

// ─────────────────────────────────────────────────────────────────────────
// najdiJidloPodleSouradnic — RecipeModal po záměně (POST /api/plan-replace-meal)
// nedostane promise, na kterou by šlo čekat (src/App.tsx, onPlanZmenen jen
// spustí přenačtení). Čerstvé jídlo se po přenačtení dohledává v novém
// seznamu z adaptéru podle souřadnic, ne podle obsahu — ten se záměnou mění.
// ─────────────────────────────────────────────────────────────────────────

test('najdiJidloPodleSouradnic najde jídlo v čerstvém seznamu podle souřadnic', () => {
  const tyden = naJidlaTydne(PLAN);
  const puvodni = tyden[0].meals.find((m) => m.title === 'Ovesná kaše')!;

  const nalezene = najdiJidloPodleSouradnic(tyden, {
    planId: puvodni.planId,
    planDay: puvodni.planDay,
    poziceVPlanu: puvodni.poziceVPlanu,
  });

  assert.equal(nalezene?.title, 'Ovesná kaše');
});

test('najdiJidloPodleSouradnic najde NOVÉ jídlo na stejné pozici, i když se obsah změnil', () => {
  // Přesně tohle záměna dělá: stejné souřadnice, jiný obsah.
  const puvodniTyden = naJidlaTydne(PLAN);
  const puvodni = puvodniTyden[0].meals.find((m) => m.title === 'Ovesná kaše')!;

  const PLAN_PO_ZAMENE = {
    ...PLAN,
    structured_plan_json: {
      ...PLAN.structured_plan_json,
      days: [{
        ...PLAN.structured_plan_json.days[0],
        meals: PLAN.structured_plan_json.days[0].meals.map((m, i) =>
          i === puvodni.poziceVPlanu ? { type: 'breakfast', name_cs: 'Tvarohová kaše', kcal: 480 } : m
        ),
      }],
    },
  };
  const cerstvyTyden = naJidlaTydne(PLAN_PO_ZAMENE);

  const nalezene = najdiJidloPodleSouradnic(cerstvyTyden, {
    planId: puvodni.planId,
    planDay: puvodni.planDay,
    poziceVPlanu: puvodni.poziceVPlanu,
  });

  assert.equal(nalezene?.title, 'Tvarohová kaše');
  assert.notEqual(nalezene?.title, puvodni.title);
});

test('najdiJidloPodleSouradnic vrátí null, když se plán mezitím přegeneroval (jídlo na pozici zmizelo)', () => {
  const tyden = naJidlaTydne(PLAN);
  // Kratší den než original — pozice 4 (Losos) už neexistuje.
  const PLAN_PREGENEROVANY = {
    ...PLAN,
    structured_plan_json: {
      ...PLAN.structured_plan_json,
      days: [{
        ...PLAN.structured_plan_json.days[0],
        meals: PLAN.structured_plan_json.days[0].meals.slice(0, 3),
      }],
    },
  };
  const novyTyden = naJidlaTydne(PLAN_PREGENEROVANY);

  const nalezene = najdiJidloPodleSouradnic(novyTyden, {
    planId: tyden[0].meals[0].planId,
    planDay: tyden[0].meals[0].planDay,
    poziceVPlanu: 4,
  });

  assert.equal(nalezene, null);
});

test('najdiJidloPodleSouradnic vrátí null bez chybějících souřadnic, nespadne', () => {
  const tyden = naJidlaTydne(PLAN);
  assert.equal(najdiJidloPodleSouradnic(tyden, {}), null);
  assert.equal(najdiJidloPodleSouradnic(tyden, { planId: 'plan-1' }), null);
  assert.equal(najdiJidloPodleSouradnic(tyden, { planId: 'plan-1', planDay: 3 }), null);
  assert.equal(najdiJidloPodleSouradnic([], { planId: 'plan-1', planDay: 3, poziceVPlanu: 0 }), null);
});

test('najdiJidloPodleSouradnic nekříží dny — stejná pozice v jiném dni se nepočítá', () => {
  const DVOUDENNI_PLAN = {
    id: 'plan-2',
    structured_plan_json: {
      days: [
        { date: '2026-09-09', day_index: 3, meals: [{ type: 'breakfast', name_cs: 'Den 1 snídaně', kcal: 400 }] },
        { date: '2026-09-10', day_index: 4, meals: [{ type: 'breakfast', name_cs: 'Den 2 snídaně', kcal: 400 }] },
      ],
    },
  };
  const tyden = naJidlaTydne(DVOUDENNI_PLAN);
  const denDruhy = tyden.find((d) => d.meals[0]?.title === 'Den 2 snídaně')!;

  const nalezene = najdiJidloPodleSouradnic(tyden, {
    planId: denDruhy.meals[0].planId,
    planDay: denDruhy.meals[0].planDay,
    poziceVPlanu: denDruhy.meals[0].poziceVPlanu,
  });

  assert.equal(nalezene?.title, 'Den 2 snídaně');
});
