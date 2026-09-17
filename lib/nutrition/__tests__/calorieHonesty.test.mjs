/**
 * Unit tests for calorie honesty rescue (cap + add-meal, never invent kcal).
 */
import {
  HONEST_MIN_SCALE,
  HONEST_MAX_SCALE,
  INFLATION_INVALID_THRESHOLD,
  MAX_MEALS_PER_DAY_CAP,
  FLEX_WEAK_DAY_MAX_SCALE,
  FLEX_CATCHUP_MAX_SCALE,
  maxExtraMealsForTarget,
  clampDayMealsToHonestScale,
  fillDayCaloriesByAddingLibraryMeals,
  planHasInflatedPortions,
  getPlanCalorieHonestyStatus,
  attachCalorieHonestyToPlan,
} from '../calorieHonesty.js';
import { START_MAX_SCALE, START_MIN_SCALE, scaleMealToTarget } from '../portionScaling.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function fakeMeal(kcal, mult = 1, title = 'Test meal') {
  return {
    name_cs: title,
    display_name_cs: title,
    type: 'lunch',
    kcal,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 10,
    portion_multiplier: mult,
    catalog_source: 'simple_start_library',
    recipe_verified: true,
    recipe: {
      source: 'simple_start_library',
      calories: kcal,
      portion_multiplier: mult,
    },
  };
}

console.log('--- calorieHonesty ---');

assert(START_MAX_SCALE === HONEST_MAX_SCALE, 'START_MAX_SCALE must match honest max');
assert(START_MIN_SCALE === HONEST_MIN_SCALE, 'START_MIN_SCALE must match honest min');
assert(INFLATION_INVALID_THRESHOLD === 1.2, 'invalid threshold');
assert(MAX_MEALS_PER_DAY_CAP === 6, 'meal cap');
assert(maxExtraMealsForTarget(3500, 5) <= 1, '5 skeleton high TDEE extras');
assert(maxExtraMealsForTarget(2800, 5) === 0, 'extras for mid target at full skeleton');
assert(maxExtraMealsForTarget(3500, 5) + 5 <= 6, 'total under hard cap 6');
assert(maxExtraMealsForTarget(1700, 3) === 1, 'low target one snack room');
assert(maxExtraMealsForTarget(2900, 3) === 2, 'mid target two snack room');

{
  const scaled = scaleMealToTarget({ kcal: 400, protein_g: 30, carbs_g: 40, fat_g: 10 }, 2000, {
    simpleStartMode: true,
  });
  assert(scaled.portion_multiplier <= HONEST_MAX_SCALE + 1e-9, `scale capped, got ${scaled.portion_multiplier}`);
  assert(scaled.kcal <= Math.round(400 * HONEST_MAX_SCALE) + 1, `kcal not invented, got ${scaled.kcal}`);
  console.log('OK scaleMealToTarget caps at 1.15 for START');
}

{
  const meals = [fakeMeal(900, 2.5, 'Inflated')];
  clampDayMealsToHonestScale(meals);
  assert(meals[0].portion_multiplier <= HONEST_MAX_SCALE, `clamped mult ${meals[0].portion_multiplier}`);
  const base = 900 / 2.5;
  assert(Math.abs(meals[0].kcal - Math.round(base * meals[0].portion_multiplier)) <= 1, 'kcal follows clamp');
  console.log('OK clampDayMealsToHonestScale');
}

{
  const meals = [fakeMeal(400, 1, 'A'), fakeMeal(450, 1, 'B'), fakeMeal(420, 1, 'C')];
  const summary = fillDayCaloriesByAddingLibraryMeals(meals, 2800);
  assert(meals.every((m) => (Number(m.portion_multiplier) || 1) <= FLEX_WEAK_DAY_MAX_SCALE + 0.05), 'no invented inflation');
  assert(meals.length <= MAX_MEALS_PER_DAY_CAP, `meal cap ${meals.length}`);
  assert(summary.under_target === true || summary.achieved_kcal >= Math.round(2800 * 0.95), 'either under or filled');
  if (summary.under_target) {
    assert(summary.achieved_kcal < 2800, 'under means real sum below target');
    assert(summary.shortfall_kcal > 0, 'shortfall reported');
  }
  console.log('OK fillDayCaloriesByAddingLibraryMeals', {
    meals: meals.length,
    achieved: summary.achieved_kcal,
    under: summary.under_target,
    added: summary.meals_added,
  });
}

{
  const inflated = {
    days: [{ meals: [fakeMeal(1200, 2.8)] }],
    targets: { calories_per_day: 2800 },
  };
  assert(planHasInflatedPortions(inflated) === true, 'detects inflation');
  const status = getPlanCalorieHonestyStatus(inflated);
  assert(status.invalid_inflated === true, 'status invalid');
  assert(status.banner_cs && /neplatné porce|Přegeneruj/i.test(status.banner_cs), 'inflated banner');
  console.log('OK inflated plan invalidation');
}

