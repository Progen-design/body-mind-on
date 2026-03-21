/**
 * lib/services/planOrchestrator.js
 * Orchestrace: OpenAI → Spoonacular → wger → finální plán.
 * OpenAI vrací pouze search queries, backend dohledává reálná data.
 * Jídla: trust-aware Spoonacular pipeline (shortlist, scoring, confidence).
 * Cviky: canonical display_name_cs, nikdy raw wger name.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */
import { openai } from '../openai';
import { searchMealMetadata } from '../mealEnrichment';
import { translateRecipeTitleToCzech, batchTranslateRecipeTitlesToCzech } from '../recipeLocalization';
import { resolveExercise } from './exerciseProviderRegistry';
import { getDeterministicMealPlan, getDeterministicWorkoutPlan, getFallbackMealQueries } from './deterministicFallback';
import { deriveWorkoutDays } from '../validation/onboardingSchema';
import { parseStructuredPlan } from '../validation/parseStructuredPlan';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const OPENAI_RETRY_COUNT = 2;
const SPOONACULAR_RETRY_DELAY_MS = 1000;
/** Hard cap Spoonacular requestů na jeden plán – při překročení se přestanou zkoušet fallbacky. */
const MAX_SPOONACULAR_REQUESTS_PER_PLAN = 60;

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

