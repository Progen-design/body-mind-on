/**
 * lib/services/planOrchestratorResolve.js
 * Společná enrich logika (Spoonacular + wger) pro planOrchestrator a planOrchestrator_newFormat.
 */
import { MEAL_CONFIDENCE_THRESHOLD, mapSpoonacularRecipe, resolveSpoonacularRecipeImageUrl } from '../mealEnrichment';
import { getMealData } from '../spoonacularClient';
import { buildSpoonacularContext } from '../spoonacularComplexSearch';
import { resolveExercise } from './exerciseProviderRegistry';
import { getFallbackMealQueries } from './deterministicFallback';
import { extractIngredientLinesFromSpoonacularRecipe } from '../spoonacularShopping';
import { isGenericUserMealLabel } from '../mealDisplayNameHelpers';
import { supabaseServer } from '../supabaseServer';
import { lookupStaticSpoonacularRecipeId } from '../mealStaticRecipeIds';

const SPOONACULAR_RETRY_DELAY_MS = 1000;
/** Tvrdý strop Spoonacular volání na jeden plán. */
function readSpoonacularBudget() {
  const e = Number(process.env.SPOONACULAR_MAX_REQUESTS_PER_PLAN);
  if (Number.isFinite(e) && e > 0) return Math.min(200, Math.floor(e));
  // complexSearch + případné doplnění /recipes/{id}/information u neúplných výsledků
  return 90;
}
export const MAX_SPOONACULAR_REQUESTS_PER_PLAN = readSpoonacularBudget();

/** Konzistentní náhled Spoonacular, když meta.image_url chybí ale máme ID. */
function ensureSpoonacularMealImageUrl(meta) {
  if (!meta || typeof meta !== 'object') return;
  const rid = meta.recipe_id != null ? Number(meta.recipe_id) : NaN;
  const hasUrl = meta.image_url && String(meta.image_url).trim();
  if (!hasUrl && Number.isFinite(rid)) {
    meta.image_url = `https://img.spoonacular.com/recipes/${rid}-312x231.jpg`;
  }
}

/** Rychlá meta bez Spoonacular HTTP — stejná mapa jako v mealEnrichment. */
function syntheticMetaFromStaticRecipeId(recipeId, label) {
  const id = Number(recipeId);
  return {
    name: (label && String(label).trim()) || 'Meal',
    image_url: `https://img.spoonacular.com/recipes/${id}-312x231.jpg`,
    source: 'spoonacular',
    image_trust_level: 'illustrative',
    illustrative_source: 'spoonacular',
    exact_source: null,
    confidence_score: 0.05,
    recipe_id: id,
    _recipe: null,
    _spoonacularCalls: 0,
    _fromStaticFallback: true,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
  };
}

/**
 * Garantovaný náhled pro každý slot — meta.recipe_id nebo mapa podle EN dotazu z plánu.
 * Volat pro každé sestavené jídlo (všechny dny v batchi).
 */
function ensureImageUrl(meal, meta, sourceMeal) {
  if (meal?.image_url && String(meal.image_url).trim()) return;
  const ridMeta = meta?.recipe_id != null ? Number(meta.recipe_id) : NaN;
  if (Number.isFinite(ridMeta)) {
    meal.image_url = `https://img.spoonacular.com/recipes/${ridMeta}-312x231.jpg`;
    if (meal.recipe_id == null) meal.recipe_id = ridMeta;
    return;
  }
  const qStr =
    (typeof meta?.spoonacular_query === 'string' && meta.spoonacular_query.trim()) ||
    mealSpoonacularQuery(sourceMeal || {}) ||
    (typeof sourceMeal?.spoonacular_query === 'string' && sourceMeal.spoonacular_query.trim()) ||
    (meal?.name_cs && String(meal.name_cs).trim()) ||
    '';
  const q = String(qStr).toLowerCase().trim();
  const nameCz =
    (sourceMeal?.name_cs && String(sourceMeal.name_cs).trim()) ||
    (meal?.name_cs && String(meal.name_cs).trim()) ||
    '';
  const fid = lookupStaticSpoonacularRecipeId(q, nameCz);
  if (fid != null) {
    meal.image_url = `https://img.spoonacular.com/recipes/${fid}-312x231.jpg`;
    if (meal.recipe_id == null) meal.recipe_id = fid;
  }
}

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

const MEAL_SPOON_QUERY_KEYS = [
  'spoonacular_query',
  'query',
  'search_query',
  'spoonacularQuery',
  'meal_search_query',
  'query_en',
];

