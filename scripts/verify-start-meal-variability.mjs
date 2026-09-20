#!/usr/bin/env node
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from '../lib/startSimpleMealFilter.js';
import {
  sumScaledDayKcal,
  planMealTypeToWeightKey,
  slotTargetKcal,
} from '../lib/nutrition/portionScaling.js';
import { fillDayCaloriesByAddingLibraryMeals } from '../lib/nutrition/calorieHonesty.js';

let failed = 0;
function fail(msg) { console.log(`FAIL ${msg}`); failed += 1; }
function ok(msg) { console.log(`OK ${msg}`); }

const TOLERANCE = 0.15;

// PROMPT_PRO_CODE.md PR 2+3 bod D — 2700 kcal (den 1. verze skriptu) je
// hubnuti/udrzovani/nabirani prumer; nizsi cile (1600-2200), ktere pokryvaji
// nejvetsi segment (hubnuti a udrzovani), tu chybely uplne, takze zeleny
// skript nic nerekl o profilu, ktery kalorickym schedulingem prochazi
// nejcasteji.
const PROFILES = [
  {
    label: '2700 kcal / 4 jidla',
    bodyMetrics: {
      goal: 'udrzovani',
      weight_kg: 80,
      calories_target: 2700,
      diet_type: 'standard',
      meals_per_day: 4,
      email: 'variability-test@example.com',
    },
  },
  {
    label: '1800 kcal / 4 jidla',
    bodyMetrics: {
      goal: 'hubnuti',
      weight_kg: 70,
      calories_target: 1800,
      diet_type: 'standard',
      meals_per_day: 4,
      email: 'variability-test-1800@example.com',
    },
  },
  // PROMPT_PRO_CODE.md bod F (2026-09-17): nejnizsi realny cil (1386 kcal,
  // zaokrouhleno na 1400) a jeden vegetarian profil — druhy nejvetsi
  // segment produkce (7 uzivatelu, cile 1386-2320 kcal), ktery skript
  // predtim vubec netestoval.
  {
    label: '1400 kcal / standard',
    bodyMetrics: {
      goal: 'hubnuti',
      weight_kg: 60,
      calories_target: 1400,
      diet_type: 'standard',
      email: 'variability-test-1400@example.com',
    },
  },
  {
    label: '2000 kcal / vegetarian',
    bodyMetrics: {
      goal: 'udrzovani',
      weight_kg: 65,
      calories_target: 2000,
      diet_type: 'vegetarian',
      email: 'variability-test-vegetarian@example.com',
    },
  },
];

/**
 * Plnou pipeline (resolveSimpleStartLocalSlot -> fillDayCaloriesByAddingLibraryMeals),
 * STEJNOU jako `verify-start-calorie-consistency.mjs` a produkce
 * (`lib/planMealReplace.js`, `lib/dietaryPublishGate.js`) — ne jen holé
 * škálování bez schopnosti den dorovnat přidaným jídlem. Kaloricky vědomý
 * scheduler (PR 3) TÍMHLE POČÍTÁ: když žádná šablona nesedí do ±15 % slotu,
 * radši vybere slabší (den skončí pod cílem) než přestřelí — a dorovnání
 * dělá až tenhle krok, ne přeškálování nahoru přes strop.
 */
function resolveDays(skeleton, bodyMetrics) {
  const mealsPerDay = skeleton.meal_plan.meals_per_day || 4;
  const days = [];
  for (const day of skeleton.meal_plan.days || []) {
    const dailyTarget = Number(day.daily_target_kcal) || Number(skeleton.targets.calories_per_day);
    const dayMeals = [];
    for (let mi = 0; mi < (day.meals || []).length; mi += 1) {
      const slotMeal = day.meals[mi];
      const slotTarget = slotTargetKcal(dailyTarget, mealsPerDay, planMealTypeToWeightKey(slotMeal.type || 'lunch'));
      const { meal } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mi, bodyMetrics);
      dayMeals.push(meal);
    }
    const honesty = fillDayCaloriesByAddingLibraryMeals(dayMeals, dailyTarget);
    days.push({ day_index: day.day_index, daily_target_kcal: dailyTarget, meals: dayMeals, honesty });
  }
  return days;
}

