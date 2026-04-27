/**
 * Suroviny na jednu porci jídla ze strukturovaného plánu (Spoonacular extendedIngredients / servings).
 */

import { ingredientNameForDisplayCs } from './ingredientNamesCs';

/**
 * @param {object|null|undefined} meal – položka z day.meals (structured_plan_json)
 * @returns {{ name: string, amountStr: string|null, unit: string }[]}
 */
export function portionIngredientsFromStructuredMeal(meal) {
  if (!meal || meal.recipe_verified !== true) return [];
  const r = meal.recipe;
  if (!r || !Array.isArray(r.ingredients) || r.ingredients.length === 0) return [];
  const servings = Math.max(1, Number(r.servings) || 1);
  return r.ingredients
    .filter((ing) => ing && String(ing.name || '').trim())
    .slice(0, 28)
    .map((ing) => {
      const raw = Number(ing.amount);
      const scaled = Number.isFinite(raw) ? raw / servings : null;
      const name = ingredientNameForDisplayCs(String(ing.name || '').trim());
      const unit = String(ing.unit || '').trim();
      let amountStr = null;
      if (scaled != null && scaled > 0) {
        if (scaled >= 100) amountStr = String(Math.round(scaled));
        else if (scaled >= 10) amountStr = String(Math.round(scaled * 10) / 10);
        else amountStr = String(Math.round(scaled * 100) / 100);
      }
      return { name, amountStr, unit };
    });
}
