/**
 * POST /api/onboarding/replace-meal
 * Nahradí jedno jídlo v plánu novým receptem ze Spoonacular.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md § Replace Meal Flow
 */
import { searchRecipe } from '../../../lib/services/spoonacularService';

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
    const diet = body.diet_type === 'vegan' ? 'vegan' : body.diet_type === 'vegetarian' ? 'vegetarian' : undefined;

    const recipe = await searchRecipe(query, { diet });

    if (!recipe) {
      return res.status(200).json({
        ok: true,
        meal: {
          type: meal_type,
          display_name: 'Jídlo (neověřeno)',
          recipe_verified: false,
          recipe: null,
        },
        _request_id: requestId,
      });
    }

    return res.status(200).json({
      ok: true,
      meal: {
        type: meal_type,
        display_name: recipe.title,
        recipe_verified: true,
        recipe: {
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
