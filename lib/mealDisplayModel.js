import { recipeFromCatalogApiUrl, catalogLookupIdFromMeal } from './recipeDetailUrl.js';
import {
  getFullContentStartBlockReason,
  buildSimpleFallbackInstructions,
  findStartFallbackTemplate,
} from './startSimpleMealFilter.js';
import { isRecipeConsistentWithMealDisplay } from './planDataIntegrity.js';
import { findSimpleStartRecipeByTitle, buildSimpleStartLibraryMeal } from './simpleStartRecipeLibrary.js';

function toMacroNumber(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] != null && Number.isFinite(Number(obj[key]))) return Number(obj[key]);
  }
  return null;
}

function asString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isSafeExternalUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return !!trimmed && /^https?:\/\//i.test(trimmed);
}

function fallbackSourceFromMeal(meal) {
  // Real catalog meals are never treated as invented fallbacks.
  if (meal?.catalog_id != null && Number.isFinite(Number(meal.catalog_id))) {
    return null;
  }
  if (
    meal?.catalog_source === 'simple_start'
    || meal?.catalog_source === 'meal_cache'
    || meal?.catalog_source === 'spoonacular'
  ) {
    return null;
  }
  if (
    meal?.catalog_source === 'simple_start_fallback'
    || meal?.recipe?.source === 'simple_start_fallback'
  ) {
    return 'simple_start_fallback';
  }
  if (
    meal?.catalog_source === 'start_safe_fallback'
    || meal?.recipe?.source === 'start_safe_fallback'
  ) {
    return meal?.planner_source === 'simple_meal_planner_agent' ? 'simple_start_fallback' : 'start_safe_fallback';
  }
  const title = asString(meal?.display_name_cs) || asString(meal?.display_name) || asString(meal?.name_cs);
  if (meal?.planner_source === 'simple_meal_planner_agent' && !findSimpleStartRecipeByTitle(title, meal?.type)) {
    return 'simple_start_fallback';
  }
  return null;
}

function librarySourceFromMeal(meal) {
  // Catalog-backed meals: trust stored nutrition, do not overlay JS library macros.
  if (meal?.catalog_id != null && Number.isFinite(Number(meal.catalog_id))) {
    return null;
  }
  if (
    meal?.catalog_source === 'simple_start'
    || meal?.catalog_source === 'meal_cache'
    || meal?.catalog_source === 'spoonacular'
  ) {
    return null;
  }
  if (
    meal?.catalog_source === 'simple_start_library'
    || meal?.recipe?.source === 'simple_start_library'
  ) {
    return 'simple_start_library';
  }
  return null;
}

function normalizedMealType(meal) {
  return String(meal?.type || 'lunch').toLowerCase();
}

function normalizeIngredients(meal, isFallback) {
  const shopping = Array.isArray(meal?.shopping_ingredient_lines)
    ? meal.shopping_ingredient_lines.map((line) => asString(line)).filter(Boolean)
    : [];
  if (shopping.length) return shopping;

  const recipeIngredients = Array.isArray(meal?.recipe?.ingredients)
    ? meal.recipe.ingredients.map((line) => asString(line)).filter(Boolean)
    : [];
  if (recipeIngredients.length) return recipeIngredients;

  if (!isFallback && Array.isArray(meal?.ingredients)) {
    return meal.ingredients.map((line) => asString(line)).filter(Boolean);
  }
  return [];
}

function normalizeInstructions(meal, title, ingredients, isFallback) {
  const lines = Array.isArray(meal?.simple_instructions_cs)
    ? meal.simple_instructions_cs.map((line) => asString(line)).filter(Boolean)
    : [];
  if (lines.length) return lines;

  if (!isFallback) {
    const raw = asString(meal?.recipe?.instructions_cs) || asString(meal?.recipe?.instructions);
    if (raw) return [raw];
    const nested = Array.isArray(meal?.instructions) ? meal.instructions : [];
    const nestedLines = nested.map((line) => asString(line)).filter(Boolean);
    if (nestedLines.length) return nestedLines;
  }

  return buildSimpleFallbackInstructions(title, ingredients);
}

