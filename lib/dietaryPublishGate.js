/**
 * Tvrdý dietní publish gate před uložením / publikací plánu.
 * Priorita: diet_type > dietary_restrictions > alergeny > katalog/AI text.
 */
import {
  parseDietaryExclusions,
  mealContainsExcludedFood,
  textContainsExcludedFood,
} from './dietaryExclusions.js';
import { buildReplacementStructuredMeal } from './simpleStartMealReplacement.js';
import { buildSimpleStartMealSkeleton } from './services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from './startSimpleMealFilter.js';
import { planMealTypeToWeightKey, slotTargetKcal } from './nutrition/portionScaling.js';
import { fillDayCaloriesByAddingLibraryMeals } from './nutrition/calorieHonesty.js';

const MEAT_FISH_TERMS = [
  'maso', 'ryba', 'ryby', 'drubez', 'drůbež', 'kuře', 'kure', 'kuřec', 'kurec',
  'hověz', 'hovez', 'vepř', 'vepr', 'salmon', 'tuna', 'tuňák', 'tunak', 'losos',
  'chicken', 'beef', 'fish', 'meat', 'pork', 'turkey', 'bacon', 'šunka', 'sunka',
  'krůt', 'krut', 'jehněč', 'jehnec',
];

const VEGAN_EXTRA_TERMS = [
  'vejce', 'vejci', 'egg', 'mléko', 'mleko', 'milk', 'sýr', 'syr', 'cheese',
  'tvaroh', 'jogurt', 'yogurt', 'med', 'želatina', 'zelatina', 'gelatin',
  'smetan', 'slehack', 'butter', 'máslo', 'maslo', 'whey', 'casein',
];

const GLUTEN_TERMS = [
  'pšenice', 'psenice', 'mouka', 'těstoviny', 'testoviny', 'špagety', 'spagety', 'chléb', 'chleb',
  'pečivo', 'pecivo', 'bulgur', 'kuskus', 'couscous', 'wheat', 'flour', 'pasta',
  'bread', 'bagel', 'croissant', 'spaghetti', 'penne',
];

const GLUTEN_FREE_MARKERS = ['bezlepk', 'bez lepk', 'gluten free', 'gluten-free'];

/**
 * @param {object|null|undefined} bm
 */
export function buildDietaryPublishRules(bm) {
  const dietType = String(bm?.diet_type || 'standard').toLowerCase();
  const exclusions = parseDietaryExclusions(bm);
  const combined = [
    bm?.foods_to_avoid,
    bm?.dietary_restrictions,
    bm?.allergies,
  ].filter(Boolean).join(' ').toLowerCase();

  const glutenFree = dietType === 'gluten_free' || dietType === 'gluten-free'
    || combined.includes('lep') || combined.includes('gluten');
  const lactoseFree = dietType === 'lactose_free' || dietType === 'lactose-free'
    || exclusions.dairyExcluded
    || combined.includes('laktoz') || combined.includes('lactose');

  return {
    dietType,
    exclusions,
    glutenFree,
    lactoseFree,
    vegetarian: dietType === 'vegetarian',
    vegan: dietType === 'vegan',
  };
}

