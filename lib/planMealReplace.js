/**
 * Nahrazení jednoho jídla ve structured plánu (START / lokální knihovna).
 */
import { buildReplacementStructuredMeal } from './simpleStartMealReplacement.js';
import { resolveSimpleStartLocalSlot } from './startSimpleMealFilter.js';
import {
  sumScaledDayKcal,
  slotTargetKcal,
  planMealTypeToWeightKey,
} from './nutrition/portionScaling.js';
import { fillDayCaloriesByAddingLibraryMeals, enforceDayCalorieBand } from './nutrition/calorieHonesty.js';
import { renderPlanHtmlFromStructured } from './planRenderer.js';
import { stripPlanMediaAttrsFromHtml } from './emailTemplates.js';

function mealTitle(meal) {
  return meal?.display_name_cs || meal?.name_cs || meal?.display_name || '';
}

/**
 * @param {object} structuredPlan
 * @param {number} daySlotIndex - index 0..6 v poli structuredPlan.days (den platnosti plánu)
 * @param {number} mealIndex
 * @param {object} bodyMetrics
 */
export async function replaceMealInStructuredPlan(structuredPlan, daySlotIndex, mealIndex, bodyMetrics = {}) {
  if (!structuredPlan?.days?.length) {
    throw new Error('STRUCTURED_PLAN_MISSING');
  }
  const slot = Number(daySlotIndex);
  const day = Number.isFinite(slot) && slot >= 0 && slot < structuredPlan.days.length
    ? structuredPlan.days[slot]
    : structuredPlan.days.find((d) => Number(d.day_index) === slot);
  if (!day?.meals?.length) throw new Error('DAY_NOT_FOUND');

  const current = day.meals[mealIndex] || day.meals.find((m, i) => i === mealIndex);
  if (!current) throw new Error('MEAL_NOT_FOUND');

  const mealType = current.type || 'lunch';
  const currentTitle = mealTitle(current);
  const dailyTarget = Number(structuredPlan?.targets?.calories_per_day)
    || Number(bodyMetrics?.calories_target)
    || Number(day.daily_target_kcal)
    || 2200;
  const mealsPerDay = day.meals.length;
  const slotTarget = slotTargetKcal(
    dailyTarget,
    mealsPerDay,
    planMealTypeToWeightKey(mealType)
  );

  const excludeTitles = day.meals.map((m) => mealTitle(m)).filter(Boolean);
  const replacement = buildReplacementStructuredMeal({
    mealType,
    currentTitle,
    bodyMetrics,
    excludeTitles,
    targetKcal: slotTarget,
  });
  if (!replacement || mealTitle(replacement).toLowerCase() === currentTitle.toLowerCase()) {
    throw new Error('NO_ALTERNATIVE');
  }

  const slotMeal = {
    type: mealType,
    name_cs: replacement.display_name_cs || replacement.name_cs,
    target_kcal: slotTarget,
    simple_start_mode: true,
    planner_source: 'meal_replacement',
    fallback_meal_template: {
      name_cs: replacement.display_name_cs || replacement.name_cs,
      kcal: replacement.kcal || replacement.calories,
      protein_g: replacement.protein_g,
      carbs_g: replacement.carbs_g,
      fat_g: replacement.fat_g,
    },
  };

  const { meal: resolved } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mealIndex, bodyMetrics);
  const nextMeal = resolved || replacement;
  day.meals[mealIndex] = { ...nextMeal, type: mealType, replaced_from: currentTitle };

  fillDayCaloriesByAddingLibraryMeals(day.meals, dailyTarget);
  const band = enforceDayCalorieBand(day.meals, dailyTarget, { tolerance: 0.10 });
  const daySum = band.achieved_kcal ?? sumScaledDayKcal(day.meals);
  if (!band.within_band && (band.over_target_kcal || 0) > 0) {
    throw new Error('DAY_KCAL_OUT_OF_TOLERANCE');
  }

  day.daily_target_kcal = dailyTarget;
  day.daily_achieved_kcal = daySum;
  day.calorie_under_target = band.under_target === true;
  day.calorie_shortfall_kcal = band.shortfall_kcal ?? 0;

  const planHtml = stripPlanMediaAttrsFromHtml(renderPlanHtmlFromStructured(structuredPlan, bodyMetrics));

  return {
    structuredPlan,
    planHtml,
    meal: nextMeal,
    day_kcal: daySum,
    previous_title: currentTitle,
    new_title: mealTitle(nextMeal),
  };
}

export default replaceMealInStructuredPlan;
