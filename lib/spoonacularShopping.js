/**
 * Ingredience nákupního seznamu výhradně ze Spoonacular receptů (extendedIngredients).
 * Žádné generické fallback položky – jen to, co API vrátilo u ověřeného receptu.
 */

/**
 * @param {object|null|undefined} recipe – objekt receptu z Spoonacular (complexSearch / information)
 * @returns {string[]}
 */
export function extractIngredientLinesFromSpoonacularRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') return [];
  const raw = recipe.extendedIngredients;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const lines = [];
  for (const ing of raw) {
    if (!ing || typeof ing !== 'object') continue;
    const original = typeof ing.original === 'string' && ing.original.trim() ? ing.original.trim() : '';
    const name = typeof ing.name === 'string' ? ing.name.trim() : '';
    const unit = ing.unit != null ? String(ing.unit).trim() : '';
    const amount = ing.amount != null ? String(ing.amount).trim() : '';
    const line = original || [amount, unit, name].filter(Boolean).join(' ').trim();
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Agregace napříč týdnem, deduplikace (case-insensitive, bez diakritiky u klíče).
 * @param {{ days?: Array<{ meals?: object[] }> }} planJson
 * @returns {string[]}
 */
export function aggregateShoppingIngredientLinesFromStructuredPlan(planJson) {
  const days = planJson?.days ?? [];
  const seen = new Set();
  const out = [];
  for (const d of days) {
    for (const m of d.meals ?? []) {
      if (m.recipe_verified !== true) continue;
      const arr = m.shopping_ingredient_lines;
      if (!Array.isArray(arr)) continue;
      for (const line of arr) {
        const s = String(line || '').trim();
        if (!s) continue;
        const key = s
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
    }
  }
  return out;
}