function normalizeNutrition(meal, isFallback) {
  const recipe = meal?.recipe && typeof meal.recipe === 'object' ? meal.recipe : null;
  const nutrition = meal?.nutrition && typeof meal.nutrition === 'object' ? meal.nutrition : null;
  const macros = meal?.macros && typeof meal.macros === 'object' ? meal.macros : null;

  const calories = toMacroNumber(
    (isFallback ? pick(nutrition, ['calories', 'kcal']) : null)
    ?? (isFallback ? pick(macros, ['calories', 'kcal']) : null)
    ?? (isFallback ? pick(meal, ['calories', 'kcal']) : null)
    ?? pick(recipe, ['calories', 'kcal'])
    ?? pick(nutrition, ['calories', 'kcal'])
    ?? pick(macros, ['calories', 'kcal'])
    ?? pick(meal, ['calories', 'kcal'])
  );

  const protein_g = toMacroNumber(
    (isFallback ? pick(nutrition, ['protein_g', 'protein']) : null)
    ?? (isFallback ? pick(macros, ['protein_g', 'protein']) : null)
    ?? (isFallback ? pick(meal, ['protein_g', 'protein']) : null)
    ?? pick(recipe, ['protein_g', 'protein'])
    ?? pick(nutrition, ['protein_g', 'protein'])
    ?? pick(macros, ['protein_g', 'protein'])
    ?? pick(meal, ['protein_g', 'protein'])
  );

  const carbs_g = toMacroNumber(
    (isFallback ? pick(nutrition, ['carbs_g', 'carbohydrates_g', 'carbs']) : null)
    ?? (isFallback ? pick(macros, ['carbs_g', 'carbohydrates_g', 'carbs']) : null)
    ?? (isFallback ? pick(meal, ['carbs_g', 'carbohydrates_g', 'carbs']) : null)
    ?? pick(recipe, ['carbs_g', 'carbohydrates_g', 'carbs'])
    ?? pick(nutrition, ['carbs_g', 'carbohydrates_g', 'carbs'])
    ?? pick(macros, ['carbs_g', 'carbohydrates_g', 'carbs'])
    ?? pick(meal, ['carbs_g', 'carbohydrates_g', 'carbs'])
  );

  const fat_g = toMacroNumber(
    (isFallback ? pick(nutrition, ['fat_g', 'fat']) : null)
    ?? (isFallback ? pick(macros, ['fat_g', 'fat']) : null)
    ?? (isFallback ? pick(meal, ['fat_g', 'fat']) : null)
    ?? pick(recipe, ['fat_g', 'fat'])
    ?? pick(nutrition, ['fat_g', 'fat'])
    ?? pick(macros, ['fat_g', 'fat'])
    ?? pick(meal, ['fat_g', 'fat'])
  );

  const fiber_g = toMacroNumber(
    (isFallback ? pick(nutrition, ['fiber_g', 'fiber']) : null)
    ?? (isFallback ? pick(macros, ['fiber_g', 'fiber']) : null)
    ?? (isFallback ? pick(meal, ['fiber_g', 'fiber']) : null)
    ?? pick(recipe, ['fiber_g', 'fiber'])
    ?? pick(nutrition, ['fiber_g', 'fiber'])
    ?? pick(macros, ['fiber_g', 'fiber'])
    ?? pick(meal, ['fiber_g', 'fiber'])
  );

  return { calories, protein_g, carbs_g, fat_g, fiber_g };
}

function classifyRecipeSource(meal, isFallback) {
  if (isFallback) return 'fallback';
  if (meal?.catalog_source === 'simple_start_library' || meal?.recipe?.source === 'simple_start_library') return 'simple_start_library';
  if (meal?.catalog_id != null || meal?.recipe?.source === 'catalog') return 'catalog';
  const direct = meal?.recipe?.sourceUrl || meal?.recipe?.source_url || meal?.recipe?.url || meal?.spoonacular_url || null;
  if (isSafeExternalUrl(direct)) return 'external';
  return 'none';
}

function buildConsistencyStatus(meal, title, ingredients, instructions, recipeSource, isFallback) {
  if (!meal || typeof meal !== 'object') return 'invalid:missing_meal';
  if (!title) return 'invalid:missing_title';
  if (isFallback) return 'consistent:fallback';
  if (recipeSource === 'simple_start_library') return 'consistent:simple_start_library';

  const rowLike = {
    name_cs: title,
    meal_type: meal?.type,
    ingredients,
    instructions: instructions.join('\n'),
    instructions_cs: instructions.join('\n'),
    source: recipeSource === 'catalog' ? 'catalog' : null,
    spoonacular_url: meal?.spoonacular_url || meal?.recipe?.source_url || meal?.recipe?.sourceUrl || null,
  };
  const reason = getFullContentStartBlockReason(rowLike, normalizedMealType(meal), { name_cs: title, type: normalizedMealType(meal) });
  if (reason) return `inconsistent:${reason}`;

  if (recipeSource === 'catalog' && !isRecipeConsistentWithMealDisplay(meal)) {
    return 'inconsistent:recipe_title_mismatch';
  }
  return 'consistent:catalog';
}

