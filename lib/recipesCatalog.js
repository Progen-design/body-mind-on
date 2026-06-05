/**
 * recipes_catalog — výběr receptů pro generátor plánu (bez live Spoonacular).
 */
import { supabaseServer } from './supabaseServer';
import { calorieRangeForMealType } from './spoonacularComplexSearch';

/**
 * Kalorické pásmo pro slot (stejná logika jako buildSpoonacularContextForMealSlot).
 * @param {object|null} bodyMetrics
 * @param {object} targets
 * @param {object} m
 */
function kcalBandForMealSlot(bodyMetrics, targets, m) {
  const mealType = m?.type || 'lunch';
  const daily = Number(targets?.calories_per_day) || 2000;
  const mealsPerDay = Number(bodyMetrics?.meals_per_day) || 3;
  const band = calorieRangeForMealType(mealType, daily, mealsPerDay);
  const tk = Number(m?.target_kcal);
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
  return { minCalories: minCal, maxCalories: maxCal };
}

/** @typedef {'snidane'|'obed'|'vecere'|'svacina'} CatalogMealType */

/**
 * @param {string} planMealType breakfast|lunch|dinner|snack
 * @returns {CatalogMealType}
 */
export function planMealTypeToCatalog(planMealType) {
  const t = String(planMealType || 'lunch').toLowerCase();
  if (t === 'breakfast') return 'snidane';
  if (t === 'dinner') return 'vecere';
  if (t === 'snack') return 'svacina';
  return 'obed';
}

/**
 * @param {object|null} bodyMetrics
 * @param {string} [dietType]
 * @returns {string[]}
 */
export function dietTagsFromProfile(bodyMetrics, dietType) {
  const d = String(dietType || bodyMetrics?.diet_type || 'standard').toLowerCase();
  if (d === 'vegan') return ['vegan'];
  if (d === 'vegetarian') return ['vegetarian'];
  if (d === 'low_carb' || d === 'low-carb') return ['low_carb'];
  if (d === 'gluten_free' || d === 'gluten-free') return ['gluten_free'];
  return [];
}

/**
 * @param {object} row
 * @param {string[]} requiredTags
 */
export function catalogRowMatchesDiet(row, requiredTags) {
  if (!requiredTags?.length) return true;
  const tags = Array.isArray(row.diet_tags) ? row.diet_tags : [];
  return requiredTags.every((t) => tags.includes(t));
}

/**
 * @param {object} params
 * @returns {Promise<object[]>}
 */
export async function fetchCatalogCandidates(params) {
  const {
    mealType,
    dietTags = [],
    minKcal = 160,
    maxKcal = 1200,
    excludeIds = new Set(),
    limit = 12,
  } = params;

  const catalogType = planMealTypeToCatalog(mealType);
  const fetchLimit = Math.max(limit * 4, 40);

  const { data, error } = await supabaseServer
    .from('recipes_catalog')
    .select(
      'id, source, source_id, name_cs, name_en, meal_type, kcal, protein_g, carbs_g, fat_g, diet_tags, servings, ingredients, instructions, spoonacular_url, image_url'
    )
    .eq('active', true)
    .eq('meal_type', catalogType)
    .gte('kcal', Math.max(80, Math.floor(minKcal)))
    .lte('kcal', Math.ceil(maxKcal))
    .limit(fetchLimit);

  if (error) {
    throw new Error(`recipes_catalog query failed: ${error.message}`);
  }

  let rows = (data || []).filter((r) => !excludeIds.has(r.id) && catalogRowMatchesDiet(r, dietTags));

  if (rows.length < limit && dietTags.length) {
    const { data: relaxed } = await supabaseServer
      .from('recipes_catalog')
      .select(
        'id, source, source_id, name_cs, name_en, meal_type, kcal, protein_g, carbs_g, fat_g, diet_tags, servings, ingredients, instructions, spoonacular_url, image_url'
      )
      .eq('active', true)
      .eq('meal_type', catalogType)
      .gte('kcal', Math.max(80, Math.floor(minKcal)))
      .lte('kcal', Math.ceil(maxKcal))
      .limit(fetchLimit);
    rows = (relaxed || []).filter((r) => !excludeIds.has(r.id));
  }

  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  return rows.slice(0, limit);
}

/**
 * @param {object} params
 * @returns {Promise<object|null>}
 */
export async function pickCatalogRecipe(params) {
  const rows = await fetchCatalogCandidates(params);
  return rows[0] ?? null;
}

/**
 * @param {object} row
 * @returns {string[]}
 */
