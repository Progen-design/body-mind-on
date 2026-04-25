/**
 * Ingredience nákupního seznamu výhradně ze Spoonacular receptů (extendedIngredients).
 * Žádné generické fallback položky – jen to, co API vrátilo u ověřeného receptu.
 */

/** Spoonacular `aisle` → české nadpisy v plánu a e-mailech. */
const AISLE_TRANSLATIONS = {
  Baking: 'Pečení a cukrařina',
  Beverages: 'Nápoje',
  Cheese: 'Sýry',
  'Milk, Eggs, Other Dairy': 'Mléko, vejce a mléčné výrobky',
  Meat: 'Maso',
  Seafood: 'Ryby a mořské plody',
  Produce: 'Ovoce a zelenina',
  'Frozen Foods': 'Mražené potraviny',
  'Canned and Jarred': 'Konzervy a zavařeniny',
  'Pasta and Rice': 'Těstoviny a rýže',
  Cereal: 'Cereálie a müsli',
  Bread: 'Pečivo a chléb',
  Condiments: 'Omáčky a koření',
  'Spices and Seasonings': 'Koření a bylinky',
  'Oil, Vinegar, Salad Dressing': 'Oleje a ocet',
  Nuts: 'Ořechy a semínka',
  'Health Foods': 'Zdravé potraviny',
  'Ethnic Foods': 'Etnické potraviny',
  'Sweet Snacks': 'Sladké svačiny',
  'Savory Snacks': 'Slané svačiny',
  'Gluten Free': 'Bezlepkové',
  Refrigerated: 'Chlazené',
  'Dried Fruits': 'Sušené ovoce',
  Grains: 'Obiloviny',
  'Bakery/Bread': 'Pekárna a pečivo',
  Other: 'Ostatní',
};

/**
 * Překlad kategorie uličky z API; neznámý řetězec ponechá.
 * @param {string|null|undefined} aisle
 * @returns {string}
 */
export function translateAisle(aisle) {
  const raw = (aisle && String(aisle).trim()) || '';
  if (!raw) return 'Ostatní';
  if (Object.prototype.hasOwnProperty.call(AISLE_TRANSLATIONS, raw)) return AISLE_TRANSLATIONS[raw];
  const lower = raw.toLowerCase();
  for (const [en, cs] of Object.entries(AISLE_TRANSLATIONS)) {
    if (en.toLowerCase() === lower) return cs;
  }
  return raw;
}

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
function pushIngredientLinesInto(out, seen, meals) {
  for (const m of meals ?? []) {
    const arr = m.shopping_ingredient_lines;
    if (!Array.isArray(arr) || arr.length === 0) continue;
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

/**
 * Suroviny jen pro jeden den (index 0–6 v structured plánu).
 * Bere řádky z meal.shopping_ingredient_lines, pokud existují (i bez recipe_verified, když už data máme).
 */
export function aggregateShoppingIngredientLinesForDayIndex(planJson, dayIndex) {
  const days = planJson?.days ?? [];
  const d = days[Number(dayIndex)];
  if (!d || !Array.isArray(d.meals)) return [];
  const seen = new Set();
  const out = [];
  pushIngredientLinesInto(out, seen, d.meals);
  return out;
}

export function aggregateShoppingIngredientLinesFromStructuredPlan(planJson) {
  const days = planJson?.days ?? [];
  const seen = new Set();
  const out = [];
  for (const d of days) {
    pushIngredientLinesInto(out, seen, d.meals);
  }
  return out;
}

/**
 * Nákupní seznam seskupený podle uličky (aisle) z mapovaných ingrediencí v recipe.ingredients.
 * @param {{ days?: Array<{ meals?: object[] }> }} planJson
 * @returns {Record<string, string[]>} např. { Produce: ['jablko: 2 ks'], Ostatní: [...] }
 */
export function aggregateShoppingByAisleFromStructuredPlan(planJson) {
  const days = planJson?.days ?? [];
  /** @type {Map<string, { name: string, amount: number, unit: string, aisle: string }>} */
  const byName = new Map();

  for (const d of days) {
    for (const m of d.meals ?? []) {
      if (m.recipe_verified !== true) continue;
      const ings = m.recipe?.ingredients;
      if (!Array.isArray(ings)) continue;
      for (const ing of ings) {
        if (!ing?.name) continue;
        const key = String(ing.name).toLowerCase().trim();
        const amt = Number(ing.amount) || 0;
        const unit = (ing.unit || '').trim() || 'ks';
        const aisle = translateAisle((ing.aisle && String(ing.aisle).trim()) || '');
        if (byName.has(key)) {
          const ex = byName.get(key);
          if (ex.unit === unit) ex.amount += amt;
          else ex.amount += amt;
        } else {
          byName.set(key, { name: String(ing.name).trim(), amount: amt, unit, aisle });
        }
      }
    }
  }

  /** @type {Record<string, string[]>} */
  const byAisle = {};
  for (const item of byName.values()) {
    const a = item.aisle || 'Ostatní';
    if (!byAisle[a]) byAisle[a] = [];
    const line = `${item.name}: ${item.amount} ${item.unit}`.trim();
    byAisle[a].push(line);
  }
  for (const k of Object.keys(byAisle)) {
    byAisle[k].sort((x, y) => x.localeCompare(y, 'cs'));
  }
  return byAisle;
}
