/**
 * KALORICKY VĚDOMÝ VÝBĚR ŠABLONY — PROMPT_PRO_CODE.md PR 2+3 (2026-09-17).
 *
 * PROČ TENHLE TEST EXISTUJE. `pickTemplateForSlot` rotovala čistě pozičně
 * a kalorie neřešila vůbec. Dokud byla nejtěžší šablona ~640 kcal, nevadilo
 * to; po PR 2 (vysokokalorické varianty, nejvyšší 1009 kcal) to na nízkých
 * cílech (1600-2200 kcal/den, největší produkční segment) způsobilo
 * regresi: den 4 profilu 1600 kcal dostal na oběd „Těstoviny s kuřetem,
 * velká porce" (1009 kcal), který se nesmí zmenšit pod `START_MIN_SCALE`
 * (0,85), takže den přestřelil cíl o +45 %.
 *
 * Testuje se MECHANISMUS (multiplikátor nikdy pod `START_MIN_SCALE`), ne
 * konkrétní název šablony — ať test přežije, když knihovna dostane další
 * (třeba ještě větší) recepty.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  START_MEAL_TEMPLATES,
  pickTemplateForSlot,
  templateBaseKcal,
  baseDishKey,
} from '../services/simpleMealPlannerAgent.js';
import { parseDietaryExclusions } from '../dietaryExclusions.js';
import { slotTargetKcal, planMealTypeToWeightKey, START_MIN_SCALE } from '../nutrition/portionScaling.js';

const exclusions = parseDietaryExclusions({});

test('pickTemplateForSlot nikdy nevybere šablonu, kterou by bylo nutné zmenšit pod START_MIN_SCALE', () => {
  // Cíl 1600 kcal/den, 4 jídla — přesný produkční scénář z nálezu výš.
  const dailyTarget = 1600;
  const mealsPerDay = 4;
  const pool = START_MEAL_TEMPLATES.standard.lunch;
  const slotTarget = slotTargetKcal(dailyTarget, mealsPerDay, planMealTypeToWeightKey('lunch'));
  assert.ok(slotTarget > 0, 'sanity: slotTarget se musí spočítat');

  const usedCounts = new Map();
  const usedDishKeysToday = new Set();
  // Celý týden (7 dnů) — ať se prověří víc než jeden konkrétní dayIndex.
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const picked = pickTemplateForSlot(pool, dayIndex, 1, exclusions, 'lunch', usedCounts, slotTarget, usedDishKeysToday);
    assert.ok(picked, `den ${dayIndex}: picker musí něco vrátit`);
    const baseKcal = templateBaseKcal(picked, 'lunch');
    assert.ok(baseKcal, `den ${dayIndex}: "${picked.name_cs}" nemá zjistitelné bazální kcal`);
    const needed = slotTarget / baseKcal;
    assert.ok(
      needed >= START_MIN_SCALE - 1e-9,
      `den ${dayIndex}: "${picked.name_cs}" (${baseKcal} kcal) by se muselo zmenšit na ${needed.toFixed(2)}×, pod START_MIN_SCALE (${START_MIN_SCALE})`
    );
  }
});

test('pickTemplateForSlot: na vysokém cíli pořád preferuje šablonu, která sedí do tolerance', () => {
  // Kontrolní scénář opačným směrem — ať oprava neznamená, že se kalorické
  // filtrování prostě vypnulo. Cíl blízko horní hranici nové lunch šablony
  // (999 kcal, PROMPT_PRO_CODE.md PR 2) musí vybrat něco uvnitř tolerance,
  // ne nejbližší poziční kandidát bez ohledu na kalorie.
  const dailyTarget = 3300;
  const mealsPerDay = 5;
  const pool = START_MEAL_TEMPLATES.standard.lunch;
  const slotTarget = slotTargetKcal(dailyTarget, mealsPerDay, planMealTypeToWeightKey('lunch'));

  const usedCounts = new Map();
  const usedDishKeysToday = new Set();
  const picked = pickTemplateForSlot(pool, 0, 1, exclusions, 'lunch', usedCounts, slotTarget, usedDishKeysToday);
  assert.ok(picked, 'picker musí něco vrátit');
  const baseKcal = templateBaseKcal(picked, 'lunch');
  const needed = slotTarget / baseKcal;
  assert.ok(
    needed >= START_MIN_SCALE - 1e-9 && needed <= 1.15 + 1e-9,
    `"${picked.name_cs}" (${baseKcal} kcal) na cíl ${slotTarget.toFixed(0)} vyšel mimo tolerance (${needed.toFixed(2)}×) — měla existovat lepší shoda`
  );
});

test('baseDishKey: stejný základ jídla ve dvou velikostech má stejný klíč', () => {
  assert.equal(baseDishKey('Těstoviny s kuřetem'), baseDishKey('Těstoviny s kuřetem, velká porce'));
  assert.equal(baseDishKey('Kuře se zeleninou'), baseDishKey('Kuře se zeleninou, velká porce'));
  assert.notEqual(baseDishKey('Kuře se zeleninou'), baseDishKey('Kuře s rýží a zeleninou'));
});

test('baseDishKey: nerozlišuje velikost písmen ani okolní mezery', () => {
  assert.equal(baseDishKey('  Kuře se zeleninou  '), baseDishKey('kuře se zeleninou'));
});

test('pickTemplateForSlot: měkké omezení proti stejnému základu jídla dvakrát za den (bod C)', () => {
  // "Kuře s rýží a zeleninou" a "Kuře s rýží a zeleninou, velká porce" mají
  // stejný baseDishKey — když je jedno už vybrané dnes, druhé se pro STEJNÝ
  // den nemá vybrat, dokud existuje kalorický kandidát, který tenhle základ
  // nesdílí.
  const pool = START_MEAL_TEMPLATES.standard.lunch;
  const slotTarget = 600; // v toleranci pro víc než jednu šablonu
  const usedCounts = new Map();
  const usedDishKeysToday = new Set(['kuře s rýží a zeleninou']);

  const picked = pickTemplateForSlot(pool, 0, 1, exclusions, 'lunch', usedCounts, slotTarget, usedDishKeysToday);
  assert.ok(picked);
  assert.notEqual(
    baseDishKey(picked.name_cs),
    'kuře s rýží a zeleninou',
    `"${picked.name_cs}" sdílí základ jídla, který už je dnes vybraný, ačkoli existuje jiná možnost`
  );
});
