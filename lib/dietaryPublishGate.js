/**
 * Tvrdý dietní publish gate před uložením / publikací plánu.
 * Priorita: diet_type > dietary_restrictions > alergeny > katalog/AI text.
 *
 * ČISTÁ PRAVIDLA JSOU V lib/dietaryRules.js. Tady zůstalo jen to, co potřebuje
 * plánovač a nouzové cesty — tedy `enforceDietaryPublishGate`. Kdo chce dietu
 * jen POSOUDIT, importuje dietaryRules.js a vyhne se tím kruhu.
 *
 * Pravidla se re-exportují, aby dosavadní importéry nemusely měnit cestu.
 */
import { buildReplacementStructuredMeal } from './simpleStartMealReplacement.js';
import { buildSimpleStartMealSkeleton } from './services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from './startSimpleMealFilter.js';
import { planMealTypeToWeightKey, slotTargetKcal } from './nutrition/portionScaling.js';
import { fillDayCaloriesByAddingLibraryMeals } from './nutrition/calorieHonesty.js';
import {
  buildDietaryPublishRules,
  checkCandidateAgainstDiet,
  describeMealDietaryViolation,
  findDietaryViolations,
  mealDietaryViolation,
  textDietaryViolation,
  planHtmlToTextSegments,
  findDietaryViolationsInHtml,
  hasAnyDietaryRestriction,
  assertPlanPublishableForDiet,
} from './dietaryRules.js';

export {
  buildDietaryPublishRules,
  checkCandidateAgainstDiet,
  describeMealDietaryViolation,
  findDietaryViolations,
  mealDietaryViolation,
  textDietaryViolation,
  planHtmlToTextSegments,
  findDietaryViolationsInHtml,
  hasAnyDietaryRestriction,
  assertPlanPublishableForDiet,
};

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
  const rules = buildDietaryPublishRules(bodyMetrics);
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
      // Nouzová cesta smí vrátit null, když pro dietu nic čistého nezbylo.
      // Vynechat slot je správnější než ho zaplnit porušením — a `findDietaryViolations`
      // níž stejně rozhodne, jestli plán jako celek projde.
      if (meal) dayMeals.push(meal);
    }
    // Dopočet kalorií dostává dietu jako PREDIKÁT, ne jako body_metrics.
    // calorieHonesty.js nesmí importovat tenhle modul (ten importuje jeho —
    // vznikl by cyklus), takže rozhodování o dietě zůstává tady a tam se
    // posílá jen funkce. Bez ní přisypával z knihovny cokoli — 10. 8. 2026
    // to byla jedna ze čtyř diet-slepých cest.
    fillDayCaloriesByAddingLibraryMeals(dayMeals, dailyTarget, {
      dietFilter: (candidate) => checkCandidateAgainstDiet(candidate, rules).ok,
    });
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
    } catch (err) {
      // Sem teď padá i `simple_meal_planner_no_template_for_diet` z plánovače.
      // Chyba se dřív spolkla úplně, takže o důvodu nebylo v logu nic.
      console.error('[dietary-gate] nahradni skeleton selhal', {
        diet_type: rules.dietType,
        error: err?.message ?? String(err),
        violations_before_fallback: violations2.length,
        violations_detail: violations2.slice(0, 12).map((v) => ({
          day: v.day,
          meal_type: v.meal_type,
          meal_name: v.meal_name,
          code: v.code,
          matched_term: v.matched_term,
        })),
      });
      return {
        ok: false,
        planJson: working,
        replaced,
        fallbackUsed: true,
        violations: violations2.length,
        violationDetails: violations2.slice(0, 12),
      };
    }
  }

  const finalViolations = findDietaryViolations(working, rules);

  // CO PORUŠILO DIETU, MUSÍ BÝT V LOGU.
  //
  // 10. 8. 2026 mělo selhání bezlepkového plánu 2086 řádků a slovo „gluten“
  // v nich nebylo ani jednou — brána vracela jen počet. Hledání příčiny stálo
  // tři kola. Loguje se před returnem, ať volající udělá cokoli.
  if (finalViolations.length) {
    console.error('[dietary-gate] plan neprosel dietou', {
      diet_type: rules.dietType,
      gluten_free: rules.glutenFree,
      lactose_free: rules.lactoseFree,
      vegetarian: rules.vegetarian,
      vegan: rules.vegan,
      replaced,
      fallback_used: violations2.length > 0,
      violations_total: finalViolations.length,
      violations: finalViolations.slice(0, 12).map((v) => ({
        day: v.day,
        meal_type: v.meal_type,
        meal_name: v.meal_name,
        code: v.code,
        matched_term: v.matched_term,
      })),
    });
  }

  return {
    ok: finalViolations.length === 0,
    planJson: working,
    replaced,
    fallbackUsed: violations2.length > 0,
    violations: finalViolations.length,
    /** Detail pro log a pro _diagnostics volajícího — ne pro rozhodování. */
    violationDetails: finalViolations.slice(0, 12),
  };
}