{
  const honest = {
    days: [{ meals: [fakeMeal(500, 1), fakeMeal(500, 1), fakeMeal(500, 1)], calorie_under_target: true }],
    targets: { calories_per_day: 2800 },
  };
  attachCalorieHonestyToPlan(honest, [{
    achieved_kcal: 1500,
    target_kcal: 2800,
    under_target: true,
    shortfall_kcal: 1300,
    meals_added: 0,
  }]);
  const status = getPlanCalorieHonestyStatus(honest);
  assert(status.invalid_inflated === false, 'not inflated');
  assert(status.under_target === true, 'under target');
  assert(/nepokryje|reálný/i.test(status.banner_cs || ''), 'underrun banner');
  console.log('OK underrun banner');
}

{
  // HORNÍ POJISTKA (2026-09-17). Produkční nález: `fillDayCaloriesByAddingLibraryMeals`
  // dřív jelo jen na `sum < minGoal (95 % cíle)` bez horní meze — u velkého
  // deficitu (>=250 kcal) `pickMealToAdd` řadí podle NEJVĚTŠÍCH kalorií
  // (`preferDense`), takže mohlo vybrat kandidáta, který den přestřelí přes
  // 1,15× cíle. Dvě existující jídla jsou už na flex stropu (mult 1.32,
  // `flex_catchup_kcal`), takže je `balanceDayMealsHonestly` ani
  // `boostDayMealsWithFlexibleCatchUp` dál nezvednou — celý zbylý deficit
  // (550 kcal, nad 250) musí řešit add-loop.
  const target = 1000;
  const maxAllowed = Math.round(target * HONEST_MAX_SCALE); // 1150

  function flexMaxedMeal(kcal, type) {
    const m = fakeMeal(kcal, FLEX_CATCHUP_MAX_SCALE, `Flex ${type}`);
    m.type = type;
    m.flex_catchup_kcal = 1;
    return m;
  }

  {
    // Nejhustší nabízený kandidát by přestřelil strop i zmenšený na
    // HONEST_MIN_SCALE (0,85 × 1000 = 850 -> sum 450+850 = 1300 > 1150) —
    // musí se přeskočit. Skutečná knihovna nabídne náhradu (to je v pořádku,
    // je to poctivé jídlo navíc), ale ZÁKLADNÍ INVARIANT — den nikdy
    // nepřestřelí `round(target * HONEST_MAX_SCALE)` — musí držet vždycky,
    // i když je deficit nad 250 kcal a `preferDense` by jinak sáhla po
    // nejhustším kandidátovi bez ohledu na strop (produkční nález).
    const meals = [flexMaxedMeal(300, 'lunch'), flexMaxedMeal(150, 'dinner')];
    const summary = fillDayCaloriesByAddingLibraryMeals(meals, target, {
      catalogFillCandidates: [
        { name_cs: 'Příliš hustý kandidát', kcal: 1000, meal_type: 'snack', protein_g: 40 },
      ],
    });
    assert(summary.achieved_kcal <= maxAllowed, `den přestřelil strop: ${summary.achieved_kcal} > ${maxAllowed}`);
    const denseOne = meals.find((m) => m.display_name_cs === 'Příliš hustý kandidát');
    assert(!denseOne, 'příliš hustý kandidát se nesměl přidat v plné (nezmenšené) velikosti');
    console.log('OK fillDayCaloriesByAddingLibraryMeals: nejhustší kandidát nikdy nedostane den nad strop', {
      achieved: summary.achieved_kcal,
      maxAllowed,
    });
  }

  {
    // Kandidát, který se do stropu vejde jen po zmenšení (0.85-1.0), se má
    // zmenšit, ne zahodit — jinak by se plán zbytečně ochudil o jídlo, které
    // šlo použít.
    const meals = [flexMaxedMeal(300, 'lunch'), flexMaxedMeal(150, 'dinner')];
    const summary = fillDayCaloriesByAddingLibraryMeals(meals, target, {
      catalogFillCandidates: [
        { name_cs: 'Zmenšitelný kandidát', kcal: 800, meal_type: 'snack', protein_g: 30 },
      ],
    });
    assert(summary.meals_added === 1, `zmenšitelný kandidát se měl přidat, added=${summary.meals_added}`);
    assert(summary.achieved_kcal <= maxAllowed, `den přestřelil strop: ${summary.achieved_kcal} > ${maxAllowed}`);
    const added = meals.find((m) => m.calorie_honesty_added);
    assert(added, 'přidané jídlo chybí v poli meals');
    assert(added.portion_multiplier < 1, `mělo se zmenšit pod 1×, je ${added.portion_multiplier}`);
    assert(added.portion_multiplier >= HONEST_MIN_SCALE - 1e-9, `nesmí jít pod HONEST_MIN_SCALE, je ${added.portion_multiplier}`);
    console.log('OK fillDayCaloriesByAddingLibraryMeals: zmenšitelný kandidát se zmenší, ne zahodí');
  }
}

console.log('All calorieHonesty checks passed.');
