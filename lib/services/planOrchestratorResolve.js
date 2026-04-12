/**
 * lib/services/planOrchestratorResolve.js
 * Společná enrich logika (Spoonacular + wger) pro planOrchestrator a planOrchestrator_newFormat.
 */
import { MEAL_CONFIDENCE_THRESHOLD, mapSpoonacularRecipe } from '../mealEnrichment';
import { getMealData } from '../spoonacularClient';
import { buildSpoonacularContext } from '../spoonacularComplexSearch';
import { translateRecipeTitleToCzech, batchTranslateRecipeTitlesToCzech } from '../recipeLocalization';
import { resolveExercise } from './exerciseProviderRegistry';
import { getFallbackMealQueries } from './deterministicFallback';
import { extractIngredientLinesFromSpoonacularRecipe } from '../spoonacularShopping';
import { isGenericUserMealLabel, resolveTrainerMealDisplayLabel } from '../mealDisplayNameHelpers';

const SPOONACULAR_RETRY_DELAY_MS = 1000;
/** Tvrdý strop Spoonacular volání na jeden plán. */
function readSpoonacularBudget() {
  const e = Number(process.env.SPOONACULAR_MAX_REQUESTS_PER_PLAN);
  if (Number.isFinite(e) && e > 0) return Math.min(200, Math.floor(e));
  // complexSearch + případné doplnění /recipes/{id}/information u neúplných výsledků
  return 90;
}
export const MAX_SPOONACULAR_REQUESTS_PER_PLAN = readSpoonacularBudget();

function trimUsableMealLabel(s) {
  const t = (s || '').trim();
  return t && !isGenericUserMealLabel(t) ? t : '';
}

/** Nikdy „Jídlo“ – vždy z polí plánovače, jinak Zdravé jídlo. */
function fallbackDisplayFromMealPlannerFields(meal, plannerSuggestionRaw = '') {
  return (
    trimUsableMealLabel(meal?.name_cs) ||
    trimUsableMealLabel(meal?.ai_name) ||
    trimUsableMealLabel(plannerSuggestionRaw) ||
    trimUsableMealLabel(meal?.planner_suggestion_cs) ||
    'Zdravé jídlo'
  );
}

function formatUnverifiedMealDisplayCs(meal, meta) {
  const csRaw = (meal?.name_cs || meal?.ai_name || '').trim();
  const cs = csRaw && !isGenericUserMealLabel(csRaw) ? csRaw : '';
  if (cs) return cs.slice(0, 120);
  const q = (meal?.search_query || meal?.spoonacular_query || '').trim();
  if (q) {
    return q
      .split(/\s+/)
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' ')
      .slice(0, 100);
  }
  const n = meta?.name && meta.name !== 'Unknown' ? String(meta.name).trim() : '';
  if (n) return n.slice(0, 120);
  return fallbackDisplayFromMealPlannerFields(meal, '');
}

export function mealSpoonacularQuery(m) {
  const primary = (m?.spoonacular_query || m?.search_query || '').trim();
  if (primary) return primary;
  const fromCs = (m?.name_cs || m?.ai_name || '').trim().toLowerCase();
  if (fromCs) return fromCs.slice(0, 100);
  return '';
}

/** Oddělí vyhledávání pro sloty se stejným dotazem, ale jiným záměrem z plánovače (jiný name_cs). */
function mealDedupLabel(m) {
  const s = (m?.name_cs || m?.ai_name || '').trim().toLowerCase().slice(0, 80);
  return s || '__no_label__';
}

export function logOrchestrator(level, msg, data = {}) {
  const prefix = '[onboarding]';
  if (level === 'error') console.error(prefix, msg, data);
  else if (level === 'warn') console.warn(prefix, msg, data);
  else console.log(prefix, msg, data);
}

