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
import { batchTranslateVerifiedRecipeTitles } from '../recipeTitleTranslator';

/**
 * // FIX (ab2652e+): per-meal target kcal / minP / minCarbs + stejné pásma jako globální profil.
 * @param {object|null} bodyMetrics
 * @param {object} targets
 * @param {object} m – normalizované jídlo ze slotu (může mít target_kcal z GPT)
 */
export function buildSpoonacularContextForMealSlot(bodyMetrics, targets, m) {
  const mealType = m?.type || 'lunch';
  const base = buildSpoonacularContext(bodyMetrics, targets, mealType);
  const tk = Number(m?.target_kcal);
  const pMin = m?.protein_min != null ? Number(m.protein_min) : null;
  const cMin = m?.carbs_min != null ? Number(m.carbs_min) : null;
  const daily = Number(targets?.calories_per_day) || 2000;
  const out = { ...base };
  if (Number.isFinite(tk) && tk > 120 && tk < 2600) {
    out.minCalories = Math.round(tk * 0.85);
    out.maxCalories = Math.round(tk * 1.15);
  }
  if (Number.isFinite(pMin) && pMin >= 5) {
    out.minProtein = String(Math.round(pMin));
  } else if (mealType === 'lunch' || mealType === 'dinner') {
    out.minProtein = '18';
  } else if (mealType === 'breakfast') {
    out.minProtein = '12';
  }
  if (Number.isFinite(cMin) && cMin >= 5) {
    out.minCarbs = String(Math.round(cMin));
  } else if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
    out.minCarbs = String(Math.max(15, Math.min(90, Math.round(daily * 0.045))));
  }
  return out;
}

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
  const fid =
    lookupStaticSpoonacularRecipeId(null, nameCz) ??
    (q ? lookupStaticSpoonacularRecipeId(q, null) : null);
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

  function mealMetaRecipeId(meta) {
    const n = meta?.recipe_id != null ? Number(meta.recipe_id) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  function applyStaticMealFallback(meal, label, query) {
    const nameCs = typeof meal?.name_cs === 'string' ? meal.name_cs.trim() : '';
    const staticId =
      lookupStaticSpoonacularRecipeId(null, nameCs) ??
      (query ? lookupStaticSpoonacularRecipeId(query, null) : null);
    if (staticId == null) return null;
    const meta = syntheticMetaFromStaticRecipeId(staticId, nameCs || label || query || 'Meal');
    ensureSpoonacularMealImageUrl(meta);
    return meta;
  }

  async function resolvePrimaryMealMeta(entry) {
    const { m, searchQuery } = entry;
    const query = (searchQuery || '').trim();
    const label =
      (typeof m?.name_cs === 'string' && m.name_cs.trim()) ||
      (typeof m?.ai_name === 'string' && m.ai_name.trim()) ||
      query ||
      'Meal';
    const mealType = m?.type || 'lunch';
    if (!query) {
      return applyStaticMealFallback(m, label, '') || emptyMeta(label);
    }
    const spoonacularContext = buildSpoonacularContextForMealSlot(bodyMetrics, targets, m);
    const mealSearchOpts = {
      ...mealSearchOptsBase,
      spoonacularContext,
      nameCs: typeof m?.name_cs === 'string' ? m.name_cs.trim() : undefined,
    };
    let meta = await withRetry(
      () => getMealData(query, mealSearchOpts),
      retries,
      fastMode ? 500 : SPOONACULAR_RETRY_DELAY_MS
    ).catch(() => null);
    if (meta && typeof meta === 'object') {
      ensureSpoonacularMealImageUrl(meta);
      if (mealMetaRecipeId(meta) != null) {
        console.log(
          '[SPOON]',
          mealType,
          m?.spoonacular_query || m?.query || m?.search_query || query,
          '→',
          meta.recipe_id ?? null,
          meta?.image_url ?? null
        );
        return meta;
      }
    }
    const staticMeta = applyStaticMealFallback(m, label, query);
    if (staticMeta) {
      console.log(
        '[SPOON]',
        mealType,
        m?.spoonacular_query || m?.query || m?.search_query || query,
        '→ static-fallback',
        staticMeta.recipe_id ?? null,
        staticMeta?.image_url ?? null
      );
      return staticMeta;
    }
    return meta && typeof meta === 'object' ? meta : emptyMeta(label);
  }

  let refetchSpoonacularCalls = 0;
  const metas = await Promise.all(allMeals.map((entry) => resolvePrimaryMealMeta(entry)));
  const baseShortlist = mealSearchOptsBase.shortlistSize ?? 3;

  /**
   * Per-slot refetch s exclude setem. Vrací nový meta, pokud Spoonacular našel jiný recept,
   * jinak null. Aktualizuje refetchSpoonacularCalls a loguje.
   */
  async function refetchUniqueMeta(entry, excludeSet, logLabel) {
    const { m, searchQuery } = entry;
    const query = (searchQuery || '').trim();
    if (!query) return null;
    const spoonacularContext = buildSpoonacularContextForMealSlot(bodyMetrics, targets, m);
    const mealSearchOpts = {
      ...mealSearchOptsBase,
      spoonacularContext,
      shortlistSize: Math.max(3, baseShortlist, 8),
      excludeRecipeIds: new Set(excludeSet),
      nameCs: typeof m?.name_cs === 'string' ? m.name_cs.trim() : undefined,
    };
    try {
      const refetched = await withRetry(
        () => getMealData(query, mealSearchOpts),
        retries,
        fastMode ? 500 : SPOONACULAR_RETRY_DELAY_MS
      );
      refetchSpoonacularCalls += refetched?._spoonacularCalls ?? 0;
      if (refetched && typeof refetched === 'object') {
        ensureSpoonacularMealImageUrl(refetched);
        const refetchedRid = mealMetaRecipeId(refetched);
        if (refetchedRid != null && !excludeSet.has(refetchedRid)) {
          console.log(
            '[SPOON]',
            m?.type,
            m?.spoonacular_query || m?.query || m?.search_query || query,
            `→ ${logLabel}`,
            refetched.recipe_id ?? null,
            refetched?.image_url ?? null
          );
          return refetched;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * 1. průchod: globální dedupe (nejednou vrátí stejný RID za den).
   * Tady jen značíme RIDs co se objevují vícekrát, ale nezamykáme.
   */
  const usedRecipeIds = new Set();
  for (let i = 0; i < metas.length; i++) {
    const { m, searchQuery } = allMeals[i];
    const query = (searchQuery || '').trim();
    if (!query) continue;
    const rid = mealMetaRecipeId(metas[i]);
    if (rid != null && usedRecipeIds.has(rid)) {
      const refetched = await refetchUniqueMeta(allMeals[i], usedRecipeIds, 'dedupe-refetch');
      if (refetched) metas[i] = refetched;
    }
    if (metas[i] && typeof metas[i] === 'object') ensureSpoonacularMealImageUrl(metas[i]);
    metas[i] = metas[i] && typeof metas[i] === 'object' ? { ...metas[i] } : metas[i];
    const finalRid = mealMetaRecipeId(metas[i]);
    if (finalRid != null) usedRecipeIds.add(finalRid);
  }

  /**
   * 2. průchod: striktní pravidla pro týdenní plán:
   *  - žádné RID se nesmí opakovat víc než MAX_WEEKLY_RECIPE_REPEATS (=2).
   *  - žádné dva po sobě jdoucí dny ve stejném meal_type nesmí mít stejný RID.
   * Pokud refetch nenajde alternativu, zneplatníme recept (recipe_id=null, _recipe=null) –
   * renderer pak korektně zobrazí em-dash makra místo falešného duplikátu.
   */
  const MAX_WEEKLY_RECIPE_REPEATS = 2;

  const dayIndexBySlot = (() => {
    const dayKey = (entry) => entry?.day?.day_index ?? entry?.day?.day_name ?? null;
    const order = [];
    const seen = new Map();
    for (let i = 0; i < allMeals.length; i++) {
      const k = dayKey(allMeals[i]);
      if (k == null) {
        order.push(null);
        continue;
      }
      if (!seen.has(k)) seen.set(k, seen.size);
      order.push(seen.get(k));
    }
    return order;
  })();

  function ridCounts() {
    const counts = new Map();
    for (let i = 0; i < metas.length; i++) {
      const rid = mealMetaRecipeId(metas[i]);
      if (rid != null) counts.set(rid, (counts.get(rid) || 0) + 1);
    }
    return counts;
  }

  function findConsecutiveDuplicateSlot() {
    for (let i = 0; i < metas.length; i++) {
      const rid = mealMetaRecipeId(metas[i]);
      if (rid == null) continue;
      const mealType = allMeals[i].m?.type;
      const dayIdx = dayIndexBySlot[i];
      for (let j = 0; j < i; j++) {
        if (mealMetaRecipeId(metas[j]) !== rid) continue;
        if (allMeals[j].m?.type !== mealType) continue;
        const prevDay = dayIndexBySlot[j];
        if (prevDay != null && dayIdx != null && Math.abs(dayIdx - prevDay) === 1) {
          return i;
        }
      }
    }
    return -1;
  }

  function findOverRepeatedSlot() {
    const counts = ridCounts();
    let worstRid = null;
    let worstCount = 0;
    for (const [rid, c] of counts.entries()) {
      if (c > MAX_WEEKLY_RECIPE_REPEATS && c > worstCount) {
        worstRid = rid;
        worstCount = c;
      }
    }
    if (worstRid == null) return -1;
    let lastIdx = -1;
    for (let i = 0; i < metas.length; i++) {
      if (mealMetaRecipeId(metas[i]) === worstRid) lastIdx = i;
    }
    return lastIdx;
  }

  function invalidateMeta(meta, label) {
    return {
      ...(meta || {}),
      recipe_id: null,
      _recipe: null,
      image_trust_level: 'none',
      illustrative_source: null,
      exact_source: null,
      confidence_score: 0,
      _fromStaticFallback: false,
      _invalidatedReason: label,
    };
  }

  const MAX_REBALANCE_ITERATIONS = metas.length * 2;
  const initialCounts = ridCounts();
  const maxInitialRepeats = Array.from(initialCounts.values()).reduce((mx, v) => Math.max(mx, v), 0);
  const dedupeStats = {
    version: 'v2',
    started: true,
    iterations: 0,
    refetched: 0,
    invalidated: 0,
    initial_max_repeats: maxInitialRepeats,
    initial_consecutive_dup: findConsecutiveDuplicateSlot() >= 0,
  };
  console.log('[DEDUPE_V2] start', {
    total_slots: metas.length,
    unique_rids: initialCounts.size,
    max_initial_repeats: maxInitialRepeats,
    has_consecutive_dup: dedupeStats.initial_consecutive_dup,
  });
  for (let iter = 0; iter < MAX_REBALANCE_ITERATIONS; iter++) {
    let slotIdx = findOverRepeatedSlot();
    let violationLabel = 'repeat-rebalance';
    if (slotIdx < 0) {
      slotIdx = findConsecutiveDuplicateSlot();
      violationLabel = 'consecutive-day-rebalance';
    }
    if (slotIdx < 0) break;

    const exclude = new Set();
    for (let j = 0; j < metas.length; j++) {
      if (j === slotIdx) continue;
      const rid = mealMetaRecipeId(metas[j]);
      if (rid != null) exclude.add(rid);
    }
    dedupeStats.iterations++;
    const refetched = await refetchUniqueMeta(allMeals[slotIdx], exclude, violationLabel);
    if (refetched) {
      dedupeStats.refetched++;
      metas[slotIdx] = refetched;
    } else {
      dedupeStats.invalidated++;
      const entry = allMeals[slotIdx];
      logOrchestrator('warn', 'No unique alternative recipe found, invalidating slot', {
        meal_index: slotIdx,
        meal_type: entry.m?.type ?? null,
        search_query: (entry.searchQuery || '').trim() || null,
        violation: violationLabel,
        weekly_repeats_for_offending_rid: Array.from(ridCounts().values()).reduce(
          (mx, v) => Math.max(mx, v),
          0
        ),
      });
      metas[slotIdx] = invalidateMeta(metas[slotIdx], violationLabel);
    }
  }

  if (findOverRepeatedSlot() >= 0 || findConsecutiveDuplicateSlot() >= 0) {
    logOrchestrator('warn', 'Recipe diversity rules still violated after rebalance', {
      counts: Array.from(ridCounts().entries()).map(([rid, c]) => ({ rid, count: c })),
    });
  }

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
  for (const meta of metas) {
    diag.spoonacular_requests_total += meta?._spoonacularCalls ?? 0;
  }
  diag.spoonacular_requests_total += refetchSpoonacularCalls;
  diag.meals_resolved_primary = metas.filter(isRecipeVerified).length;

  const MAX_FALLBACK_ATTEMPTS = fastMode ? 1 : 3;
  const attemptedFallbackQueries = allMeals.map(() => []);
  await Promise.all(
    metas.map(async (meta, i) => {
      if (isRecipeVerified(meta)) return;
      const { m } = allMeals[i];
      const fallbacks = getFallbackMealQueries(diet, m?.type || 'breakfast');
      // Fallback loop dříve neměl ponětí o RIDs už použitých v jiných slotech – mohl tak vracet duplikát
      // (typicky 4× Chocolate Oatmeal pro 4 různé snídaně, protože všechny fallback queries vrátí stejný top recept).
      // Posbíráme aktuální RIDs (snapshot, ne race-free, ale rozumný kompromis pro paralelní iteraci).
      const existingRids = new Set();
      for (let k = 0; k < metas.length; k++) {
        if (k === i) continue;
        const rid = mealMetaRecipeId(metas[k]);
        if (rid != null) existingRids.add(rid);
      }
      for (let j = 0; j < Math.min(MAX_FALLBACK_ATTEMPTS, fallbacks.length); j++) {
        if (diag.spoonacular_requests_total >= MAX_SPOONACULAR_REQUESTS_PER_PLAN) break;
        const fq = fallbacks[j];
        attemptedFallbackQueries[i].push(fq);
        try {
          const spoonacularContext = buildSpoonacularContextForMealSlot(bodyMetrics, targets, m);
          const mealSearchOpts = {
            ...mealSearchOptsBase,
            spoonacularContext,
            nameCs: typeof m?.name_cs === 'string' ? m.name_cs.trim() : undefined,
            excludeRecipeIds: new Set(existingRids),
          };
          const fallbackMeta = await getMealData(fq, mealSearchOpts);
          if (fallbackMeta && typeof fallbackMeta === 'object') ensureSpoonacularMealImageUrl(fallbackMeta);
          console.log('[SPOON]', m?.type, fq, '→', fallbackMeta?.recipe_id ?? null, fallbackMeta?.image_url ?? null);
          diag.spoonacular_requests_total += fallbackMeta?._spoonacularCalls ?? 0;
          if (isRecipeVerified(fallbackMeta)) {
            const fbRid = mealMetaRecipeId(fallbackMeta);
            if (fbRid == null || !existingRids.has(fbRid)) {
              metas[i] = fallbackMeta;
              if (fbRid != null) existingRids.add(fbRid);
              return;
            }
          }
        } catch {
          // next fallback
        }
      }
    })
  );

  /**
   * Druhý průchod dedupe — po fallback loop. Fallback mohl injektovat duplikát i přes exclude
   * (rescue cestou ve searchMealMetadata). Znovu vynutíme pravidla.
   */
  for (let iter = 0; iter < MAX_REBALANCE_ITERATIONS; iter++) {
    let slotIdx = findOverRepeatedSlot();
    let violationLabel = 'post-fallback-repeat';
    if (slotIdx < 0) {
      slotIdx = findConsecutiveDuplicateSlot();
      violationLabel = 'post-fallback-consecutive';
    }
    if (slotIdx < 0) break;

    const exclude = new Set();
    for (let j = 0; j < metas.length; j++) {
      if (j === slotIdx) continue;
      const rid = mealMetaRecipeId(metas[j]);
      if (rid != null) exclude.add(rid);
    }
    dedupeStats.iterations++;
    const refetched = await refetchUniqueMeta(allMeals[slotIdx], exclude, violationLabel);
    if (refetched) {
      dedupeStats.refetched++;
      metas[slotIdx] = refetched;
    } else {
      dedupeStats.invalidated++;
      metas[slotIdx] = invalidateMeta(metas[slotIdx], violationLabel);
    }
  }
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
  diag.dedupe_v2 = dedupeStats;

  function slotRecipeVerifiedForTranslate(meta) {
    const rawRecipe = meta?._recipe;
    return (
      !!rawRecipe &&
      rawRecipe.id != null &&
      Number.isFinite(Number(rawRecipe.id)) &&
      (meta?.image_trust_level === 'exact' || (meta?.confidence_score ?? 0) >= MEAL_CONFIDENCE_THRESHOLD)
    );
  }

  const translateJobs = [];
  for (let ti = 0; ti < allMeals.length; ti++) {
    const meta = metas[ti];
    const raw = meta?._recipe;
    if (slotRecipeVerifiedForTranslate(meta) && raw?.title) {
      translateJobs.push({
        slotIndex: ti,
        enTitle: raw.title,
        mealType: allMeals[ti]?.m?.type,
      });
    }
  }
  const translationMap = await batchTranslateVerifiedRecipeTitles(translateJobs);

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

      const tr = translationMap.get(i);
      if (recipeObj && tr?.title_cs) {
        recipeObj.title_cs = tr.title_cs;
      }

      const shoppingIngredientLines =
        recipeVerified && rawRecipe ? extractIngredientLinesFromSpoonacularRecipe(rawRecipe) : [];

      if (recipeVerified && rawRecipe && tr?.short_name) {
        display_name_cs = tr.short_name;
      }
      if (isGenericUserMealLabel(display_name_cs)) {
        display_name_cs = fallbackDisplayFromMealPlannerFields(m, plannerRaw);
      }

      const illustrativeRecipeId =
        meta?.recipe_id != null && Number.isFinite(Number(meta.recipe_id)) ? Number(meta.recipe_id) : null;
      const mealOut = {
        type: m.type,
        name_cs: (m.name_cs || '').trim() || null,
        ai_name: (m.ai_name || '').trim() || null,
        display_name_cs,
        display_name: display_name_cs,
        planner_suggestion_cs: plannerRaw && !isGenericUserMealLabel(plannerRaw) ? plannerRaw : null,
        recipe_verified: recipeVerified,
        kcal:
          recipeObj?.calories != null && Number.isFinite(Number(recipeObj.calories))
            ? Math.round(Number(recipeObj.calories))
            : null,
        recipe_id:
          recipeVerified && recipeObj?.id != null
            ? Number(recipeObj.id)
            : illustrativeRecipeId,
        recipe: recipeObj,
        image_url: spoonacularImageUrl,
        image_trust_level: meta?.image_trust_level ?? (spoonacularImageUrl ? 'illustrative' : 'none'),
        shopping_ingredient_lines: shoppingIngredientLines,
      };
      ensureImageUrl(mealOut, meta, m);
      if (mealOut.image_url && (!mealOut.image_trust_level || mealOut.image_trust_level === 'none')) {
        mealOut.image_trust_level = meta?.image_trust_level ?? 'illustrative';
      }
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
  /** @type {Map<string, object>} */
  const registryRowsByKey = new Map();
  const registryNameCsByKey = new Map();
  if (canonicalKeys.length) {
    try {
      const { data } = await supabaseServer
        .from('exercise_asset_registry')
        .select(
          'canonical_key, display_name_cs, gif_url, image_url, wger_exercise_image_url, body_part, target, equipment, exercisedb_name, trust_level, wger_exercise_id, wger_name_en'
        )
        .in('canonical_key', canonicalKeys);
      for (const row of data || []) {
        const k = row?.canonical_key;
        if (k) registryRowsByKey.set(k, row);
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
            registryRowsByKey,
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