/** Resolve jídel – paralelizované Spoonacular + batch překlad. Nikdy raw recipe.title do UI. */
async function resolveMeals(mealPlan, diet, opts = {}) {
  const fastMode = opts.fastMode === true;
  const mealSearchOpts = fastMode ? { maxCandidates: 1, timeoutMs: 3000 } : { maxCandidates: 3 };
  const retries = fastMode ? 1 : 2;

  const allMeals = [];
  for (const day of mealPlan?.days ?? []) {
    for (const m of day.meals ?? []) {
      allMeals.push({ day, m, searchQuery: (m.search_query || '').trim() });
    }
  }

  // Deduplikace: stejný search_query = jeden request, výsledek se znovu použije
  const queryToIndices = new Map();
  for (let i = 0; i < allMeals.length; i++) {
    const q = allMeals[i].searchQuery || '__empty__';
    if (!queryToIndices.has(q)) queryToIndices.set(q, []);
    queryToIndices.get(q).push(i);
  }
  const uniqueQueries = [...queryToIndices.keys()].filter((q) => q !== '__empty__');

  const searchResults = await Promise.all(
    uniqueQueries.map((q) =>
      withRetry(() => searchMealMetadata(q, null, mealSearchOpts), retries, fastMode ? 500 : SPOONACULAR_RETRY_DELAY_MS)
        .catch(() => null)
    )
  );

  const metas = new Array(allMeals.length).fill(null);
  uniqueQueries.forEach((q, i) => {
    const indices = queryToIndices.get(q) || [];
    const result = searchResults[i];
    indices.forEach((idx) => { metas[idx] = result; });
  });
  const emptyMeta = (name) => ({ name: name || 'Unknown', image_url: null, source: 'none', image_trust_level: 'none', exact_source: null, illustrative_source: null, confidence_score: 0, recipe_id: null, _recipe: null, calories: null, protein_g: null, carbs_g: null, fat_g: null });
  for (let i = 0; i < metas.length; i++) {
    if (metas[i] === null) metas[i] = emptyMeta(allMeals[i].searchQuery || '');
  }

  function isRecipeVerified(meta) {
    return meta?.recipe_id != null && (meta?.image_trust_level === 'exact' || (meta?.confidence_score ?? 0) >= 0.75) && meta?._recipe;
  }

  const diag = { spoonacular_requests_total: 0, meals_resolved_primary: 0, meals_resolved_fallback: 0, meals_unverified: 0, average_confidence_score: 0, cache_hit_rate: null, cache_miss_rate: null };
  uniqueQueries.forEach((q, i) => { diag.spoonacular_requests_total += (searchResults[i]?._spoonacularCalls ?? 0); });
  diag.meals_resolved_primary = metas.filter(isRecipeVerified).length;

  const MAX_FALLBACK_ATTEMPTS = fastMode ? 1 : 3;
  const attemptedFallbackQueries = allMeals.map(() => []);
  await Promise.all(
    metas.map(async (meta, i) => {
      if (isRecipeVerified(meta)) return;
      const { m } = allMeals[i];
      const fallbacks = getFallbackMealQueries(diet, m?.type || 'breakfast');
      for (let j = 0; j < Math.min(MAX_FALLBACK_ATTEMPTS, fallbacks.length); j++) {
        if (diag.spoonacular_requests_total >= MAX_SPOONACULAR_REQUESTS_PER_PLAN) break;
        const fq = fallbacks[j];
        attemptedFallbackQueries[i].push(fq);
        try {
          const fallbackMeta = await searchMealMetadata(fq, null, mealSearchOpts);
          diag.spoonacular_requests_total += (fallbackMeta?._spoonacularCalls ?? 0);
          if (isRecipeVerified(fallbackMeta)) {
            metas[i] = fallbackMeta;
            return;
          }
        } catch {
          // pokračuj na další fallback
        }
      }
    })
  );
  diag.meals_resolved_fallback = metas.filter(isRecipeVerified).length - diag.meals_resolved_primary;
  diag.meals_unverified = metas.length - metas.filter(isRecipeVerified).length;
  diag.unverified_meal_searches = [];
  for (let i = 0; i < metas.length; i++) {
    if (isRecipeVerified(metas[i])) continue;
    const { m } = allMeals[i];
    const primaryQ = (allMeals[i].searchQuery || '').trim() || '(prázdný)';
    diag.unverified_meal_searches.push({
      meal_index: i,
      meal_type: m?.type ?? null,
      primary_search_query: primaryQ,
      fallback_queries_attempted: [...attemptedFallbackQueries[i]],
      confidence_score: metas[i]?.confidence_score ?? null,
      recipe_id: metas[i]?.recipe_id ?? null,
    });
    log('warn', 'Meal unverified after primary + fallbacks', {
      requestId: opts.requestId || 'meal_resolve',
      meal_index: i,
      meal_type: m?.type,
      primary_search_query: primaryQ,
      fallback_queries_attempted: attemptedFallbackQueries[i],
      confidence_score: metas[i]?.confidence_score ?? null,
    });
  }
  if (diag.spoonacular_requests_total >= MAX_SPOONACULAR_REQUESTS_PER_PLAN) {
    log('warn', 'Spoonacular request budget reached', { total: diag.spoonacular_requests_total, cap: MAX_SPOONACULAR_REQUESTS_PER_PLAN });
  }
  const confSum = metas.reduce((s, m) => s + (m?.confidence_score ?? 0), 0);
  diag.average_confidence_score = metas.length ? Math.round((confSum / metas.length) * 100) / 100 : 0;
  diag.spoonacular_requests_per_plan = diag.spoonacular_requests_total;
  diag.spoonacular_requests_per_meal = metas.length ? Math.round((diag.spoonacular_requests_total / metas.length) * 100) / 100 : 0;

  const toTranslate = allMeals
    .map((item, i) => {
      const meta = metas[i];
      const recipeVerified = meta?.recipe_id != null && (meta?.image_trust_level === 'exact' || (meta?.confidence_score ?? 0) >= 0.75);
      const rawRecipe = meta?._recipe;
      return recipeVerified && rawRecipe ? { title: rawRecipe.title || '', recipeId: meta.recipe_id } : null;
    })
    .filter(Boolean);

  const translatedNames = toTranslate.length > 0
    ? await batchTranslateRecipeTitlesToCzech(toTranslate)
    : [];
  let transIdx = 0;

  const resolved = [];
  let mealIdx = 0;
  for (const day of mealPlan?.days ?? []) {
    const dayMeals = [];
    for (const m of day.meals ?? []) {
      const meta = metas[mealIdx++];
      const recipeVerified = meta?.recipe_id != null && (meta?.image_trust_level === 'exact' || (meta?.confidence_score ?? 0) >= 0.75);
      const rawRecipe = meta?._recipe;
      let display_name_cs = 'Jídlo (neověřeno)';
      let recipeObj = null;

      if (recipeVerified && rawRecipe) {
        const rawTitle = (rawRecipe.title || '').trim();
        let cs = toTranslate.length > 0 ? (translatedNames[transIdx++] || '').trim() : '';
        if (!cs || cs === rawTitle) {
          cs = await translateRecipeTitleToCzech(rawTitle || '', meta.recipe_id);
        }
        display_name_cs = cs || 'Jídlo';
        recipeObj = {
          id: rawRecipe.id,
          title: display_name_cs,
          image: meta.image_trust_level === 'exact' ? (rawRecipe.image || null) : null,
          sourceUrl: rawRecipe.sourceUrl || null,
          readyInMinutes: rawRecipe.readyInMinutes ?? null,
          calories: meta.calories ?? null,
          protein_g: meta.protein_g ?? null,
          carbs_g: meta.carbs_g ?? null,
          fat_g: meta.fat_g ?? null,
          source: 'spoonacular',
        };
      }

      dayMeals.push({
        type: m.type,
        display_name_cs,
        display_name: display_name_cs,
        recipe_verified: recipeVerified,
        recipe_id: recipeVerified && meta?.recipe_id ? meta.recipe_id : null,
        recipe: recipeObj,
        image_url: recipeVerified && meta?.image_trust_level === 'exact' ? meta.image_url : null,
        image_trust_level: meta?.image_trust_level ?? 'none',
      });
    }
    resolved.push({ day_index: day.day_index, day_name: day.day_name, meals: dayMeals });
  }
  resolved._diag = diag;
  return resolved;
}

