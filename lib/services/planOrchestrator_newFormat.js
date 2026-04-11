/**
 * lib/services/planOrchestrator_newFormat.js
 * Trainer / agent v6: po parseStructuredPlan (plan._format === 'v6') jedna enrich větev.
 */
import { aggregateShoppingIngredientLinesFromStructuredPlan } from '../spoonacularShopping';
import { resolveMeals, resolveWorkouts, logOrchestrator } from './planOrchestratorResolve';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/**
 * Parsovaný plán z parseStructuredPlan (v6 má _format + meal_plan + workout_plan).
 * @param {object|null|undefined} structured
 */
export function isV6Format(structured) {
  if (!structured || typeof structured !== 'object') return false;
  return structured._format === 'v6';
}

/**
 * Stejné obohacení jako legacy větev, jiný zdroj v _diagnostics.
 * @param {object} structured – validní výstup parseStructuredPlan (v6)
 * @param {object} bodyMetrics
 * @param {{ requestId?: string, fastMode?: boolean, validFrom?: string, valid_from?: string, validUntil?: string, valid_until?: string }} [opts]
 */
export async function enrichAgentPlanV6(structured, bodyMetrics, opts = {}) {
  const requestId = opts.requestId || `req_${Date.now()}`;
  const start = Date.now();
  const fastMode = opts.fastMode === true;
  const workoutDays = structured.workout_plan?.workout_days ?? [];

  const [resolvedMeals, resolvedWorkouts] = await Promise.all([
    resolveMeals(structured.meal_plan, bodyMetrics?.diet_type, {
      fastMode,
      requestId,
      bodyMetrics,
      targets: structured?.targets ?? {},
    }),
    resolveWorkouts(structured.workout_plan, { fastMode }),
  ]);

  const validFromOverride = opts.validFrom ?? opts.valid_from;
  const validUntilOverride = opts.validUntil ?? opts.valid_until;
  const validFrom = validFromOverride ? new Date(validFromOverride) : new Date();
  const validUntil = validUntilOverride
    ? new Date(validUntilOverride)
    : (() => {
        const u = new Date(validFrom);
        u.setDate(u.getDate() + 7);
        return u;
      })();

  const workoutByDayIndex = Object.fromEntries((resolvedWorkouts || []).map((w) => [w.day_index, w]));

  const startWeekday = validFrom.getDay();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(validFrom);
    d.setDate(d.getDate() + i);
    const dayIndex = d.getDay();
    const dayName = CZECH_DAYS[dayIndex];
    const mealDay = resolvedMeals[(startWeekday + i) % 7];
    const workout = workoutByDayIndex[dayIndex];

    days.push({
      date: d.toISOString().slice(0, 10),
      day_index: dayIndex,
      day_name: dayName,
      meals: mealDay?.meals ?? [],
      workout: workout
        ? {
            day_index: dayIndex,
            duration_minutes: bodyMetrics?.workout_duration_min ?? 45,
            exercises: workout.exercises,
          }
        : null,
    });
  }

  const mealsResolved = resolvedMeals.flatMap((x) => x.meals).filter((m) => m.recipe).length;
  const mealsFallback = resolvedMeals.flatMap((x) => x.meals).filter((m) => !m.recipe).length;
  const exercisesResolved = resolvedWorkouts.flatMap((w) => w.exercises).filter((e) => e.image_url || e.video_url).length;
  const exercisesFallback = resolvedWorkouts.flatMap((w) => w.exercises).filter((e) => !e.image_url && !e.video_url).length;

  const spoonacularDiag = resolvedMeals?._diag;
  const flatMealsForMedia = days.flatMap((d) => d.meals ?? []);
  const mealsVerifiedCount = flatMealsForMedia.filter((m) => m.recipe_verified === true).length;
  const mealsExactImageCount = flatMealsForMedia.filter(
    (m) => m.recipe_verified === true && m.image_trust_level === 'exact' && m.image_url
  ).length;
  const mealsWithShoppingLines = flatMealsForMedia.filter(
    (m) => m.recipe_verified === true && Array.isArray(m.shopping_ingredient_lines) && m.shopping_ingredient_lines.length > 0
  ).length;
  const shoppingDeduped = aggregateShoppingIngredientLinesFromStructuredPlan({ days });

  logOrchestrator('info', 'Plan generated (v6 agent branch)', {
    requestId,
    duration_ms: Date.now() - start,
    generation_source: 'agent_v6',
    mealsResolved,
    mealsFallback,
    exercisesResolved,
    exercisesFallback,
    ...(spoonacularDiag
      ? {
          spoonacular_requests: spoonacularDiag.spoonacular_requests_total,
          meals_resolved_primary: spoonacularDiag.meals_resolved_primary,
          meals_resolved_fallback: spoonacularDiag.meals_resolved_fallback,
          meals_unverified: spoonacularDiag.meals_unverified,
          avg_confidence: spoonacularDiag.average_confidence_score,
        }
      : {}),
  });

  return {
    ok: true,
    valid_from: validFrom.toISOString().slice(0, 10),
    valid_until: validUntil.toISOString().slice(0, 10),
    targets: structured?.targets ?? { calories_per_day: 2000, protein_g: 120, carbs_g: 220, fat_g: 65 },
    workouts_per_week: workoutDays.length,
    workout_days: workoutDays,
    days,
    _format: 'v6',
    html: structured.html,
    shopping_list: structured.shopping_list,
    mindset_tip: structured.mindset_tip,
    metrics: structured.metrics,
    _diagnostics: {
      generation_source: 'agent_v6',
      meals_resolved: mealsResolved,
      meals_fallback: mealsFallback,
      exercises_resolved: exercisesResolved,
      exercises_fallback: exercisesFallback,
      spoonacular_requests_total: resolvedMeals?._diag?.spoonacular_requests_total ?? null,
      spoonacular_requests_per_plan: resolvedMeals?._diag?.spoonacular_requests_per_plan ?? null,
      spoonacular_requests_per_meal: resolvedMeals?._diag?.spoonacular_requests_per_meal ?? null,
      meals_resolved_primary: resolvedMeals?._diag?.meals_resolved_primary ?? null,
      meals_resolved_fallback: resolvedMeals?._diag?.meals_resolved_fallback ?? null,
      meals_unverified: resolvedMeals?._diag?.meals_unverified ?? null,
      average_confidence_score: resolvedMeals?._diag?.average_confidence_score ?? null,
      cache_hit_rate: resolvedMeals?._diag?.cache_hit_rate ?? null,
      cache_miss_rate: resolvedMeals?._diag?.cache_miss_rate ?? null,
      unverified_meal_searches: resolvedMeals?._diag?.unverified_meal_searches ?? null,
      meals_recipe_verified_count: mealsVerifiedCount,
      meals_with_exact_spoonacular_image: mealsExactImageCount,
      meals_with_shopping_ingredient_lines: mealsWithShoppingLines,
      shopping_list_items_spoonacular_deduped: shoppingDeduped.length,
      meal_cards_placeholder_image: flatMealsForMedia.filter((m) => !(m.image_trust_level === 'exact' && m.image_url)).length,
    },
  };
}
