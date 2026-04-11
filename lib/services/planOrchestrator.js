/**
 * lib/services/planOrchestrator.js
 * Orchestrace: OpenAI → Spoonacular → wger → finální plán.
 * Větev v6: planOrchestrator_newFormat (isV6Format + enrichAgentPlanV6).
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */
import { openai } from '../openai';
import { aggregateShoppingIngredientLinesFromStructuredPlan } from '../spoonacularShopping';
import {
  buildProfileTemplateMealPlan,
  computeTargetsForPlan,
  getDeterministicWorkoutPlan,
} from './deterministicFallback';
import { parseStructuredPlan } from '../validation/parseStructuredPlan';
import { enrichAgentPlanV6, isV6Format } from './planOrchestrator_newFormat';
import { resolveMeals, resolveWorkouts, logOrchestrator } from './planOrchestratorResolve';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const OPENAI_RETRY_COUNT = 2;

function log(level, msg, data = {}) {
  logOrchestrator(level, msg, data);
}

/** Zavolá OpenAI a vrátí parsovaný JSON. */
async function fetchStructuredPlanFromOpenAI(bodyMetrics) {
  const goal = bodyMetrics?.goal || 'udrzovani';
  const diet = bodyMetrics?.diet_type || 'standard';
  const meals = bodyMetrics?.meals_per_day ?? 3;
  const workouts = bodyMetrics?.workouts_per_week ?? 3;
  const equipment = Array.isArray(bodyMetrics?.equipment) ? bodyMetrics.equipment.join(', ') : 'bodyweight';
  const restrictions = [bodyMetrics?.allergies, bodyMetrics?.dietary_restrictions, bodyMetrics?.foods_to_avoid].filter(Boolean).join('; ');

  const prompt = `Jsi nutriční a fitness poradce. Vytvoř strukturovaný týdenní plán jako JSON (stejná sémantická pole jako formát v6 pro obohacení Spoonacular/wger).

VSTUP:
- Cíl: ${goal}
- Strava: ${diet}
- Jídel denně: ${meals}
- Tréninků týdně: ${workouts}
- Vybavení: ${equipment}
- Omezení: ${restrictions || 'žádná'}

STRUKTURA (v5 obal, v6 pole u položek):
- "targets": calories_per_day, protein_g, carbs_g, fat_g (jednotný denní cíl celý týden).
- "meal_plan": { "meals_per_day": ${meals}, "days": [ přesně 7 objektů v pořadí dne 0–6 ] }
  Každý den: "day_name" (česky), "meals": přesně ${meals} položek.
  Každé jídlo:
  - "type": breakfast | lunch | dinner | snack
  - "name_cs": krátký český název pro uživatele
  - "spoonacular_query": anglický dotaz max ~5 slov pro Spoonacular (nebo synonymně "search_query" se stejným významem)
- "workout_plan":
  - "workout_days": pole day_index 0–6 (Neděle=0), délka = ${workouts} pokud workouts>0, jinak []
  - "days": pro každý index z workout_days jeden objekt { "day_index", "exercises": [...] }
  Každý cvik:
  - "name_cs": český název pro uživatele
  - "search_term": anglický název pro vyhledání ve wger
  - "canonical_key": volitelné; pokud znáš stabilní klíč (např. squat, push_up, bench_press, deadlift, pull_up), malá písmena a podtržítka
  - "sets", "reps" nebo "duration_sec"

PRAVIDLA:
1. Vrať POUZE validní JSON (response_format json_object).
2. Přesně ${workouts} tréninkových dnů s neprázdným "exercises" nebo 0, pokud workouts=0 — shoda s workout_days.
3. Cviky pouze s dostupným vybavením: ${equipment}.
4. NEVYMÝŠLEJ recepty ani detaily cviků — jen dotazy a názvy jako výše.`;

  for (let attempt = 1; attempt <= OPENAI_RETRY_COUNT; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Vrať pouze validní JSON bez markdown.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });
      const raw = completion.choices?.[0]?.message?.content;
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const { valid, plan } = parseStructuredPlan(parsed, bodyMetrics);
      if (valid && plan) return plan;
    } catch (e) {
      log('warn', `OpenAI attempt ${attempt} failed`, { message: e?.message });
    }
  }
  return null;
}

