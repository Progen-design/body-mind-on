/**
 * Atomic portion scale — nutrition and ingredients ALWAYS move together.
 *
 * Two-phase cookable scaling:
 * 1) Scale by portion_multiplier
 * 2) Round FLEXIBLE (g/ml) to 5 g / 5 ml; DISCRETE (ks/plátky/…) to whole
 *    (½ allowed for eggs / bread slices only)
 * 3) Recompute nutrition from rounded masses — the plate is the truth
 */

/** Units counted as continuous mass/volume (round to 5). */
const FLEXIBLE_UNITS = new Set([
  'g', 'gr', 'gram', 'grams', 'kg',
  'ml', 'milliliter', 'milliliters', 'l', 'ltr', 'litru', 'litr',
]);

/** Discrete piece units — never leave as 3.45. */
const DISCRETE_UNITS = new Set([
  'ks', 'kus', 'kusy', 'kusů',
  'plátek', 'plátky', 'plátků', 'platek', 'platky', 'platku',
  'konzerva', 'konzervy', 'plechovka', 'plechovky', 'malá plechovka',
  'stroužek', 'stroužky', 'stroužků',
  'svazek', 'svazky', 'svazků',
  'balení', 'baleni', 'balíček', 'balicek',
]);

/** Approx grams per unit when ingredient_match is unknown (for nutrition recompute). */
const DEFAULT_UNIT_GRAMS = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  litr: 1000,
  litru: 1000,
  lžíce: 15,
  lzice: 15,
  lžička: 5,
  lzicka: 5,
  plátek: 20,
  plátky: 20,
  plátků: 20,
  platek: 20,
  platky: 20,
  ks: 55,
  kus: 55,
  konzerva: 150,
  konzervy: 150,
  plechovka: 400,
  stroužek: 3,
  stroužky: 3,
  svazek: 30,
  hrnek: 240,
  hrnky: 240,
};

const HALF_NAME_RE = /(vejce|egg|pečiv|peciv|chléb|chleb|toast|rohlík|rohlik|bageta)/i;