export function mealSpoonacularQuery(m) {
  for (const k of MEAL_SPOON_QUERY_KEYS) {
    const v = m?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 100);
  }
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
 * Resolve jídel – paralelizované Spoonacular.
 * GPT plánuje slot (name_cs / dotazy); u ověřeného receptu výživa a suroviny z Spoonacular, zobrazený název v češtině z name_cs (viz mealDisplayTitleForStructuredMeal).
 */
export async function resolveMeals(mealPlan, diet, opts = {}) {
  const fastMode = opts.fastMode === true;
  const bodyMetrics = opts.bodyMetrics ?? null;
  const targets = opts.targets ?? {};
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
        shortlistSize: 3,
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
    uniqueEntries.map(async ({ q, mt, lb }) => {
      const key = dedupKey(q, mt, lb);
      const indices = queryToIndices.get(key) || [];
      const meal = indices.length ? allMeals[indices[0]].m : {};
      const staticIdEarly = lookupStaticSpoonacularRecipeId(q, meal?.name_cs);
      if (staticIdEarly != null) {
        const meta = syntheticMetaFromStaticRecipeId(staticIdEarly, meal?.name_cs || q);
        ensureSpoonacularMealImageUrl(meta);
        console.log(
          '[SPOON]',
          meal?.type ?? mt,
          meal?.spoonacular_query || meal?.query || meal?.search_query || q,
          '→ static',
          meta?.recipe_id ?? null,
          meta?.image_url ?? null
        );
        return meta;
      }
      const spoonacularContext = buildSpoonacularContext(bodyMetrics, targets, mt);
      const mealSearchOpts = {
        ...mealSearchOptsBase,
        spoonacularContext,
        nameCs: typeof meal?.name_cs === 'string' ? meal.name_cs.trim() : undefined,
      };
      const meta = await withRetry(() => getMealData(q, mealSearchOpts), retries, fastMode ? 500 : SPOONACULAR_RETRY_DELAY_MS).catch(
        () => null
      );
      if (meta && typeof meta === 'object') ensureSpoonacularMealImageUrl(meta);
      console.log(
        '[SPOON]',
        meal?.type ?? mt,
        meal?.spoonacular_query || meal?.query || meal?.search_query || q,
        '→',
        meta?.recipe_id ?? null,
        meta?.image_url ?? null
      );
      return meta;
    })
  );

  let refetchSpoonacularCalls = 0;
  const usedRecipeIds = new Set();
  const metas = new Array(allMeals.length).fill(null);
  const baseShortlist = mealSearchOptsBase.shortlistSize ?? 3;

  for (let ui = 0; ui < uniqueEntries.length; ui++) {
    const entry = uniqueEntries[ui];
    const key = dedupKey(entry.q, entry.mt, entry.lb);
    const indices = queryToIndices.get(key) || [];
    const baseResult = searchResults[ui];
    for (const idx of indices) {
      const { m } = allMeals[idx];
      let meta = baseResult;
      if (meta && typeof meta === 'object') {
        const rid = meta.recipe_id != null ? Number(meta.recipe_id) : NaN;
        if (Number.isFinite(rid) && usedRecipeIds.has(rid) && meta._fromStaticFallback === true) {
          if (meta && typeof meta === 'object') ensureSpoonacularMealImageUrl(meta);
          metas[idx] = meta && typeof meta === 'object' ? { ...meta } : meta;
          continue;
        }
        if (Number.isFinite(rid) && usedRecipeIds.has(rid)) {
          const spoonacularContext = buildSpoonacularContext(bodyMetrics, targets, m?.type || 'breakfast');
          const mealSearchOpts = {
            ...mealSearchOptsBase,
            spoonacularContext,
            shortlistSize: Math.max(3, baseShortlist, 8),
            excludeRecipeIds: new Set(usedRecipeIds),
            nameCs: typeof m?.name_cs === 'string' ? m.name_cs.trim() : undefined,
          };
          try {
            const refetched = await withRetry(
              () => getMealData(entry.q, mealSearchOpts),
              retries,
              fastMode ? 500 : SPOONACULAR_RETRY_DELAY_MS
            );
            refetchSpoonacularCalls += refetched?._spoonacularCalls ?? 0;
            console.log(
              '[SPOON]',
              m?.type,
              m?.spoonacular_query || m?.query || m?.search_query || entry.q,
              '→',
              refetched?.recipe_id ?? null,
              refetched?.image_url ?? null
            );
            if (refetched && typeof refetched === 'object') {
              meta = refetched;
              ensureSpoonacularMealImageUrl(meta);
            }
          } catch {
            /* ponechat base */
          }
        }
      }
      if (meta && typeof meta === 'object') ensureSpoonacularMealImageUrl(meta);
      metas[idx] = meta && typeof meta === 'object' ? { ...meta } : meta;
      const finalRid = metas[idx]?.recipe_id != null ? Number(metas[idx].recipe_id) : NaN;
      if (Number.isFinite(finalRid)) usedRecipeIds.add(finalRid);
    }
  }

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
  for (let i = 0; i < metas.length; i++) {
    ensureSpoonacularMealImageUrl(metas[i]);
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
  diag.spoonacular_requests_total += refetchSpoonacularCalls;
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
          const mealSearchOpts = {
            ...mealSearchOptsBase,
            spoonacularContext,
            nameCs: typeof m?.name_cs === 'string' ? m.name_cs.trim() : undefined,
          };
          const fallbackMeta = await getMealData(fq, mealSearchOpts);
          if (fallbackMeta && typeof fallbackMeta === 'object') ensureSpoonacularMealImageUrl(fallbackMeta);
          console.log('[SPOON]', m?.type, fq, '→', fallbackMeta?.recipe_id ?? null, fallbackMeta?.image_url ?? null);
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

  const resolved = [];
  let mealSlotIndex = 0;
  for (const day of mealPlan?.days ?? []) {
    const dayMeals = [];
    for (const m of day.meals ?? []) {
      const i = mealSlotIndex++;
      const meta = metas[i];
      const rawRecipe = meta?._recipe;
      const recipeVerified =
        !!rawRecipe &&
        rawRecipe.id != null &&
        Number.isFinite(Number(rawRecipe.id)) &&
        (meta?.image_trust_level === 'exact' || (meta?.confidence_score ?? 0) >= MEAL_CONFIDENCE_THRESHOLD);
      const spoonacularImageUrl =
        (meta?.image_url && String(meta.image_url).trim()) ||
        (rawRecipe ? resolveSpoonacularRecipeImageUrl(rawRecipe) : null) ||
        null;
      const plannerRaw = (m.name_cs || m.ai_name || '').trim();
      const nameCsAi = (m.name_cs || '').trim().slice(0, 120);
      /** Výchozí popisek slotu z GPT; u ověřeného receptu přepíše zobrazení titul z Spoonacular (mealDisplayTitleForStructuredMeal). */
      let display_name_cs = nameCsAi || fallbackDisplayFromMealPlannerFields(m, plannerRaw);
      let recipeObj = null;

      if (recipeVerified && rawRecipe) {
        const rawTitle = (rawRecipe.title || '').trim();
        const mapped = mapSpoonacularRecipe(rawRecipe);
        const recipeImage = mapped.image || meta.image_url || null;
        recipeObj = {
          ...mapped,
          title: rawTitle || mapped.title || null,
          image: recipeImage,
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

      const mealOut = {
        type: m.type,
        name_cs: (m.name_cs || '').trim() || null,
        ai_name: (m.ai_name || '').trim() || null,
        display_name_cs,
        display_name: display_name_cs,
        planner_suggestion_cs: plannerRaw && !isGenericUserMealLabel(plannerRaw) ? plannerRaw : null,
        recipe_verified: recipeVerified,
        recipe_id: recipeVerified && recipeObj?.id != null ? Number(recipeObj.id) : null,
        recipe: recipeObj,
        // Nutrition-only režim: žádné obrázky jídel ve výstupu.
        image_url: null,
        image_trust_level: 'none',
        shopping_ingredient_lines: shoppingIngredientLines,
      };
      dayMeals.push(mealOut);
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

  const canonicalKeys = [...new Set(allEx.map(({ ex }) => ex?.canonical_key).filter(Boolean))];
  const registryNameCsByKey = new Map();
  if (canonicalKeys.length) {
    try {
      const { data } = await supabaseServer
        .from('exercise_asset_registry')
        .select('canonical_key, display_name_cs')
        .in('canonical_key', canonicalKeys);
      for (const row of data || []) {
        const k = row?.canonical_key;
        const cs = (row?.display_name_cs || '').trim();
        if (k && cs) registryNameCsByKey.set(k, cs);
      }
    } catch {
      // non-fatal
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
      const registryCs = ex?.canonical_key ? registryNameCsByKey.get(ex.canonical_key) : null;
      const display_name_cs = exerciseVerified
        ? resolvedEx?.display_name_cs || registryCs || ex.name_cs?.trim() || 'Cvik'
        : registryCs || ex.name_cs?.trim() || resolvedEx?.display_name_cs || 'Cvik (neověřeno)';
      const name_cs =
        (registryCs || '').trim() ||
        (ex.name_cs || '').trim() ||
        (resolvedEx?.display_name_cs || '').trim() ||
        (display_name_cs && display_name_cs !== 'Cvik (neověřeno)' ? display_name_cs : '') ||
        null;
      exercises.push({
        name: display_name_cs,
        name_cs,
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