/**
 * Hlavní orchestrátor.
 * @param {object} bodyMetrics - validovaný input
 * @param {{ useOpenAI?: boolean, requestId?: string }} [opts]
 * @returns {Promise<object>}
 */
export async function generateStructuredPlan(bodyMetrics, opts = {}) {
  const requestId = opts.requestId || `req_${Date.now()}`;
  const start = Date.now();
  const useOpenAI = opts.useOpenAI !== false;

  let structured = null;
  let generationSource = 'fallback';

  if (useOpenAI) {
    structured = await fetchStructuredPlanFromOpenAI(bodyMetrics);
    if (structured) generationSource = 'openai';
  }

  if (!structured?.meal_plan) {
    log('warn', 'OpenAI nevrátil meal_plan — šablona jen z profilu (ne MEAL_QUERIES rotace)', { requestId });
    structured = structured || {};
    structured.targets = structured.targets || computeTargetsForPlan(bodyMetrics);
    structured.meal_plan = buildProfileTemplateMealPlan(bodyMetrics);
  }

  if (!structured?.workout_plan?.days?.length) {
    const workoutsPerWeek = bodyMetrics?.workouts_per_week ?? 3;
    structured = structured || {};
    if (workoutsPerWeek > 0) {
      const det = getDeterministicWorkoutPlan(bodyMetrics);
      structured.workout_plan = {
        workout_days: det.workout_days,
        days: det.days,
      };
      log('warn', 'Bez workout_plan z agenta — doplněny deterministické WORKOUT_BLOCKS', {
        requestId,
        workout_days: det.workout_days,
      });
    } else {
      structured.workout_plan = { workout_days: [], days: [] };
    }
  }

  if (isV6Format(structured)) {
    return enrichAgentPlanV6(structured, bodyMetrics, opts);
  }

  const workoutDays = structured.workout_plan?.workout_days ?? [];
  const fastMode = opts.fastMode === true;
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
  const validUntil = validUntilOverride ? new Date(validUntilOverride) : (() => {
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

  log('info', 'Plan generated', {
    requestId,
    duration_ms: Date.now() - start,
    generationSource,
    mealsResolved,
    mealsFallback,
    exercisesResolved,
    exercisesFallback,
    meals_verified_count: mealsVerifiedCount,
    meals_with_exact_spoonacular_image: mealsExactImageCount,
    meals_with_shopping_ingredient_lines: mealsWithShoppingLines,
    shopping_list_items_spoonacular_deduped: shoppingDeduped.length,
    meal_cards_placeholder_image: flatMealsForMedia.filter((m) => !(m.image_trust_level === 'exact' && m.image_url)).length,
    ...(spoonacularDiag ? {
      spoonacular_requests: spoonacularDiag.spoonacular_requests_total,
      meals_resolved_primary: spoonacularDiag.meals_resolved_primary,
      meals_resolved_fallback: spoonacularDiag.meals_resolved_fallback,
      meals_unverified: spoonacularDiag.meals_unverified,
      avg_confidence: spoonacularDiag.average_confidence_score,
      unverified_meal_searches: spoonacularDiag.unverified_meal_searches,
    } : {}),
  });

  return {
    ok: true,
    valid_from: validFrom.toISOString().slice(0, 10),
    valid_until: validUntil.toISOString().slice(0, 10),
    targets: structured?.targets ?? { calories_per_day: 2000, protein_g: 120, carbs_g: 220, fat_g: 65 },
    workouts_per_week: workoutDays.length,
    workout_days: workoutDays,
    days,
    _diagnostics: {
      generation_source: generationSource,
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