function fallbackRecipeObject(title, nutrition, source, instructions) {
  return {
    id: null,
    title,
    title_cs: title,
    image: null,
    source_url: null,
    sourceUrl: null,
    ready_in_minutes: 15,
    calories: nutrition.calories,
    protein_g: nutrition.protein_g,
    carbs_g: nutrition.carbs_g,
    fat_g: nutrition.fat_g,
    source,
    portion_multiplier: 1,
    instructions_cs: instructions.join('\n'),
    instructions: instructions.join('\n'),
    ingredients: [],
  };
}

function fallbackRecipeUrl(normalizedMeal, appBaseUrl) {
  return recipeFromCatalogApiUrl(null, appBaseUrl, { format: 'html', meal: normalizedMeal });
}

function catalogRecipeUrl(meal, appBaseUrl) {
  const lookupId = catalogLookupIdFromMeal(meal);
  if (lookupId != null) {
    return recipeFromCatalogApiUrl(lookupId, appBaseUrl, { format: 'html', meal });
  }
  const direct = meal?.recipe?.sourceUrl || meal?.recipe?.source_url || meal?.recipe?.url || meal?.spoonacular_url || null;
  if (isSafeExternalUrl(direct)) return String(direct).trim();
  return '';
}

/**
 * Normalized source-of-truth model used by web/email/detail rendering.
 * @param {object|null|undefined} meal
 * @param {string} [appBaseUrl]
 */
