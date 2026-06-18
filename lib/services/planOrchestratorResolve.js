/**
 * lib/services/planOrchestratorResolve.js
 * Resolve jídel z recipes_catalog + cviků z wger (bez runtime Spoonacular).
 */
import { buildSpoonacularContext, calorieRangeForMealType } from '../spoonacularComplexSearch';
import { resolveExercise } from './exerciseProviderRegistry';
import { supabaseServer } from '../supabaseServer';
import { resolveMealsFromCatalog } from '../recipesCatalog';
import { getCanonicalExercise } from '../exerciseCanonicalMap';

/** Důvěryhodná identita cviku — hit v exercise_asset_registry nebo CANONICAL_EXERCISES (ne čistý live wger guess). */
function isTrustedCatalogExerciseIdentity(canonicalKey, registryRowsByKey) {
  const k = typeof canonicalKey === 'string' ? canonicalKey.trim().toLowerCase() : '';
  if (!k) return false;
  if (registryRowsByKey instanceof Map && registryRowsByKey.has(k)) return true;
  return Boolean(getCanonicalExercise(k));
}

/**
 * Per-meal target kcal pásma (sdíleno s katalogovým výběrem).
 * @param {object|null} bodyMetrics
 * @param {object} targets
 * @param {object} m
 */
export function buildSpoonacularContextForMealSlot(bodyMetrics, targets, m) {
  const mealType = m?.type || 'lunch';
  const base = buildSpoonacularContext(bodyMetrics, targets, mealType);
  const tk = Number(m?.target_kcal);
  const pMin = m?.protein_min != null ? Number(m.protein_min) : null;
  const cMin = m?.carbs_min != null ? Number(m.carbs_min) : null;
  const daily = Number(targets?.calories_per_day) || 2000;
  const mealsPerDay = Number(bodyMetrics?.meals_per_day) || 3;
  const out = { ...base };
  const band = calorieRangeForMealType(mealType, daily, mealsPerDay);
  let minCal = band.min;
  let maxCal = band.max;
  if (Number.isFinite(tk) && tk > 120 && tk < 4000) {
    const gLo = Math.round(tk * 0.85);
    const gHi = Math.round(tk * 1.15);
    const lo = Math.max(band.min, gLo);
    const hi = Math.min(band.max, gHi);
    if (lo <= hi) {
      minCal = lo;
      maxCal = hi;
    }
  }
  out.minCalories = minCal;
  out.maxCalories = maxCal;
  if (Number.isFinite(pMin) && pMin >= 5) {
    out.minProtein = String(Math.round(pMin));
  } else if (mealType === 'lunch' || mealType === 'dinner') {
    out.minProtein = '18';
  } else if (mealType === 'breakfast') {
    out.minProtein = '12';
  }
  if (Number.isFinite(cMin) && cMin >= 5) {
    out.minCarbs = String(Math.round(cMin));
  } else if (mealType === 'breakfast') {
    out.minCarbs = String(Math.max(12, Math.min(42, Math.round(daily * 0.02))));
  } else if (mealType === 'lunch' || mealType === 'dinner') {
    out.minCarbs = String(Math.max(15, Math.min(68, Math.round(daily * 0.028))));
  }
  return out;
}

/** Runtime plán nevolá Spoonacular — strop 0. */
export const MAX_SPOONACULAR_REQUESTS_PER_PLAN = 0;

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
      if (e?.permanent === true) throw e;
      if (i < retries && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Resolve jídel — výběr z recipes_catalog (žádné live Spoonacular HTTP).
 */
export async function resolveMeals(mealPlan, diet, opts = {}) {
  return resolveMealsFromCatalog(mealPlan, diet, opts);
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
        gif_url: null,
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
      const canonicalKey = resolvedEx?.canonical_key ?? ex.canonical_key ?? null;
      const registryCs = canonicalKey ? registryNameCsByKey.get(canonicalKey) : null;
      const resolvedDisplayName =
        (resolvedEx?.display_name_cs || '').trim() ||
        (registryCs || '').trim() ||
        (ex.name_cs || '').trim() ||
        (resolvedEx?.name || '').trim();
      const exerciseVerified =
        isTrustedCatalogExerciseIdentity(canonicalKey, registryRowsByKey) && Boolean(resolvedDisplayName);
      const display_name_cs = exerciseVerified
        ? resolvedDisplayName || 'Cvik'
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
        canonical_key: canonicalKey,
        exercise_verified: exerciseVerified,
        sets: ex.sets ?? 3,
        reps: ex.reps ?? null,
        duration_sec: ex.duration_sec ?? null,
        image_url: resolvedEx?.image_url ?? null,
        gif_url: resolvedEx?.gif_url ?? null,
        video_url: resolvedEx?.video_url ?? null,
        source: resolvedEx?.source ?? 'none',
        wger_exercise_id: resolvedEx?.wger_exercise_id ?? null,
      });
    }
    resolved.push({ day_index: w.day_index, exercises });
  }
  return resolved;
}