export function ingredientLinesFromCatalogRow(row) {
  const ing = row?.ingredients;
  if (!Array.isArray(ing)) return [];
  return ing
    .map((i) => {
      if (typeof i === 'string') return i.trim();
      if (i && typeof i === 'object') {
        return String(i.original || i.name || i.text || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

/**
 * @param {object} row — recipes_catalog row
 * @param {object} [slotMeal] — původní slot z AI (type)
 * @returns {object} meal ve tvaru structured plan
 */
export function catalogRowToStructuredMeal(row, slotMeal = {}) {
  const sourceIdNum = row.source_id != null && /^\d+$/.test(String(row.source_id)) ? Number(row.source_id) : null;
  const recipeId = sourceIdNum ?? row.id;
  const imageUrl =
    (row.image_url && String(row.image_url).trim()) ||
    (sourceIdNum != null ? `https://img.spoonacular.com/recipes/${sourceIdNum}-312x231.jpg` : null);

  const recipeObj = {
    id: recipeId,
    title: row.name_en || row.name_cs,
    title_cs: row.name_cs,
    image: imageUrl,
    source_url: row.spoonacular_url || null,
    sourceUrl: row.spoonacular_url || null,
    ready_in_minutes: null,
    calories: Math.round(Number(row.kcal) || 0),
    protein_g: row.protein_g != null ? Number(row.protein_g) : null,
    carbs_g: row.carbs_g != null ? Number(row.carbs_g) : null,
    fat_g: row.fat_g != null ? Number(row.fat_g) : null,
    source: 'catalog',
  };

  const shoppingIngredientLines = ingredientLinesFromCatalogRow(row);
  const display_name_cs = String(row.name_cs || row.name_en || 'Jídlo').trim();

  return {
    type: slotMeal.type || 'lunch',
    name_cs: display_name_cs,
    ai_name: slotMeal.ai_name || null,
    display_name_cs,
    display_name: display_name_cs,
    planner_suggestion_cs: slotMeal.name_cs && slotMeal.name_cs !== display_name_cs ? slotMeal.name_cs : null,
    recipe_verified: true,
    kcal: Math.round(Number(row.kcal) || 0),
    recipe_id: recipeId,
    recipe: recipeObj,
    image_url: imageUrl,
    image_trust_level: imageUrl ? 'exact' : 'none',
    shopping_ingredient_lines: shoppingIngredientLines,
    catalog_id: row.id,
    catalog_source: row.source,
  };
}

/**
 * Hlavní swap: jídla z recipes_catalog místo Spoonacular.
 * @param {object} mealPlan
 * @param {string} dietType
 * @param {object} opts
 */
export async function resolveMealsFromCatalog(mealPlan, dietType, opts = {}) {
  const bodyMetrics = opts.bodyMetrics ?? null;
  const targets = opts.targets ?? {};
  const dailyTarget = Number(targets.calories_per_day) || Number(bodyMetrics?.calories_target) || 2200;
  const dietTags = dietTagsFromProfile(bodyMetrics, dietType);
  const usedCatalogIds = new Set();
  const resolved = [];
  let verified = 0;
  let unverified = 0;

  for (const day of mealPlan?.days ?? []) {
    const dayMeals = [];
    const slotRefs = [];

    for (const m of day.meals ?? []) {
      const bandCtx = kcalBandForMealSlot(bodyMetrics, targets, m);
      let row = await pickCatalogRecipe({
        mealType: m.type || 'lunch',
        dietTags,
        minKcal: bandCtx.minCalories,
        maxKcal: bandCtx.maxCalories,
        excludeIds: usedCatalogIds,
        limit: 12,
      });

      if (!row) {
        const wide = calorieRangeForMealType(
          m.type || 'lunch',
          dailyTarget,
          bodyMetrics?.meals_per_day ?? 3
        );
        row = await pickCatalogRecipe({
          mealType: m.type || 'lunch',
          dietTags: [],
          minKcal: wide.min,
          maxKcal: wide.max,
          excludeIds: usedCatalogIds,
          limit: 12,
        });
      }

      if (!row) {
        row = await pickCatalogRecipe({
          mealType: m.type || 'lunch',
          dietTags: [],
          minKcal: 80,
          maxKcal: 2000,
          excludeIds: usedCatalogIds,
          limit: 24,
        });
      }

      if (!row) {
        row = await pickCatalogRecipe({
          mealType: m.type || 'lunch',
          dietTags: [],
          minKcal: 80,
          maxKcal: 2000,
          excludeIds: new Set(),
          limit: 24,
        });
      }

      if (!row) {
        unverified++;
        dayMeals.push({
          type: m.type || 'lunch',
          name_cs: m.name_cs || 'Jídlo',
          display_name_cs: m.name_cs || 'Jídlo',
          display_name: m.name_cs || 'Jídlo',
          recipe_verified: false,
          kcal: null,
          recipe: null,
          image_url: null,
          image_trust_level: 'none',
          shopping_ingredient_lines: [],
        });
        slotRefs.push(null);
        continue;
      }

      usedCatalogIds.add(row.id);
      const mealOut = catalogRowToStructuredMeal(row, m);
      dayMeals.push(mealOut);
      slotRefs.push(row);
      verified++;
    }

    let dayKcal = dayMeals.reduce((s, meal) => s + (Number(meal.kcal) || 0), 0);
    const lo = Math.round(dailyTarget * 0.85);
    const hi = Math.round(dailyTarget * 1.1);

    if (dayKcal < lo) {
      let bestIdx = -1;
      let bestGain = 0;
      for (let i = 0; i < dayMeals.length; i++) {
        const m = day.meals?.[i];
        const bandCtx = kcalBandForMealSlot(bodyMetrics, targets, m);
        const minBoost = Math.max(bandCtx.minCalories, Math.round((lo - dayKcal) * 0.6));
        const candidates = await fetchCatalogCandidates({
          mealType: m?.type || 'lunch',
          dietTags: [],
          minKcal: minBoost,
          maxKcal: Math.min(1200, bandCtx.maxCalories + 200),
          excludeIds: usedCatalogIds,
          limit: 8,
        });
        const pick = candidates[0];
        if (!pick) continue;
        const gain = Number(pick.kcal) - (Number(dayMeals[i].kcal) || 0);
        if (gain > bestGain) {
          bestGain = gain;
          bestIdx = i;
          slotRefs[i] = pick;
        }
      }
      if (bestIdx >= 0 && slotRefs[bestIdx]) {
        const oldId = dayMeals[bestIdx]?.catalog_id;
        if (oldId != null) usedCatalogIds.delete(oldId);
        usedCatalogIds.add(slotRefs[bestIdx].id);
        dayMeals[bestIdx] = catalogRowToStructuredMeal(slotRefs[bestIdx], day.meals?.[bestIdx] || {});
        dayKcal = dayMeals.reduce((s, meal) => s + (Number(meal.kcal) || 0), 0);
      }
    }

    if (dayKcal > hi) {
      for (let i = 0; i < dayMeals.length && dayKcal > hi; i++) {
        const m = day.meals?.[i];
        const current = Number(dayMeals[i].kcal) || 0;
        if (current < 350) continue;
        const bandCtx = kcalBandForMealSlot(bodyMetrics, targets, m);
        const candidates = await fetchCatalogCandidates({
          mealType: m?.type || 'lunch',
          dietTags: [],
          minKcal: bandCtx.minCalories,
          maxKcal: Math.min(current - 50, bandCtx.maxCalories),
          excludeIds: usedCatalogIds,
          limit: 8,
        });
        const pick = candidates[0];
        if (!pick) continue;
        const oldId = dayMeals[i]?.catalog_id;
        if (oldId != null) usedCatalogIds.delete(oldId);
        usedCatalogIds.add(pick.id);
        dayMeals[i] = catalogRowToStructuredMeal(pick, m || {});
        slotRefs[i] = pick;
        dayKcal = dayMeals.reduce((s, meal) => s + (Number(meal.kcal) || 0), 0);
      }
    }

    resolved.push({
      day_index: day.day_index,
      day_name: day.day_name,
      meals: dayMeals,
      _day_kcal: dayKcal,
    });
  }

  if (verified === 0) {
    const err = new Error('CATALOG_EMPTY: recipes_catalog neobsahuje žádné použitelné recepty pro plán.');
    err.permanent = true;
    err.code = 'CATALOG_EMPTY';
    throw err;
  }

  resolved._diag = {
    spoonacular_requests_total: 0,
    meals_resolved_primary: verified,
    meals_resolved_fallback: 0,
    meals_unverified: unverified,
    average_confidence_score: verified > 0 ? 1 : 0,
    catalog_used: true,
    catalog_recipes_used: usedCatalogIds.size,
  };

  console.log('[catalog-resolve] resolveMealsFromCatalog complete', {
    SPOONACULAR_MODE: process.env.SPOONACULAR_MODE || 'off',
    spoonacular_http_calls: 0,
    catalog_recipes_used: usedCatalogIds.size,
    meals_verified: verified,
    meals_unverified: unverified,
  });

  return resolved;
}

/**
 * Odhad meal_type z českého názvu (pro import z meal_metadata_cache).
 * @param {string} name
 * @returns {CatalogMealType}
 */
export function inferCatalogMealTypeFromCsName(name) {
  const n = String(name || '').toLowerCase();
  if (/smoothie|ovesn|jogurt|vejce|tvaroh|toast|müsli|muesli|palačink|omelet|kaše|snídan/i.test(n)) {
    return 'snidane';
  }
  if (/svačin|snack|ořech|jogurt s ořechy/i.test(n)) return 'svacina';
  if (/večeř|vecer|grilovaný losos$|ryba se zeleninou$/i.test(n)) return 'vecere';
  return 'obed';
}