export async function withRetry(fn, retries = 2, delayMs = 0) {
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

/**
 * Resolve jídel – paralelizované Spoonacular + batch překlad.
 * Zobrazený název: resolveTrainerMealDisplayLabel (name_cs → ai_name → HTML) → dotaz / překlad Spoonacular / „Zdravé jídlo“.
 * planner_suggestion_cs = negenerický návrh z plánovače (name_cs || ai_name).
 */
export async function resolveMeals(mealPlan, diet, opts = {}) {
  const fastMode = opts.fastMode === true;
  const bodyMetrics = opts.bodyMetrics ?? null;
  const targets = opts.targets ?? {};
  const sourcePlanHtml = typeof opts.sourcePlanHtml === 'string' ? opts.sourcePlanHtml : '';
  const spoonacularCandidateCache = new Map();
  const mealSearchOptsBase = fastMode
    ? {
        maxCandidates: 1,
        timeoutMs: 3000,
        fastMode: true,
        shortlistSize: 3,
        candidateCache: spoonacularCandidateCache,
        skipDailyDedup: true,
      }
    : {
        maxCandidates: 3,
        shortlistSize: 5,
        candidateCache: spoonacularCandidateCache,
        skipDailyDedup: true,
      };
  const retries = fastMode ? 1 : 2;

  const allMeals = [];
  for (const day of mealPlan?.days ?? []) {
    for (const m of day.meals ?? []) {
      allMeals.push({ day, m, searchQuery: mealSpoonacularQuery(m) });
    }
  }

  const dedupKey = (q, mt, lb) => JSON.stringify({ q: q || '__empty__', mt: mt || 'lunch', lb: lb || '__no_label__' });
  const queryToIndices = new Map();
  for (let i = 0; i < allMeals.length; i++) {
    const q = allMeals[i].searchQuery || '__empty__';
    const mt = allMeals[i].m?.type || 'lunch';
    const lb = mealDedupLabel(allMeals[i].m);
    const key = dedupKey(q, mt, lb);
    if (!queryToIndices.has(key)) queryToIndices.set(key, []);
    queryToIndices.get(key).push(i);
  }
  const uniqueEntries = [...queryToIndices.keys()]
    .map((k) => JSON.parse(k))
    .filter((e) => e.q !== '__empty__');

  const searchResults = await Promise.all(
    uniqueEntries.map(({ q, mt }) => {
      const spoonacularContext = buildSpoonacularContext(bodyMetrics, targets, mt);
      const mealSearchOpts = { ...mealSearchOptsBase, spoonacularContext };
      return withRetry(() => getMealData(q, mealSearchOpts), retries, fastMode ? 500 : SPOONACULAR_RETRY_DELAY_MS).catch(() => null);
    })
  );

  const metas = new Array(allMeals.length).fill(null);
  uniqueEntries.forEach((entry, i) => {
    const key = dedupKey(entry.q, entry.mt, entry.lb);
    const indices = queryToIndices.get(key) || [];
    const result = searchResults[i];
    indices.forEach((idx) => {
      metas[idx] = result;
    });
  });
  const emptyMeta = (name) => ({
    name: name || 'Unknown',
    image_url: null,
    source: 'none',
    image_trust_level: 'none',
    exact_source: null,
    illustrative_source: null,
    confidence_score: 0,
    recipe_id: null,
    _recipe: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
  });
  for (let i = 0; i < metas.length; i++) {
    if (metas[i] === null) metas[i] = emptyMeta(allMeals[i].searchQuery || '');
  }

  function isRecipeVerified(meta) {
    return (
      meta?.recipe_id != null &&
      (meta?.image_trust_level === 'exact' || (meta?.confidence_score ?? 0) >= MEAL_CONFIDENCE_THRESHOLD) &&
      meta?._recipe
    );
  }

  const diag = {
    spoonacular_requests_total: 0,
    meals_resolved_primary: 0,
    meals_resolved_fallback: 0,
    meals_unverified: 0,
    average_confidence_score: 0,
    cache_hit_rate: null,
    cache_miss_rate: null,
  };
  uniqueEntries.forEach((_, i) => {
    diag.spoonacular_requests_total += searchResults[i]?._spoonacularCalls ?? 0;
  });
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
          const spoonacularContext = buildSpoonacularContext(bodyMetrics, targets, m?.type || 'breakfast');
          const mealSearchOpts = { ...mealSearchOptsBase, spoonacularContext };
          const fallbackMeta = await getMealData(fq, mealSearchOpts);
          diag.spoonacular_requests_total += fallbackMeta?._spoonacularCalls ?? 0;
          if (isRecipeVerified(fallbackMeta)) {
            metas[i] = fallbackMeta;
            return;
          }
        } catch {
          // next fallback
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
    logOrchestrator('warn', 'Meal unverified after primary + fallbacks', {
      requestId: opts.requestId || 'meal_resolve',
      meal_index: i,
      meal_type: m?.type,
      primary_search_query: primaryQ,
      fallback_queries_attempted: attemptedFallbackQueries[i],
      confidence_score: metas[i]?.confidence_score ?? null,
    });
  }
  if (diag.spoonacular_requests_total >= MAX_SPOONACULAR_REQUESTS_PER_PLAN) {
    logOrchestrator('warn', 'Spoonacular request budget reached', {
      total: diag.spoonacular_requests_total,
      cap: MAX_SPOONACULAR_REQUESTS_PER_PLAN,
    });
  }
  const confSum = metas.reduce((s, m) => s + (m?.confidence_score ?? 0), 0);
  diag.average_confidence_score = metas.length ? Math.round((confSum / metas.length) * 100) / 100 : 0;
  diag.spoonacular_requests_per_plan = diag.spoonacular_requests_total;
  diag.spoonacular_requests_per_meal = metas.length ? Math.round((diag.spoonacular_requests_total / metas.length) * 100) / 100 : 0;

  /** Batch překlad anglických titulů Spoonacular – použije se jen když chybí smysluplný český label z AI / HTML. */
  const translateJobs = [];
  for (let i = 0; i < allMeals.length; i++) {
    const meta = metas[i];
    if (!isRecipeVerified(meta) || !meta._recipe) continue;
    translateJobs.push({
      i,
      title: meta._recipe.title || '',
      recipeId: meta.recipe_id,
    });
  }
  const batchItems = translateJobs.map((j) => ({ title: j.title, recipeId: j.recipeId }));
  const batchTranslated = batchItems.length > 0 ? await batchTranslateRecipeTitlesToCzech(batchItems) : [];
  const indexToTitleCs = new Map();
  translateJobs.forEach((j, k) => {
    const rawT = (j.title || '').trim();
    let cs = (batchTranslated[k] || '').trim();
    if (!cs || cs === rawT) cs = '';
    indexToTitleCs.set(j.i, cs);
  });

  const resolved = [];
  let mealSlotIndex = 0;
  for (const day of mealPlan?.days ?? []) {
    const dayMeals = [];
    for (const m of day.meals ?? []) {
      const i = mealSlotIndex++;
      const meta = metas[i];
      const recipeVerified =
        meta?.recipe_id != null &&
        (meta?.image_trust_level === 'exact' || (meta?.confidence_score ?? 0) >= MEAL_CONFIDENCE_THRESHOLD);
      const rawRecipe = meta?._recipe;
      const plannerRaw = (m.name_cs || m.ai_name || '').trim();
      const displayPrimary = resolveTrainerMealDisplayLabel(m, sourcePlanHtml, day.day_name);
      let display_name_cs = displayPrimary || formatUnverifiedMealDisplayCs(m, meta);
      let recipeObj = null;

      if (recipeVerified && rawRecipe) {
        const rawTitle = (rawRecipe.title || '').trim();
        let cs = indexToTitleCs.get(i) || '';
        if (!cs) {
          cs = (await translateRecipeTitleToCzech(rawTitle || '', meta.recipe_id)).trim();
        }
        const translatedOk = !isGenericUserMealLabel(cs) && cs !== rawTitle;
        const safeRawTitle = rawTitle && !isGenericUserMealLabel(rawTitle) ? rawTitle : '';
        if (displayPrimary) {
          display_name_cs = displayPrimary;
        } else if (translatedOk) {
          display_name_cs = cs;
        } else {
          const fromFmt = formatUnverifiedMealDisplayCs(m, meta);
          display_name_cs =
            (fromFmt && !isGenericUserMealLabel(fromFmt) ? fromFmt : '') ||
            safeRawTitle ||
            fallbackDisplayFromMealPlannerFields(m, plannerRaw);
        }
        const mapped = mapSpoonacularRecipe(rawRecipe);
        recipeObj = {
          ...mapped,
          title: display_name_cs,
          image: meta.image_trust_level === 'exact' ? mapped.image || null : null,
          source: 'spoonacular',
          sourceUrl: mapped.source_url,
          readyInMinutes: mapped.ready_in_minutes,
          pricePerServing: mapped.price_per_serving,
          healthScore: mapped.health_score,
        };
      }

      const shoppingIngredientLines =
        recipeVerified && rawRecipe ? extractIngredientLinesFromSpoonacularRecipe(rawRecipe) : [];

      if (isGenericUserMealLabel(display_name_cs)) {
        display_name_cs = fallbackDisplayFromMealPlannerFields(m, plannerRaw);
      }

      dayMeals.push({
        type: m.type,
        name_cs: (m.name_cs || '').trim() || null,
        ai_name: (m.ai_name || '').trim() || null,
        display_name_cs,
        display_name: display_name_cs,
        planner_suggestion_cs: plannerRaw && !isGenericUserMealLabel(plannerRaw) ? plannerRaw : null,
        recipe_verified: recipeVerified,
        recipe_id: recipeVerified && meta?.recipe_id ? meta.recipe_id : null,
        recipe: recipeObj,
        image_url: recipeVerified && meta?.image_trust_level === 'exact' ? meta.image_url : null,
        image_trust_level: meta?.image_trust_level ?? 'none',
        shopping_ingredient_lines: shoppingIngredientLines,
      });
    }
    resolved.push({ day_index: day.day_index, day_name: day.day_name, meals: dayMeals });
  }
  resolved._diag = diag;
  return resolved;
}

