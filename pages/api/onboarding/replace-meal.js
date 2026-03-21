/**
 * POST /api/onboarding/replace-meal
 * Nahradí jedno jídlo v plánu novým receptem ze Spoonacular.
 * Trust-aware pipeline, display_name_cs – nikdy raw anglický název.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md § Replace Meal Flow
 */
import { searchMealMetadata, MEAL_CONFIDENCE_THRESHOLD } from '../../../lib/mealEnrichment';
import { translateRecipeTitleToCzech } from '../../../lib/recipeLocalization';
import { extractIngredientLinesFromSpoonacularRecipe } from '../../../lib/spoonacularShopping';

function errorResponse(res, status, error, code, requestId) {
  return res.status(status).json({
    ok: false,
    error,
    code: code || 'INTERNAL_ERROR',
    _request_id: requestId,
  });
}

export default async function handler(req, res) {
  const requestId = `req_${Date.now()}`;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Pouze POST', 'METHOD_NOT_ALLOWED', requestId);
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { plan_id, date, meal_type, hint_query } = body;

    if (!date || !meal_type) {
      return errorResponse(res, 400, 'date a meal_type jsou povinné', 'VALIDATION_ERROR', requestId);
    }

    const validTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validTypes.includes(meal_type)) {
      return errorResponse(res, 400, `meal_type musí být ${validTypes.join(', ')}`, 'VALIDATION_ERROR', requestId);
    }

    const query = hint_query && typeof hint_query === 'string' ? hint_query.trim().slice(0, 100) : getDefaultQuery(meal_type);

    const meta = await searchMealMetadata(query, null, { maxCandidates: 3 });

    const recipeVerified = meta?.recipe_id != null && (meta?.image_trust_level === 'exact' || (meta?.confidence_score ?? 0) >= MEAL_CONFIDENCE_THRESHOLD);
    const rawRecipe = meta?._recipe;

    if (!recipeVerified || !rawRecipe) {
      return res.status(200).json({
        ok: true,
        meal: {
          type: meal_type,
          display_name: 'Jídlo (neověřeno)',
          display_name_cs: 'Jídlo (neověřeno)',
          recipe_verified: false,
          recipe: null,
        },
        _request_id: requestId,
      });
    }

    const display_name_cs = await translateRecipeTitleToCzech(rawRecipe.title || '', meta.recipe_id);
    const shoppingIngredientLines = extractIngredientLinesFromSpoonacularRecipe(rawRecipe);

    return res.status(200).json({
      ok: true,
      meal: {
        type: meal_type,
        display_name: display_name_cs,
        display_name_cs,
        recipe_verified: true,
        recipe_id: meta.recipe_id ?? rawRecipe.id,
        image_url: meta.image_trust_level === 'exact' ? meta.image_url ?? null : null,
        image_trust_level: meta.image_trust_level ?? 'none',
        shopping_ingredient_lines: shoppingIngredientLines,
        recipe: {
          id: rawRecipe.id,
          title: display_name_cs,
          image: meta.image_trust_level === 'exact' ? rawRecipe.image : null,
          sourceUrl: rawRecipe.sourceUrl || null,
          readyInMinutes: rawRecipe.readyInMinutes ?? null,
          calories: meta.calories ?? null,
          protein_g: meta.protein_g ?? null,
          carbs_g: meta.carbs_g ?? null,
          fat_g: meta.fat_g ?? null,
          source: 'spoonacular',
        },
      },
      _request_id: requestId,
    });
  } catch (err) {
    console.error('[onboarding/replace-meal]', err?.message || err);
    return errorResponse(res, 500, 'Nepodařilo se nahradit jídlo', 'INTERNAL_ERROR', requestId);
  }
}

function getDefaultQuery(mealType) {
  const defaults = {
    breakfast: 'oatmeal banana eggs',
    lunch: 'chicken breast rice vegetables',
    dinner: 'grilled chicken vegetables',
    snack: 'greek yogurt nuts',
  };
  return defaults[mealType] || 'healthy meal';
}