function checkVariability(label, bodyMetrics) {
  console.log(`--- START meal variability: ${label} ---`);
  const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics });
  const baseTarget = Number(skeleton.targets.calories_per_day);
  const resolved = resolveDays(skeleton, bodyMetrics);

  const dailyKcals = resolved.map((d) => sumScaledDayKcal(d.meals));
  const uniqueDaily = new Set(dailyKcals);
  if (uniqueDaily.size < 2) fail(`${label}: all daily kcal identical: ${[...uniqueDaily].join(', ')}`);
  else ok(`${label}: daily kcal vary across week (${uniqueDaily.size} distinct sums)`);

  for (const day of resolved) {
    const target = Number(day.daily_target_kcal) || baseTarget;
    const sum = sumScaledDayKcal(day.meals);
    // HORNÍ HRANICE JE TVRDÁ — žádné vymyšlené kalorie přes 15 % cíle.
    const maxOk = Math.round(target * (1 + TOLERANCE));
    if (sum > maxOk) fail(`${label} day ${day.day_index}: ${sum} above ${maxOk}`);
    // POD CÍLEM JE PŘIJATELNÉ, KDYŽ TO HONESTY TAK OZNAČÍ — kaloricky vědomý
    // scheduler (PR 3) radši nechá den pod cílem, než aby šablonu přeškáloval
    // pod START_MIN_SCALE. Sanity kontrola: `under_target` musí sedět se
    // skutečným součtem, ne že se flag jen tak nastaví.
    const minGoal = Math.round(target * 0.95);
    if (day.honesty?.under_target === true && sum >= minGoal) {
      fail(`${label} day ${day.day_index}: marked under_target ale sum ${sum} >= ${minGoal}`);
    }
    if (day.honesty?.under_target !== true && sum < Math.round(target * (1 - TOLERANCE))) {
      fail(`${label} day ${day.day_index}: ${sum} below ${Math.round(target * (1 - TOLERANCE))} bez honesty.under_target`);
    }
  }
  ok(`${label}: no day invents kcal above +15 % of its jittered target`);

  const countByType = (type) => {
    const names = resolved.flatMap((d) => d.meals.filter((m) => m.type === type).map((m) => m.display_name_cs || m.name_cs));
    return { names, unique: new Set(names).size, maxRepeat: Math.max(...[...new Set(names)].map((n) => names.filter((x) => x === n).length), 0) };
  };

  const breakfast = countByType('breakfast');
  const lunch = countByType('lunch');
  const dinner = countByType('dinner');
  const snack = countByType('snack');

  if (breakfast.unique < 3) fail(`${label}: breakfast types ${breakfast.unique} < 3`);
  else ok(`${label}: breakfast variety: ${breakfast.unique} types`);
  if (lunch.unique < 4) fail(`${label}: lunch types ${lunch.unique} < 4`);
  else ok(`${label}: lunch variety: ${lunch.unique} types`);
  if (dinner.unique < 4) fail(`${label}: dinner types ${dinner.unique} < 4`);
  else ok(`${label}: dinner variety: ${dinner.unique} types`);
  if (snack.unique < 2) fail(`${label}: snack types ${snack.unique} < 2`);
  else ok(`${label}: snack variety: ${snack.unique} types`);

  for (const [type, data] of [['breakfast', breakfast], ['lunch', lunch], ['dinner', dinner], ['snack', snack]]) {
    if (data.maxRepeat > 2) fail(`${label}: ${type} meal repeated ${data.maxRepeat}x`);
  }
  ok(`${label}: no meal repeated more than 2x per type`);

  const sources = resolved.flatMap((d) => d.meals.map((m) => m.catalog_source || m.recipe?.source || ''));
  if (sources.some((s) => /spoonacular|meal_cache|catalog_id/i.test(String(s)))) fail(`${label}: non-START source detected`);
  else ok(`${label}: START meals use local library/fallback only`);
}

for (const { label, bodyMetrics } of PROFILES) {
  checkVariability(label, bodyMetrics);
}

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