const AMOUNT_IN_LINE_RE = /^(.+?)\s+(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s+(\S.*)$/u;
const AMOUNT_PREFIX_RE = /^(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s+(\S.+)$/u;

function normalizeUnit(unit) {
  return String(unit || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeUnitRaw(unit) {
  return String(unit || '').toLowerCase().trim();
}

/**
 * @param {string|null|undefined} unit
 * @returns {'flexible'|'discrete'|'unknown'}
 */
export function classifyIngredientUnit(unit) {
  const raw = normalizeUnitRaw(unit);
  const ascii = normalizeUnit(unit);
  if (!raw) return 'unknown';
  if (FLEXIBLE_UNITS.has(raw) || FLEXIBLE_UNITS.has(ascii)) return 'flexible';
  if (DISCRETE_UNITS.has(raw) || DISCRETE_UNITS.has(ascii)) return 'discrete';
  // Common CZ plurals without accents after normalize
  if (/^(ks|kus|kusy|kusu|platek|platky|platku|konzerva|konzervy|plechovka|strouzek|strouzky|svazek)$/.test(ascii)) {
    return 'discrete';
  }
  if (/^(g|gr|ml|kg|l)$/.test(ascii)) return 'flexible';
  return 'unknown';
}

/**
 * Pieces in "ks" / bread slices may be halves (0.5).
 * Cans / cloves / bunches stay whole integers only.
 * @param {string|null|undefined} unit
 * @param {string|null|undefined} [_name]
 */
export function allowsHalfStep(unit, _name) {
  const raw = normalizeUnitRaw(unit);
  const ascii = normalizeUnit(unit);
  if (/plat/.test(ascii) || raw.startsWith('plát')) return true;
  if (ascii === 'ks' || ascii === 'kus' || ascii.startsWith('kus')) return true;
  return false;
}

/**
 * Round a cookable amount after linear scale.
 * @param {number} amount
 * @param {string|null|undefined} unit
 * @param {string|null|undefined} name
 */
export function roundCookableAmount(amount, unit, name = '') {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return amount;

  const kind = classifyIngredientUnit(unit);
  if (kind === 'flexible') {
    const rounded = Math.round(n / 5) * 5;
    return Math.max(5, rounded);
  }
  if (kind === 'discrete') {
    if (allowsHalfStep(unit, name)) {
      const half = Math.round(n * 2) / 2;
      return Math.max(0.5, half);
    }
    const whole = Math.round(n);
    return Math.max(1, whole);
  }
  // Unknown: gentle 1-decimal, avoid ugly long fractions
  return Math.round(n * 10) / 10;
}

/**
 * Format a scaled quantity for display (Czech-friendly).
 * @param {number} value
 * @param {{ unit?: string, name?: string }} [ctx]
 * @returns {string}
 */
export function formatScaledAmount(value, ctx = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const rounded = ctx.unit != null || ctx.name != null
    ? roundCookableAmount(n, ctx.unit, ctx.name)
    : n;
  if (Math.abs(rounded - 0.5) < 1e-9) return '1/2';
  if (Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return String(Math.round(rounded));
  }
  if (Math.abs(rounded * 2 - Math.round(rounded * 2)) < 1e-9) {
    const halves = Math.round(rounded * 2);
    if (halves === 1) return '1/2';
    if (halves === 3) return '3/2';
    return String(rounded);
  }
  if (rounded >= 100) return String(Math.round(rounded));
  if (rounded >= 10) return String(Math.round(rounded * 10) / 10);
  return String(Math.round(rounded * 100) / 100);
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
 * Scale a numeric amount from one multiplier band to another (raw, no round).
 * @param {number|null|undefined} amount
 * @param {number} fromMult
 * @param {number} toMult
 */
export function scaleNumericAmount(amount, fromMult, toMult) {
  const raw = Number(amount);
  if (!Number.isFinite(raw)) return amount;
  return raw * portionScaleFactor(fromMult, toMult);
}

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
 * Estimate grams for nutrition recompute (deterministic, local defaults).
 * @param {number} amount
 * @param {string|null|undefined} unit
 * @param {string|null|undefined} name
 */
export function estimateIngredientGrams(amount, unit, name = '') {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return 0;
  const raw = normalizeUnitRaw(unit);
  const ascii = normalizeUnit(unit);
  const nameL = String(name || '').toLowerCase();

  if (raw === 'g' || ascii === 'g' || raw === 'gr' || ascii === 'gr') return a;
  if (raw === 'ml' || ascii === 'ml') return a;
  if (raw === 'kg' || ascii === 'kg') return a * 1000;
  if (raw === 'l' || ascii === 'l' || ascii === 'litr' || ascii === 'litru') return a * 1000;

  if ((ascii === 'ks' || ascii === 'kus') && /vejce|egg/.test(nameL)) return a * 55;
  if ((ascii === 'ks' || ascii === 'kus') && /okurk/.test(nameL)) return a * 200;
  if ((ascii === 'ks' || ascii === 'kus') && /rajc|rajče|tomato/.test(nameL)) return a * 120;
  if ((ascii === 'ks' || ascii === 'kus') && /banán|banan/.test(nameL)) return a * 120;
  if (/plat/.test(ascii)) return a * 20;
  if (/konzerv|plechov/.test(ascii) && /tuň|tunak|tuna/.test(nameL)) return a * 150;
  if (/konzerv|plechov/.test(ascii)) return a * 240;
  if (/strouz/.test(ascii)) return a * 3;

  if (DEFAULT_UNIT_GRAMS[raw] != null) return a * DEFAULT_UNIT_GRAMS[raw];
  if (DEFAULT_UNIT_GRAMS[ascii] != null) return a * DEFAULT_UNIT_GRAMS[ascii];
  return 0;
}

function estimateEntryGrams(entry) {
  if (entry == null) return 0;
  if (typeof entry === 'string') {
    const text = entry.trim();
    let m = text.match(AMOUNT_IN_LINE_RE);
    if (m) {
      const amount = parseFlexibleNumber(m[2]);
      if (amount != null) {
        const rest = m[3].trim();
        const unitToken = rest.split(/\s+/)[0] || '';
        return estimateIngredientGrams(amount, unitToken, m[1]);
      }
    }
    m = text.match(AMOUNT_PREFIX_RE);
    if (m) {
      const amount = parseFlexibleNumber(m[1]);
      if (amount != null) {
        const rest = m[2].trim();
        const unitToken = rest.split(/\s+/)[0] || '';
        return estimateIngredientGrams(amount, unitToken, rest);
      }
    }
    return 0;
  }
  if (typeof entry === 'object') {
    return estimateIngredientGrams(
      entry.amount,
      entry.unit,
      entry.name || entry.name_cs || entry.name_en
    );
  }
  return 0;
}

/**
 * @param {Array<string|object>|null|undefined} list
 */
export function estimateIngredientsMassGrams(list) {
  if (!Array.isArray(list)) return 0;
  return list.reduce((sum, entry) => sum + estimateEntryGrams(entry), 0);
}

/**
 * Scale a free-text ingredient line with cookable rounding.
 * @param {string} line
 * @param {number} fromMult
 * @param {number} toMult
 */
export function scaleIngredientLine(line, fromMult, toMult) {
  const text = String(line || '').trim();
  if (!text) return text;
  const factor = portionScaleFactor(fromMult, toMult);
  if (Math.abs(factor - 1) < 1e-9) {
    // Still normalize ugly fractions if present
    return roundIngredientLineInPlace(text);
  }

  let m = text.match(AMOUNT_IN_LINE_RE);
  if (m) {
    const amount = parseFlexibleNumber(m[2]);
    if (amount != null && amount > 0) {
      const unitToken = m[3].trim().split(/\s+/)[0] || '';
      const name = m[1].trim();
      const scaled = roundCookableAmount(amount * factor, unitToken, name);
      const display = formatScaledAmount(scaled, { unit: unitToken, name });
      return `${name} ${display} ${m[3].trim()}`.trim();
    }
  }

  m = text.match(AMOUNT_PREFIX_RE);
  if (m) {
    const amount = parseFlexibleNumber(m[1]);
    if (amount != null && amount > 0) {
      const rest = m[2].trim();
      const unitToken = rest.split(/\s+/)[0] || '';
      const scaled = roundCookableAmount(amount * factor, unitToken, rest);
      const display = formatScaledAmount(scaled, { unit: unitToken, name: rest });
      return `${display} ${rest}`.trim();
    }
  }

  return text;
}

function roundIngredientLineInPlace(text) {
  let m = text.match(AMOUNT_IN_LINE_RE);
  if (m) {
    const amount = parseFlexibleNumber(m[2]);
    if (amount != null && amount > 0) {
      const unitToken = m[3].trim().split(/\s+/)[0] || '';
      const name = m[1].trim();
      const kind = classifyIngredientUnit(unitToken);
      if (kind === 'discrete' || kind === 'flexible') {
        const scaled = roundCookableAmount(amount, unitToken, name);
        const display = formatScaledAmount(scaled, { unit: unitToken, name });
        return `${name} ${display} ${m[3].trim()}`.trim();
      }
    }
  }
  return text;
}

/**
 * Scale one ingredient entry (string or object) with cookable rounding.
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
  const name = next.name || next.name_cs || next.name_en || '';
  if (Number.isFinite(Number(next.amount))) {
    const raw = Number(next.amount) * factor;
    next.amount = roundCookableAmount(raw, next.unit, name);
  }
  if (typeof next.original === 'string' && next.original.trim()) {
    next.original = scaleIngredientLine(next.original, fromMult, toMult);
  } else if (next.name != null && Number.isFinite(Number(next.amount))) {
    const unit = next.unit ? ` ${next.unit}` : '';
    next.original = `${formatScaledAmount(next.amount, { unit: next.unit, name })}${unit} ${String(next.name)}`.trim();
  }
  return next;
}

/**
 * Scale an ingredients array atomically with cookable rounding.
 * @param {Array<string|object>|null|undefined} list
 * @param {number} fromMult
 * @param {number} toMult
 */
export function scaleIngredientsList(list, fromMult, toMult) {
  if (!Array.isArray(list)) return list;
  return list.map((entry) => scaleIngredientEntry(entry, fromMult, toMult));
}

/**
 * Assert discrete unit amounts are cookable (whole or .5 when allowed).
 * @param {string|object} entry
 * @returns {{ ok: boolean, amount?: number, unit?: string, name?: string, reason?: string }}
 */
export function validateDiscreteIngredientAmount(entry) {
  let amount;
  let unit;
  let name = '';
  if (typeof entry === 'string') {
    const text = entry.trim();
    let m = text.match(AMOUNT_IN_LINE_RE);
    if (m) {
      amount = parseFlexibleNumber(m[2]);
      unit = m[3].trim().split(/\s+/)[0] || '';
      name = m[1].trim();
    } else {
      m = text.match(AMOUNT_PREFIX_RE);
      if (m) {
        amount = parseFlexibleNumber(m[1]);
        const rest = m[2].trim();
        unit = rest.split(/\s+/)[0] || '';
        name = rest;
      }
    }
  } else if (entry && typeof entry === 'object') {
    amount = Number(entry.amount);
    unit = entry.unit;
    name = entry.name || entry.name_cs || '';
  }
  if (!Number.isFinite(amount)) return { ok: true };
  if (classifyIngredientUnit(unit) !== 'discrete') return { ok: true };

  const halfOk = allowsHalfStep(unit, name);
  const doubled = amount * 2;
  const isHalfOrWhole = Math.abs(doubled - Math.round(doubled)) < 1e-6;
  const isWhole = Math.abs(amount - Math.round(amount)) < 1e-6;
  if (halfOk && isHalfOrWhole) return { ok: true, amount, unit, name };
  if (!halfOk && isWhole) return { ok: true, amount, unit, name };
  return {
    ok: false,
    amount,
    unit,
    name,
    reason: halfOk ? 'not_half_step' : 'not_whole',
  };
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
 * Effective multiplier from rounded plate mass vs 1× base mass.
 * Falls back to requested toMult when mass cannot be estimated.
 * @param {Array<string|object>|null|undefined} ingredientsAt1
 * @param {Array<string|object>|null|undefined} ingredientsRounded
 * @param {number} fallbackMult
 */
export function effectiveMultiplierFromMass(ingredientsAt1, ingredientsRounded, fallbackMult) {
  const m1 = estimateIngredientsMassGrams(ingredientsAt1);
  const mr = estimateIngredientsMassGrams(ingredientsRounded);
  if (!(m1 > 0) || !(mr > 0)) return fallbackMult;
  return Math.round((mr / m1) * 1000) / 1000;
}

/**
 * Atomic bundle: nutrition + every ingredient surface, or nothing.
 * Cookable rounding + nutrition from rounded mass.
 *
 * @param {object} bundle
 * @param {number} fromMult
 * @param {number} toMult
 * @returns {object}
 */
export function scalePortionBundle(bundle, fromMult, toMult) {
  const src = bundle && typeof bundle === 'object' ? bundle : {};
  const nutritionAt1 = scaleNutritionFields(
    {
      kcal: src.kcal ?? src.calories,
      protein_g: src.protein_g,
      carbs_g: src.carbs_g,
      fat_g: src.fat_g,
    },
    fromMult,
    1
  );

  const ingsSrc = Array.isArray(src.ingredients) ? src.ingredients : null;
  const shopSrc = Array.isArray(src.shopping_ingredient_lines) ? src.shopping_ingredient_lines : null;
  const massSource = ingsSrc || shopSrc;

  const at1 = massSource ? scaleIngredientsList(massSource, fromMult, 1) : null;
  // Raw linear then round via scaleIngredientsList(…, 1, toMult)
  const rounded = at1 ? scaleIngredientsList(at1, 1, toMult) : null;
  const effective = effectiveMultiplierFromMass(at1, rounded, toMult);
  const nutrition = scaleNutritionFields(nutritionAt1, 1, effective);

  return {
    ...src,
    kcal: nutrition.kcal,
    calories: nutrition.kcal,
    protein_g: nutrition.protein_g,
    carbs_g: nutrition.carbs_g,
    fat_g: nutrition.fat_g,
    portion_multiplier: Math.round(effective * 100) / 100,
    ingredients: ingsSrc ? scaleIngredientsList(ingsSrc, fromMult, toMult) : src.ingredients,
    shopping_ingredient_lines: shopSrc
      ? scaleIngredientsList(shopSrc, fromMult, toMult)
      : src.shopping_ingredient_lines,
  };
}

/**
 * Mutate a structured meal so nutrition and ingredients stay locked together.
 * Discrete pieces become cookable; macros follow the rounded plate.
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

  const nutritionAt1 = scaleNutritionFields(
    {
      kcal: meal.kcal ?? meal.calories ?? meal.recipe?.calories,
      protein_g: meal.protein_g ?? meal.recipe?.protein_g,
      carbs_g: meal.carbs_g ?? meal.recipe?.carbs_g,
      fat_g: meal.fat_g ?? meal.recipe?.fat_g,
    },
    oldMult,
    1
  );

  const massSource = Array.isArray(meal.recipe?.ingredients) && meal.recipe.ingredients.length
    ? meal.recipe.ingredients
    : Array.isArray(meal.ingredients) && meal.ingredients.length
      ? meal.ingredients
      : Array.isArray(meal.shopping_ingredient_lines)
        ? meal.shopping_ingredient_lines
        : null;

  const at1 = massSource ? scaleIngredientsList(massSource, oldMult, 1) : null;
  const rounded = at1 ? scaleIngredientsList(at1, 1, toMult) : null;
  const effective = effectiveMultiplierFromMass(at1, rounded, toMult);
  const nutrition = scaleNutritionFields(nutritionAt1, 1, effective);

  meal.portion_multiplier = Math.round(effective * 100) / 100;
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