/** Resolve cviků – wger + registry. */
export async function resolveWorkouts(workoutPlan, opts = {}) {
  const retries = opts.fastMode ? 1 : 2;
  const allEx = [];
  for (const w of workoutPlan?.days ?? []) {
    for (const ex of w.exercises ?? []) {
      allEx.push({ day: w, ex });
    }
  }

  const resolvedExs = await Promise.all(
    allEx.map(({ ex }) =>
      withRetry(
        () =>
          resolveExercise((ex.search_term || '').trim(), {
            canonicalKey: ex.canonical_key || null,
            nameHintCs: ex.name_cs || null,
          }),
        retries
      ).catch(() => ({
        name: null,
        display_name_cs: null,
        canonical_key: null,
        image_url: null,
        video_url: null,
        source: 'none',
        wger_exercise_id: null,
      }))
    )
  );

  let exIdx = 0;
  const resolved = [];
  for (const w of workoutPlan?.days ?? []) {
    const exercises = [];
    for (const ex of w.exercises ?? []) {
      const resolvedEx = resolvedExs[exIdx++];
      const exerciseVerified =
        (resolvedEx?.source === 'wger' || resolvedEx?.source === 'registry') &&
        Boolean(resolvedEx?.name || resolvedEx?.display_name_cs);
      const display_name_cs = exerciseVerified
        ? resolvedEx?.display_name_cs || ex.name_cs?.trim() || 'Cvik'
        : 'Cvik (neověřeno)';
      exercises.push({
        name: display_name_cs,
        display_name_cs,
        canonical_key: resolvedEx?.canonical_key ?? ex.canonical_key ?? null,
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