function mealTextBlob(meal) {
  const parts = [
    meal?.display_name_cs,
    meal?.display_name,
    meal?.name_cs,
    meal?.name,
    meal?.title,
    meal?.recipe?.title,
    meal?.ai_name,
  ];
  if (Array.isArray(meal?.shopping_ingredient_lines)) {
    parts.push(...meal.shopping_ingredient_lines.map((l) => (typeof l === 'string' ? l : l?.name || '')));
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function textHasAnyTerm(text, terms) {
  const norm = String(text || '').toLowerCase();
  return terms.some((t) => norm.includes(t));
}

function isExplicitlyGlutenFreeVariant(text) {
  const norm = String(text || '').toLowerCase();
  return GLUTEN_FREE_MARKERS.some((m) => norm.includes(m));
}

/**
 * @param {object|null|undefined} meal
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {string|null} violation code
 */
export function mealDietaryViolation(meal, rules) {
  if (!meal) return null;
  const text = mealTextBlob(meal);

  if (rules.vegetarian && textHasAnyTerm(text, MEAT_FISH_TERMS)) {
    return 'vegetarian_meat_fish';
  }
  if (rules.vegan && (textHasAnyTerm(text, MEAT_FISH_TERMS) || textHasAnyTerm(text, VEGAN_EXTRA_TERMS))) {
    return 'vegan_animal_product';
  }
  if (rules.glutenFree && textHasAnyTerm(text, GLUTEN_TERMS) && !isExplicitlyGlutenFreeVariant(text)) {
    return 'gluten_free';
  }
  if (rules.lactoseFree && mealContainsExcludedFood(meal, rules.exclusions)) {
    return 'lactose_free';
  }
  if (mealContainsExcludedFood(meal, rules.exclusions)) {
    return 'dietary_exclusion';
  }
  for (const term of rules.exclusions.rawTerms || []) {
    if (term && textContainsExcludedFood(text, { blockedTerms: [term] })) {
      return 'explicit_exclusion';
    }
  }
  return null;
}

/**
 * @param {object} planJson
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {Array<{ dayIndex: number, mealIndex: number, code: string }>}
 */
export function findDietaryViolations(planJson, rules) {
  const hits = [];
  const days = planJson?.days || [];
  for (let di = 0; di < days.length; di++) {
    const meals = days[di]?.meals || [];
    for (let mi = 0; mi < meals.length; mi++) {
      const code = mealDietaryViolation(meals[mi], rules);
      if (code) hits.push({ dayIndex: di, mealIndex: mi, code });
    }
  }
  return hits;
}

function cloneMealSlot(meal, replacement) {
  if (!replacement) return meal;
  return {
    ...meal,
    ...replacement,
    type: meal.type || replacement.type,
    display_name_cs: replacement.display_name_cs || replacement.name_cs,
    catalog_source: replacement.catalog_source || 'simple_start_library',
    recipe_verified: replacement.recipe_verified !== false,
    verification_source: replacement.verification_source || 'dietary_publish_gate',
  };
}

function resolveSkeletonMealsForPlan(skeleton, bodyMetrics) {
  const dailyTarget = Number(skeleton.targets?.calories_per_day) || 2200;
  const mealsPerDay = skeleton.meal_plan?.meals_per_day || 3;
  const outDays = [];
  for (const day of skeleton.meal_plan?.days || []) {
    const dayMeals = [];
    for (let mi = 0; mi < (day.meals || []).length; mi++) {
      const slotMeal = day.meals[mi];
      const slotTarget = slotTargetKcal(
        dailyTarget,
        mealsPerDay,
        planMealTypeToWeightKey(slotMeal.type || 'lunch'),
      );
      const { meal } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mi, bodyMetrics);
      dayMeals.push(meal);
    }
    fillDayCaloriesByAddingLibraryMeals(dayMeals, dailyTarget);
    outDays.push({ ...day, meals: dayMeals });
  }
  return outDays;
}

/**
 * @param {object} planJson
 * @param {object} bm body_metrics
 * @returns {{ ok: boolean, planJson: object, replaced: number, fallbackUsed: boolean, violations: number }}
 */
export function enforceDietaryPublishGate(planJson, bm) {
  if (!planJson?.days?.length) {
    return { ok: false, planJson, replaced: 0, fallbackUsed: false, violations: 1 };
  }

  const rules = buildDietaryPublishRules(bm);
  let working = JSON.parse(JSON.stringify(planJson));
  let replaced = 0;

  const violations1 = findDietaryViolations(working, rules);
  if (violations1.length) {
    const usedTitles = new Set();
    for (const hit of violations1) {
      const day = working.days[hit.dayIndex];
      const meal = day?.meals?.[hit.mealIndex];
      if (!meal) continue;
      const targetKcal = Number(meal.kcal) || slotTargetKcal(
        Number(working.targets?.calories_per_day) || 2200,
        (day.meals || []).length,
        planMealTypeToWeightKey(meal.type || 'lunch'),
      );
      const replacement = buildReplacementStructuredMeal({
        mealType: meal.type || 'lunch',
        currentTitle: meal.display_name_cs || meal.name_cs || '',
        bodyMetrics: bm,
        excludeTitles: [...usedTitles],
        targetKcal,
      });
      if (replacement) {
        day.meals[hit.mealIndex] = cloneMealSlot(meal, replacement);
        usedTitles.add(replacement.display_name_cs || replacement.name_cs || '');
        replaced += 1;
      }
    }
  }

  const violations2 = findDietaryViolations(working, rules);
  if (violations2.length) {
    try {
      const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics: bm });
      const safeDays = resolveSkeletonMealsForPlan(skeleton, bm);
      for (let i = 0; i < working.days.length && i < safeDays.length; i++) {
        working.days[i] = {
          ...working.days[i],
          meals: safeDays[i].meals,
        };
      }
      replaced += violations2.length;
    } catch {
      return {
        ok: false,
        planJson: working,
        replaced,
        fallbackUsed: true,
        violations: violations2.length,
      };
    }
  }

  const finalViolations = findDietaryViolations(working, rules);
  return {
    ok: finalViolations.length === 0,
    planJson: working,
    replaced,
    fallbackUsed: violations2.length > 0,
    violations: finalViolations.length,
  };
}