/** Resolve cviků – paralelizované wger. Canonical display_name_cs je jediný user-facing název. */
async function resolveWorkouts(workoutPlan, opts = {}) {
  const retries = opts.fastMode ? 1 : 2;
  const allEx = [];
  for (const w of workoutPlan?.days ?? []) {
    for (const ex of w.exercises ?? []) {
      allEx.push({ day: w, ex });
    }
  }

  const resolvedExs = await Promise.all(
    allEx.map(({ ex }) =>
      withRetry(() => resolveExercise(ex.search_term || ''), retries)
        .catch(() => ({ name: null, display_name_cs: null, canonical_key: null, image_url: null, video_url: null, source: 'none', wger_exercise_id: null }))
    )
  );

  let exIdx = 0;
  const resolved = [];
  for (const w of workoutPlan?.days ?? []) {
    const exercises = [];
    for (const ex of w.exercises ?? []) {
      const resolvedEx = resolvedExs[exIdx++];
      const exerciseVerified = resolvedEx?.source === 'wger' && (resolvedEx?.name ?? false);
      const display_name_cs = exerciseVerified ? (resolvedEx?.display_name_cs ?? 'Cvik') : 'Cvik (neověřeno)';
      exercises.push({
        name: display_name_cs,
        display_name_cs,
        canonical_key: resolvedEx?.canonical_key ?? null,
        exercise_verified: exerciseVerified,
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
  const fastMode = opts.fastMode === true;
  const [resolvedMeals, resolvedWorkouts] = await Promise.all([
    resolveMeals(structured.meal_plan, bodyMetrics?.diet_type, { fastMode, requestId }),
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
  log('info', 'Plan generated', {
    requestId,
    duration_ms: Date.now() - start,
    generationSource,
    mealsResolved,
    mealsFallback,
    exercisesResolved,
    exercisesFallback,
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
    },
  };
}
