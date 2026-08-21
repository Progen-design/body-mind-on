/**
 * Sloty jídel a jejich váhy.
 *
 * Regrese: skeleton pro meals_per_day 5 a 6 vznikal jen se 4 sloty, protože
 * `['breakfast','lunch','dinner','snack'].slice(0, 6)` vrátí čtyři prvky.
 * Validátor pak plán shodil na „očekáváno alespoň 6 jídel, nalezeno 4“ a
 * uživatelům s cílem nad 3 200 kcal se týdenní plán nikdy nevygeneroval.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mealSlotTypes,
  mealWeightsSum,
  MEAL_WEIGHTS,
  slotTargetKcal,
} from '../portionScaling.js';
import { buildCatalogSkeletonPlan, getDeterministicMealPlan } from '../../services/deterministicFallback.js';

test('mealSlotTypes vrací přesně tolik slotů, kolik je jídel (2–6)', () => {
  for (let n = 2; n <= 6; n += 1) {
    assert.equal(mealSlotTypes(n).length, n, `${n} jídel`);
  }
});

test('mealSlotTypes doplňuje svačinami až za trojicí hlavních jídel', () => {
  assert.deepEqual(mealSlotTypes(2), ['breakfast', 'lunch']);
  assert.deepEqual(mealSlotTypes(3), ['breakfast', 'lunch', 'dinner']);
  assert.deepEqual(mealSlotTypes(4), ['breakfast', 'lunch', 'dinner', 'snack']);
  assert.deepEqual(mealSlotTypes(5), ['breakfast', 'lunch', 'dinner', 'snack', 'snack']);
  assert.deepEqual(mealSlotTypes(6), ['breakfast', 'lunch', 'dinner', 'snack', 'snack', 'snack']);
});

test('mealSlotTypes ořezává mimo rozsah a snáší nesmysly', () => {
  assert.equal(mealSlotTypes(1).length, 2, 'pod dolní mez');
  assert.equal(mealSlotTypes(9).length, 6, 'nad horní mez');
  assert.equal(mealSlotTypes(null).length, 3, 'null → default 3');
  assert.equal(mealSlotTypes('neco').length, 3, 'nečíslo → default 3');
});

test('váhy slotů dávají součet 1,0 pro každý počet jídel', () => {
  for (let n = 3; n <= 6; n += 1) {
    // Sčítá se PŘES SLOTY, takže se svačina u 6 jídel započítá třikrát.
    assert.ok(
      Math.abs(mealWeightsSum(n) - 1) < 1e-9,
      `${n} jídel: součet ${mealWeightsSum(n)}, čekáno 1`,
    );
  }
});

test('cíle slotů se sečtou na denní cíl (6 jídel, 3560 kcal)', () => {
  const denni = 3560;
  const soucet = mealSlotTypes(6)
    .map((typ) => slotTargetKcal(denni, 6, typ === 'breakfast' ? 'snidane'
      : typ === 'lunch' ? 'obed'
        : typ === 'dinner' ? 'vecere' : 'svacina'))
    .reduce((a, b) => a + b, 0);
  // Tolerance na zaokrouhlení jednotlivých slotů, ne na chybu vah.
  assert.ok(Math.abs(soucet - denni) <= 6, `součet slotů ${soucet}, cíl ${denni}`);
});

test('MEAL_WEIGHTS má klíč pro každý podporovaný počet jídel', () => {
  for (const n of [3, 4, 5, 6]) {
    assert.ok(MEAL_WEIGHTS[n], `chybí váhy pro ${n}`);
  }
});

test('katalogový skeleton má pro meals_per_day=6 skutečně 6 slotů každý den', () => {
  // 3560 kcal → deriveMealsPerDay vrátí 6 (hranice > 3200).
  const bm = {
    goal: 'nabirani_svaly',
    calories_target: 3560,
    weight_kg: 105,
    height_cm: 195,
    age: 37,
    activity: 'stredne',
  };
  const { meal_plan: plan } = buildCatalogSkeletonPlan(bm);

  assert.equal(plan.meals_per_day, 6, 'meals_per_day');
  assert.equal(plan.days.length, 7, 'počet dnů');
  for (const den of plan.days) {
    assert.equal(den.meals.length, 6, `${den.day_name}: počet slotů`);
    assert.equal(den.meals.filter((m) => m.type === 'snack').length, 3, `${den.day_name}: svačiny`);
    for (const jidlo of den.meals) {
      assert.ok(Number(jidlo.target_kcal) > 0, `${den.day_name}: cíl slotu ${jidlo.type}`);
    }
  }
});

test('deterministický fallback nedá tři identické svačiny v jednom dni', () => {
  const bm = {
    goal: 'nabirani_svaly',
    calories_target: 3560,
    weight_kg: 105,
    meals_per_day: 6,
    diet_type: 'standard',
  };
  const { meal_plan: plan } = getDeterministicMealPlan(bm);

  for (const den of plan.days) {
    const svaciny = den.meals.filter((m) => m.type === 'snack');
    assert.equal(svaciny.length, 3, `${den.day_name}: počet svačin`);
    const ruzne = new Set(svaciny.map((m) => m.name_cs));
    assert.equal(ruzne.size, 3, `${den.day_name}: svačiny se opakují — ${[...ruzne].join(', ')}`);
  }
});
