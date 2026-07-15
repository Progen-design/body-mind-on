/**
 * Atomic portion scale — nutrition and ingredients ALWAYS move together.
 * There is intentionally no public API to scale kcal/macros without ingredients.
 */

/**
 * Format a scaled quantity for display (Czech-friendly).
 * @param {number} value
 * @returns {string}
 */
export function formatScaledAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return String(Math.round(n * 10) / 10);
  // Keep simple fractions when close
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - 0.5) < 0.02) return '1/2';
  if (Math.abs(rounded - 0.25) < 0.02) return '1/4';
  if (Math.abs(rounded - 0.75) < 0.02) return '3/4';
  if (Math.abs(rounded - Math.round(rounded)) < 0.02) return String(Math.round(rounded));
  return String(rounded);
}

/**
 * Relative scale factor from one portion_multiplier to another.
 * @param {number} fromMult
 * @param {number} toMult
 */
export function portionScaleFactor(fromMult, toMult) {
  const from = Number(fromMult);
  const to = Number(toMult);
  const safeFrom = Number.isFinite(from) && from > 0 ? from : 1;
  const safeTo = Number.isFinite(to) && to > 0 ? to : 1;
  return safeTo / safeFrom;
}

/**
 * Scale a numeric amount from one multiplier band to another.
 * @param {number|null|undefined} amount
 * @param {number} fromMult
 * @param {number} toMult
 */
export function scaleNumericAmount(amount, fromMult, toMult) {
  const raw = Number(amount);
  if (!Number.isFinite(raw)) return amount;
  return raw * portionScaleFactor(fromMult, toMult);
}

