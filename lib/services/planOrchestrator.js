/**
 * lib/services/planOrchestrator.js
 * Orchestrace: OpenAI → Spoonacular → wger → finální plán.
 * OpenAI vrací pouze search queries, backend dohledává reálná data.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */
import { openai } from '../openai';
import { searchRecipe } from './spoonacularService';
import { resolveExercise } from './exerciseProviderRegistry';
import { getDeterministicMealPlan, getDeterministicWorkoutPlan } from './deterministicFallback';
import { deriveWorkoutDays } from '../validation/onboardingSchema';
import { parseStructuredPlan } from '../validation/parseStructuredPlan';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const OPENAI_RETRY_COUNT = 2;
const SPOONACULAR_RETRY_DELAY_MS = 1000;

function log(level, msg, data = {}) {
  const prefix = '[onboarding]';
  if (level === 'error') {
    console.error(prefix, msg, data);
  } else if (level === 'warn') {
    console.warn(prefix, msg, data);
  } else {
    console.log(prefix, msg, data);
  }
}

/** S retry pro fetch. */
async function withRetry(fn, retries = 2, delayMs = 0) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/** Zavolá OpenAI a vrátí parsovaný JSON. */
async function fetchStructuredPlanFromOpenAI(bodyMetrics) {
  const goal = bodyMetrics?.goal || 'udrzovani';
  const diet = bodyMetrics?.diet_type || 'standard';
  const meals = bodyMetrics?.meals_per_day ?? 3;
  const workouts = bodyMetrics?.workouts_per_week ?? 3;
  const equipment = Array.isArray(bodyMetrics?.equipment) ? bodyMetrics.equipment.join(', ') : 'bodyweight';
  const restrictions = [bodyMetrics?.allergies, bodyMetrics?.dietary_restrictions, bodyMetrics?.foods_to_avoid].filter(Boolean).join('; ');

  const prompt = `Jsi nutriční a fitness poradce. Vytvoř strukturovaný týdenní plán jako JSON.

VSTUP:
- Cíl: ${goal}
- Strava: ${diet}
- Jídel denně: ${meals}
- Tréninků týdně: ${workouts}
- Vybavení: ${equipment}
- Omezení: ${restrictions || 'žádná'}

PRAVIDLA:
1. Vrať POUZE validní JSON.
2. meal_plan.days: 7 dní, každý s meals (type: breakfast/lunch/dinner/snack, search_query: anglický dotaz max 5 slov).
3. workout_plan.days: pro každý tréninkový den exercises (search_term: anglický název cviku pro wger, sets, reps nebo duration_sec).
4. workout_plan.workout_days: pole day_index (0-6) tréninkových dnů.
5. targets: calories_per_day, protein_g, carbs_g, fat_g.
6. NEVYMÝŠLEJ recepty ani cviky – pouze vyhledávací dotazy.`;

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

/** Resolve jídel s retry pro Spoonacular. */
async function resolveMeals(mealPlan, diet) {
  const dietOpt = diet === 'vegan' ? 'vegan' : diet === 'vegetarian' ? 'vegetarian' : undefined;
  const resolved = [];
  for (const day of mealPlan?.days ?? []) {
    const dayMeals = [];
    for (const m of day.meals ?? []) {
      let recipe = null;
      try {
        recipe = await withRetry(
          () => searchRecipe(m.search_query || '', { diet: dietOpt }),
          2,
          SPOONACULAR_RETRY_DELAY_MS
        );
      } catch {
        // ignore
      }
      dayMeals.push({
        type: m.type,
        display_name: recipe?.title ?? m.search_query ?? '',
        recipe: recipe
          ? {
              id: recipe.id,
              title: recipe.title,
              image: recipe.image,
              sourceUrl: recipe.sourceUrl,
              readyInMinutes: recipe.readyInMinutes,
              calories: recipe.calories,
              protein_g: recipe.protein_g,
              carbs_g: recipe.carbs_g,
              fat_g: recipe.fat_g,
              source: recipe.source,
            }
          : null,
      });
    }
    resolved.push({ day_index: day.day_index, day_name: day.day_name, meals: dayMeals });
  }
  return resolved;
}

/** Resolve cviků (wger only, secondary přes registry). */
async function resolveWorkouts(workoutPlan) {
  const resolved = [];
  for (const w of workoutPlan?.days ?? []) {
    const exercises = [];
    for (const ex of w.exercises ?? []) {
      const term = ex.search_term || '';
      let resolvedEx = null;
      try {
        resolvedEx = await withRetry(() => resolveExercise(term), 2);
      } catch {
        resolvedEx = { name: term, image_url: null, video_url: null, source: 'none', wger_exercise_id: null };
      }
      exercises.push({
        name: resolvedEx?.name ?? term,
        sets: ex.sets ?? 3,
        reps: ex.reps ?? null,
        duration_sec: ex.duration_sec ?? null,
        image_url: resolvedEx?.image_url ?? null,
        video_url: resolvedEx?.video_url ?? null,
        source: resolvedEx?.source ?? 'none',
        wger_exercise_id: resolvedEx?.wger_exercise_id ?? null,
      });
    }
    resolved.push({ day_index: w.day_index, exercises });
  }
  return resolved;
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
    log('info', 'Using deterministic meal fallback', { requestId });
    const mealFallback = getDeterministicMealPlan(bodyMetrics);
    structured = structured || {};
    structured.targets = mealFallback.targets;
    structured.meal_plan = mealFallback.meal_plan;
  }

  if (!structured?.workout_plan?.days?.length) {
    const workoutsPerWeek = bodyMetrics?.workouts_per_week ?? 3;
    if (workoutsPerWeek > 0) {
      log('info', 'Using deterministic workout fallback', { requestId });
      const workoutFallback = getDeterministicWorkoutPlan(bodyMetrics);
      structured = structured || {};
      structured.workout_plan = workoutFallback;
    } else {
      structured = structured || {};
      structured.workout_plan = { workout_days: [], days: [] };
    }
  }

  const workoutDays = structured.workout_plan?.workout_days ?? [];
  const [resolvedMeals, resolvedWorkouts] = await Promise.all([
    resolveMeals(structured.meal_plan, bodyMetrics?.diet_type),
    resolveWorkouts(structured.workout_plan),
  ]);

  const validFrom = new Date();
  const validUntil = new Date(validFrom);
  validUntil.setDate(validUntil.getDate() + 7);

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

  log('info', 'Plan generated', {
    requestId,
    duration_ms: Date.now() - start,
    generationSource,
    mealsResolved,
    mealsFallback,
    exercisesResolved,
    exercisesFallback,
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
    },
  };
}