export function createMealDisplayModel(meal, appBaseUrl = '') {
  if (!meal || typeof meal !== 'object') {
    return {
      title: '',
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      ingredients: [],
      instructions: [],
      recipeUrl: '',
      recipeSource: 'none',
      source: 'none',
      isSimpleStartLibrary: false,
      isFallback: false,
      consistencyStatus: 'invalid:missing_meal',
      normalizedMeal: null,
    };
  }

  const fallbackSource = fallbackSourceFromMeal(meal);
  const librarySource = librarySourceFromMeal(meal);
  const isFallback = Boolean(fallbackSource);
  const isLibrary = Boolean(librarySource);
  const title = asString(meal.display_name_cs) || asString(meal.display_name) || asString(meal.name_cs) || 'Jídlo';
  const libraryMeal = isLibrary
    ? buildSimpleStartLibraryMeal(title, normalizedMealType(meal), {
      planner_source: meal?.planner_source || null,
      image_url: meal?.image_url || meal?.recipe?.image || null,
    })
    : null;
  const ingredientSourceMeal = libraryMeal || meal;
  const ingredients = normalizeIngredients(ingredientSourceMeal, isFallback || isLibrary);
  const instructions = normalizeInstructions(ingredientSourceMeal, title, ingredients, isFallback || isLibrary);
  const plannedNutrition = normalizeNutrition(meal, false);
  const templateNutrition = isLibrary && libraryMeal ? normalizeNutrition(libraryMeal, true) : null;
  const nutrition = isLibrary
    ? {
      calories: plannedNutrition.calories ?? templateNutrition?.calories,
      protein_g: plannedNutrition.protein_g ?? templateNutrition?.protein_g,
      carbs_g: plannedNutrition.carbs_g ?? templateNutrition?.carbs_g,
      fat_g: plannedNutrition.fat_g ?? templateNutrition?.fat_g,
      fiber_g: plannedNutrition.fiber_g ?? templateNutrition?.fiber_g,
    }
    : normalizeNutrition(ingredientSourceMeal, isFallback);
  const recipeSource = classifyRecipeSource(ingredientSourceMeal, isFallback);
  const consistencyStatus = buildConsistencyStatus(ingredientSourceMeal, title, ingredients, instructions, recipeSource, isFallback);
  const shouldForceFallback = consistencyStatus.startsWith('inconsistent:');

  const normalizedIsFallback = isFallback || shouldForceFallback;
  const fallbackKind = fallbackSource || 'simple_start_fallback';
  const fallbackTemplate = normalizedIsFallback ? findStartFallbackTemplate(title, normalizedMealType(meal)) : null;
  const fallbackIngredients = fallbackTemplate?.shopping_ingredient_lines?.length
    ? fallbackTemplate.shopping_ingredient_lines.map((line) => asString(line)).filter(Boolean)
    : ingredients;
  const fallbackInstructions = buildSimpleFallbackInstructions(title, fallbackIngredients);
  const fallbackNutrition = {
    calories: nutrition.calories ?? toMacroNumber(fallbackTemplate?.kcal),
    protein_g: nutrition.protein_g ?? toMacroNumber(fallbackTemplate?.protein_g),
    carbs_g: nutrition.carbs_g ?? toMacroNumber(fallbackTemplate?.carbs_g),
    fat_g: nutrition.fat_g ?? toMacroNumber(fallbackTemplate?.fat_g),
    fiber_g: nutrition.fiber_g,
  };

  const normalizedMeal = isLibrary
    ? {
      ...libraryMeal,
      ...meal,
      name_cs: title,
      display_name_cs: title,
      display_name: title,
      catalog_source: 'simple_start_library',
      recipe_verified: true,
      recipe_id: null,
      catalog_id: null,
      spoonacular_id: null,
      spoonacular_url: null,
      external_url: null,
      source_url: null,
      kcal: nutrition.calories ?? meal.kcal ?? libraryMeal?.kcal,
      protein_g: nutrition.protein_g ?? meal.protein_g ?? libraryMeal?.protein_g,
      carbs_g: nutrition.carbs_g ?? meal.carbs_g ?? libraryMeal?.carbs_g,
      fat_g: nutrition.fat_g ?? meal.fat_g ?? libraryMeal?.fat_g,
      image_url: libraryMeal?.image_url || meal?.image_url || null,
      recipe: {
        ...(libraryMeal?.recipe || {}),
        ...(meal?.recipe && typeof meal.recipe === 'object' ? meal.recipe : {}),
        title,
        title_cs: title,
        calories: nutrition.calories ?? meal.kcal ?? libraryMeal?.recipe?.calories,
        protein_g: nutrition.protein_g ?? meal.protein_g ?? libraryMeal?.recipe?.protein_g,
        carbs_g: nutrition.carbs_g ?? meal.carbs_g ?? libraryMeal?.recipe?.carbs_g,
        fat_g: nutrition.fat_g ?? meal.fat_g ?? libraryMeal?.recipe?.fat_g,
        portion_multiplier: meal.portion_multiplier ?? libraryMeal?.recipe?.portion_multiplier ?? 1,
      },
    }
    : normalizedIsFallback
    ? {
      ...meal,
      name_cs: title,
      display_name_cs: title,
      display_name: title,
      recipe_verified: false,
      recipe_id: null,
      catalog_id: null,
      spoonacular_id: null,
      spoonacular_url: null,
      external_url: null,
      source_url: null,
      catalog_source: fallbackKind,
      shopping_ingredient_lines: fallbackIngredients,
      simple_instructions_cs: fallbackInstructions,
      kcal: fallbackNutrition.calories,
      protein_g: fallbackNutrition.protein_g,
      carbs_g: fallbackNutrition.carbs_g,
      fat_g: fallbackNutrition.fat_g,
      recipe: fallbackRecipeObject(title, fallbackNutrition, fallbackKind, fallbackInstructions),
    }
    : meal;

  const recipeUrl = normalizedIsFallback || isLibrary || meal?.planner_source === 'simple_meal_planner_agent'
    ? fallbackRecipeUrl(normalizedMeal, appBaseUrl)
    : catalogRecipeUrl(normalizedMeal, appBaseUrl);

  return {
    title,
    calories: normalizedIsFallback ? fallbackNutrition.calories : nutrition.calories,
    protein_g: normalizedIsFallback ? fallbackNutrition.protein_g : nutrition.protein_g,
    carbs_g: normalizedIsFallback ? fallbackNutrition.carbs_g : nutrition.carbs_g,
    fat_g: normalizedIsFallback ? fallbackNutrition.fat_g : nutrition.fat_g,
    fiber_g: normalizedIsFallback ? fallbackNutrition.fiber_g : nutrition.fiber_g,
    ingredients: normalizedIsFallback ? fallbackIngredients : ingredients,
    instructions: normalizedIsFallback ? fallbackInstructions : instructions,
    recipeUrl,
    recipeSource: isLibrary ? 'simple_start_library' : (normalizedIsFallback ? 'fallback' : recipeSource),
    source: isLibrary ? 'simple_start_library' : (normalizedIsFallback ? 'fallback' : recipeSource),
    isSimpleStartLibrary: isLibrary,
    isFallback: normalizedIsFallback,
    consistencyStatus,
    normalizedMeal,
  };
}