const AMOUNT_IN_LINE_RE = /^(.+?)\s+(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s+(\S.*)$/u;
const AMOUNT_PREFIX_RE = /^(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s+(\S.+)$/u;

function parseFlexibleNumber(token) {
  const t = String(token || '').trim().replace(',', '.').replace(/\s+/g, '');
  if (!t) return null;
  if (t.includes('/')) {
    const [a, b] = t.split('/');
    const num = Number(a);
    const den = Number(b);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Scale a free-text ingredient line ("rýže 80 g", "3 ks vejce", "vejce 3 ks").
 * If no parseable amount, return the line unchanged (cannot invent).
 * @param {string} line
 * @param {number} fromMult
 * @param {number} toMult
 */
export function scaleIngredientLine(line, fromMult, toMult) {
  const text = String(line || '').trim();
  if (!text) return text;
  const factor = portionScaleFactor(fromMult, toMult);
  if (Math.abs(factor - 1) < 1e-9) return text;

  // "name amount unit..." e.g. "rýže 80 g", "okurka 1/2 ks"
  let m = text.match(AMOUNT_IN_LINE_RE);
  if (m) {
    const amount = parseFlexibleNumber(m[2]);
    if (amount != null && amount > 0) {
      const scaled = formatScaledAmount(amount * factor);
      return `${m[1].trim()} ${scaled} ${m[3].trim()}`.trim();
    }
  }

  // "amount unit/name..." e.g. "80 g rýže", "3 ks vejce"
  m = text.match(AMOUNT_PREFIX_RE);
  if (m) {
    const amount = parseFlexibleNumber(m[1]);
    if (amount != null && amount > 0) {
      const scaled = formatScaledAmount(amount * factor);
      return `${scaled} ${m[2].trim()}`.trim();
    }
  }

  return text;
}

/**
 * Scale one ingredient entry (string or Spoonacular-like object).
 * @param {string|object} entry
 * @param {number} fromMult
 * @param {number} toMult
 */
export function scaleIngredientEntry(entry, fromMult, toMult) {
  if (entry == null) return entry;
  if (typeof entry === 'string') {
    return scaleIngredientLine(entry, fromMult, toMult);
  }
  if (typeof entry !== 'object') return entry;

  const factor = portionScaleFactor(fromMult, toMult);
  const next = { ...entry };
  if (Number.isFinite(Number(next.amount))) {
    next.amount = Math.round(Number(next.amount) * factor * 1000) / 1000;
  }
  if (typeof next.original === 'string' && next.original.trim()) {
    next.original = scaleIngredientLine(next.original, fromMult, toMult);
  } else if (next.name != null && Number.isFinite(Number(next.amount))) {
    const unit = next.unit ? ` ${next.unit}` : '';
    next.original = `${formatScaledAmount(next.amount)}${unit} ${String(next.name)}`.trim();
  }
  return next;
}

/**
 * Scale an ingredients array atomically with nutrition.
 * @param {Array<string|object>|null|undefined} list
 * @param {number} fromMult
 * @param {number} toMult
 */
export function scaleIngredientsList(list, fromMult, toMult) {
  if (!Array.isArray(list)) return list;
  return list.map((entry) => scaleIngredientEntry(entry, fromMult, toMult));
}

/**
 * Nutrition fields at a new portion multiplier (from current displayed values).
 * @param {{ kcal?: number, calories?: number, protein_g?: number, carbs_g?: number, fat_g?: number }} nutrition
 * @param {number} fromMult
 * @param {number} toMult
 */
export function scaleNutritionFields(nutrition, fromMult, toMult) {
  const src = nutrition && typeof nutrition === 'object' ? nutrition : {};
  const factor = portionScaleFactor(fromMult, toMult);
  const scaleMacro = (val) => Math.round(((Number(val) || 0) * factor) * 10) / 10;
  const baseKcal = Number(src.kcal ?? src.calories);
  const kcal = Number.isFinite(baseKcal)
    ? Math.round(baseKcal * factor)
    : null;
  return {
    kcal,
    protein_g: scaleMacro(src.protein_g),
    carbs_g: scaleMacro(src.carbs_g),
    fat_g: scaleMacro(src.fat_g),
  };
}

/**
 * Atomic bundle: nutrition + every ingredient surface, or nothing.
 * Callers MUST use this (or applyAtomicPortionScaleToMeal) — never patch kcal alone.
 *
 * @param {object} bundle
 * @param {number} fromMult
 * @param {number} toMult
 * @returns {object}
 */
export function scalePortionBundle(bundle, fromMult, toMult) {
  const src = bundle && typeof bundle === 'object' ? bundle : {};
  const nutrition = scaleNutritionFields(
    {
      kcal: src.kcal ?? src.calories,
      protein_g: src.protein_g,
      carbs_g: src.carbs_g,
      fat_g: src.fat_g,
    },
    fromMult,
    toMult
  );

  return {
    ...src,
    kcal: nutrition.kcal,
    calories: nutrition.kcal,
    protein_g: nutrition.protein_g,
    carbs_g: nutrition.carbs_g,
    fat_g: nutrition.fat_g,
    portion_multiplier: Math.round((Number(toMult) || 1) * 100) / 100,
    ingredients: scaleIngredientsList(src.ingredients, fromMult, toMult),
    shopping_ingredient_lines: scaleIngredientsList(src.shopping_ingredient_lines, fromMult, toMult),
  };
}

/**
 * Mutate a structured meal so nutrition and ingredients stay locked together.
 * @param {object} meal
 * @param {number} newMultiplier
 * @returns {object} meal
 */
export function applyAtomicPortionScaleToMeal(meal, newMultiplier) {
  if (!meal || typeof meal !== 'object') return meal;
  if (!Number(meal?.kcal) && !Number(meal?.calories) && !Number(meal?.recipe?.calories)) {
    return meal;
  }

  const oldMult = Number(meal.portion_multiplier ?? meal.recipe?.portion_multiplier) || 1;
  const toMult = Number(newMultiplier);
  if (!Number.isFinite(toMult) || toMult <= 0) return meal;
  if (Math.abs(toMult - oldMult) < 1e-9) return meal;

  const nutritionSrc = {
    kcal: meal.kcal ?? meal.calories ?? meal.recipe?.calories,
    protein_g: meal.protein_g ?? meal.recipe?.protein_g,
    carbs_g: meal.carbs_g ?? meal.recipe?.carbs_g,
    fat_g: meal.fat_g ?? meal.recipe?.fat_g,
  };
  const nutrition = scaleNutritionFields(nutritionSrc, oldMult, toMult);

  meal.portion_multiplier = Math.round(toMult * 100) / 100;
  meal.kcal = nutrition.kcal;
  meal.protein_g = nutrition.protein_g;
  meal.carbs_g = nutrition.carbs_g;
  meal.fat_g = nutrition.fat_g;

  if (Array.isArray(meal.shopping_ingredient_lines)) {
    meal.shopping_ingredient_lines = scaleIngredientsList(
      meal.shopping_ingredient_lines,
      oldMult,
      toMult
    );
  }
  if (Array.isArray(meal.ingredients)) {
    meal.ingredients = scaleIngredientsList(meal.ingredients, oldMult, toMult);
  }

  if (meal.recipe && typeof meal.recipe === 'object') {
    meal.recipe.portion_multiplier = meal.portion_multiplier;
    meal.recipe.calories = meal.kcal;
    meal.recipe.protein_g = meal.protein_g;
    meal.recipe.carbs_g = meal.carbs_g;
    meal.recipe.fat_g = meal.fat_g;
    if (Array.isArray(meal.recipe.ingredients)) {
      meal.recipe.ingredients = scaleIngredientsList(meal.recipe.ingredients, oldMult, toMult);
    }
    if (Array.isArray(meal.recipe.shopping_ingredient_lines)) {
      meal.recipe.shopping_ingredient_lines = scaleIngredientsList(
        meal.recipe.shopping_ingredient_lines,
        oldMult,
        toMult
      );
    }
  }

  return meal;
}
