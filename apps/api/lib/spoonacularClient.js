/**
 * lib/spoonacularClient.js
 * Živé Spoonacular jen při registraci (payload.spoonacular_registration_only) – viz spoonacularQuotaGate.js.
 * UI název jídla vždy z AI / lokalizace – viz planOrchestrator (nikdy přímo recipe.title).
 */

import { buildComplexSearchQueryString } from './spoonacularComplexSearch';
import { mapSpoonacularRecipe, searchMealMetadata } from './mealEnrichment';
import { shortenMealSearchQuery } from './mealQueryShorten';
import { spoonacularLiveOutboundEnabled } from './spoonacularQuotaGate';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const BASE = 'https://api.spoonacular.com';

/** Alias pro zkrácení dotazu (stejné pravidla jako meal enrichment). */
export function shortenQuery(query) {
  return shortenMealSearchQuery(query);
}

export { mapSpoonacularRecipe };

/**
 * Rozšířený tvar pro externí kontrakty (spoonacular_id, image_url).
 * @param {object} recipe – položka z complexSearch
 */
export function mapSpoonacularRecipeLive(recipe) {
  const m = mapSpoonacularRecipe(recipe);
  return {
    ...m,
    spoonacular_id: m.id,
    image_url: m.image,
    recipe_verified: true,
    image_trust_level: 'exact',
    source: 'spoonacular',
  };
}

/**
 * Jedno volání complexSearch – nejlepší výsledek (preferuje položku s obrázkem).
 * @param {string} query
 * @param {object} [ctx]
 * @returns {Promise<object|null>}
 */
export async function searchSpoonacularRecipe(query, ctx = {}) {
  if (!SPOONACULAR_KEY) return null;
  if (!spoonacularLiveOutboundEnabled(false)) return null;

  const raw = String(query || '').trim();
  const shortQuery = shortenMealSearchQuery(raw) || raw.split(/\s+/)[0] || raw;
  if (!shortQuery) return null;

  const qs = buildComplexSearchQueryString(
    {
      query: shortQuery,
      number: ctx.number ?? 3,
      mealType: ctx.mealType || 'lunch',
      diet: ctx.diet || 'standard',
      caloriesPerDay: ctx.caloriesPerDay ?? 2000,
      mealsPerDay: ctx.mealsPerDay ?? 3,
      intolerances: ctx.intolerances || [],
      excludeIngredients: ctx.excludeIngredients || [],
      maxReadyTime: ctx.maxReadyTime ?? 60,
      instructionsRequired: ctx.instructionsRequired !== false,
      minCalories: ctx.minCalories,
      maxCalories: ctx.maxCalories,
      minProtein: ctx.minProtein ?? '10',
      minCarbs: ctx.minCarbs,
      sort: ctx.sort,
    },
    SPOONACULAR_KEY
  );

  const url = `${BASE}/recipes/complexSearch?${qs}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 402) throw new Error('SPOONACULAR_QUOTA_EXCEEDED');
      if (res.status === 429) throw new Error('SPOONACULAR_RATE_LIMIT');
      return null;
    }
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) return null;
    const best = results.find((r) => r?.image) || results[0];
    return mapSpoonacularRecipeLive(best);
  } catch (e) {
    if (e?.message === 'SPOONACULAR_QUOTA_EXCEEDED' || e?.message === 'SPOONACULAR_RATE_LIMIT') {
      throw e;
    }
    return null;
  }
}

/**
 * Cache-first enrichment (meal_metadata_cache + denní dedup) → živé Spoonacular.
 *
 * Volání:
 * - `getMealData(query, mealSearchOpts)` – stejné jako searchMealMetadata(query, null, mealSearchOpts)
 * - `getMealData(query, mealType, userCtx, searchOpts)` – složí spoonacularContext z userCtx + searchOpts
 *
 * @param {string} query
 * @param {string|object|null} mealTypeOrOpts
 * @param {object} [userCtx]
 * @param {object} [searchOpts]
 * @returns {Promise<object>}
 */
export async function getMealData(query, mealTypeOrOpts, userCtx = {}, searchOpts = {}) {
  if (mealTypeOrOpts && typeof mealTypeOrOpts === 'object' && !Array.isArray(mealTypeOrOpts)) {
    return searchMealMetadata(query, null, mealTypeOrOpts);
  }

  const mealType = mealTypeOrOpts;
  const u = userCtx && typeof userCtx === 'object' ? userCtx : {};
  const spoonacularContext = {
    mealType: mealType || u.mealType || 'lunch',
    diet: u.diet ?? 'standard',
    intolerances: u.intolerances,
    excludeIngredients: u.excludeIngredients,
    caloriesPerDay: u.caloriesPerDay ?? 2000,
    mealsPerDay: u.mealsPerDay ?? 3,
    minCalories: u.minCalories,
    maxCalories: u.maxCalories,
    maxReadyTime: u.maxReadyTime ?? 60,
    minProtein: u.minProtein,
    minCarbs: u.minCarbs,
    sort: u.sort,
    instructionsRequired: u.instructionsRequired,
  };

  return searchMealMetadata(query, null, {
    ...searchOpts,
    spoonacularContext,
  });
}
