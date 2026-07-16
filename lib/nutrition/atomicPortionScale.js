/**
 * Atomic portion scale — nutrition and ingredients ALWAYS move together.
 *
 * Cookable scaling:
 * 1) Scale by portion_multiplier
 * 2) Round FLEXIBLE (g/ml) to 5 g / 5 ml; DISCRETE (ks/plátky/…) to whole
 *    (½ allowed for eggs / bread slices only)
 * 3) Recompute nutrition from rounded masses — the plate is the truth
 * 4) Flex catch-up: close remaining kcal gap by adding grams to flexible
 *    staples only (rice, oats, meat, oil…) — never touch discrete pieces
 */

import {
  flexCatchUpPriority,
  maxFlexCatchUpGrams,
  nutritionFromGrams,
  lookupIngredientNutritionPer100g,
} from './ingredientNutritionTable.js';

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

function entryName(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') {
    const m = entry.trim().match(AMOUNT_IN_LINE_RE);
    if (m) return m[1].trim();
    return entry.trim();
  }
  if (typeof entry === 'object') {
    return String(entry.name || entry.name_cs || entry.name_en || '');
  }
  return '';
}

function entryUnit(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') {
    const text = entry.trim();
    let m = text.match(AMOUNT_IN_LINE_RE);
    if (m) return m[3].trim().split(/\s+/)[0] || '';
    m = text.match(AMOUNT_PREFIX_RE);
    if (m) return m[2].trim().split(/\s+/)[0] || '';
    return '';
  }
  if (typeof entry === 'object') return entry.unit || '';
  return '';
}

function entryAmount(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') {
    const text = entry.trim();
    let m = text.match(AMOUNT_IN_LINE_RE);
    if (m) return parseFlexibleNumber(m[2]);
    m = text.match(AMOUNT_PREFIX_RE);
    if (m) return parseFlexibleNumber(m[1]);
    return null;
  }
  if (typeof entry === 'object' && Number.isFinite(Number(entry.amount))) {
    return Number(entry.amount);
  }
  return null;
}

function setEntryAmount(entry, newAmount) {
  const amount = roundCookableAmount(newAmount, entryUnit(entry), entryName(entry));
  if (typeof entry === 'string') {
    const text = entry.trim();
    let m = text.match(AMOUNT_IN_LINE_RE);
    if (m) {
      const unitToken = m[3].trim().split(/\s+/)[0] || '';
      const name = m[1].trim();
      const display = formatScaledAmount(amount, { unit: unitToken, name });
      return `${name} ${display} ${m[3].trim()}`.trim();
    }
    m = text.match(AMOUNT_PREFIX_RE);
    if (m) {
      const rest = m[2].trim();
      const unitToken = rest.split(/\s+/)[0] || '';
      const display = formatScaledAmount(amount, { unit: unitToken, name: rest });
      return `${display} ${rest}`.trim();
    }
    return entry;
  }
  if (typeof entry === 'object') {
    const next = { ...entry, amount };
    const name = entryName(next);
    if (typeof next.original === 'string' && next.original.trim()) {
      next.original = scaleIngredientLine(
        // rewrite original via amount replace
        `${name} ${formatScaledAmount(amount, { unit: next.unit, name })} ${next.unit || ''}`.trim(),
        1,
        1
      );
      next.original = `${name} ${formatScaledAmount(amount, { unit: next.unit, name })} ${String(next.unit || '').trim()}`.trim();
    } else if (name) {
      const unit = next.unit ? ` ${next.unit}` : '';
      next.original = `${formatScaledAmount(amount, { unit: next.unit, name })}${unit} ${name}`.trim();
    }
    return next;
  }
  return entry;
}

/**
 * Close a kcal deficit by adding grams only to flexible ingredients.
 * Discrete pieces (eggs, cans, slices) stay locked.
 *
 * @param {Array<string|object>|null|undefined} list
 * @param {number} deficitKcal
 * @returns {{ list: Array, addedKcal: number, addedProtein: number, addedCarbs: number, addedFat: number }}
 */
export function catchUpFlexibleIngredients(list, deficitKcal) {
  if (!Array.isArray(list) || list.length === 0) {
    return { list, addedKcal: 0, addedProtein: 0, addedCarbs: 0, addedFat: 0 };
  }
  let remaining = Number(deficitKcal);
  if (!Number.isFinite(remaining) || remaining < 12) {
    return { list: [...list], addedKcal: 0, addedProtein: 0, addedCarbs: 0, addedFat: 0 };
  }

  const next = list.map((e) => (typeof e === 'object' && e ? { ...e } : e));
  /** @type {{ index: number, name: string, unit: string, amount: number, maxAdd: number, added: number, priority: number, perKcal: number }[]} */
  const flex = [];

  for (let i = 0; i < next.length; i++) {
    const entry = next[i];
    const unit = entryUnit(entry);
    if (classifyIngredientUnit(unit) !== 'flexible') continue;
    const name = entryName(entry);
    const amount = entryAmount(entry);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const per = lookupIngredientNutritionPer100g(name);
    if (!per || !(per.kcal > 0)) continue;
    const maxAdd = maxFlexCatchUpGrams(name, amount);
    if (maxAdd < 5) continue;
    flex.push({
      index: i,
      name,
      unit,
      amount,
      maxAdd,
      added: 0,
      priority: flexCatchUpPriority(name),
      perKcal: per.kcal,
    });
  }

  if (!flex.length) {
    return { list: next, addedKcal: 0, addedProtein: 0, addedCarbs: 0, addedFat: 0 };
  }

  flex.sort((a, b) => a.priority - b.priority || b.perKcal - a.perKcal);

  let guard = 0;
  while (remaining >= 12 && guard < 80) {
    guard += 1;
    let progressed = false;
    for (const f of flex) {
      if (remaining < 12) break;
      const room = f.maxAdd - f.added;
      if (room < 5) continue;
      const step = Math.min(5, room);
      const macros = nutritionFromGrams(f.name, step);
      if (!(macros.kcal > 0)) continue;
      f.added += step;
      remaining -= macros.kcal;
      progressed = true;
      if (remaining < 12) break;
    }
    if (!progressed) break;
  }

  let addedKcal = 0;
  let addedProtein = 0;
  let addedCarbs = 0;
  let addedFat = 0;
  for (const f of flex) {
    if (f.added <= 0) continue;
    const macros = nutritionFromGrams(f.name, f.added);
    addedKcal += macros.kcal;
    addedProtein += macros.protein_g;
    addedCarbs += macros.carbs_g;
    addedFat += macros.fat_g;
    next[f.index] = setEntryAmount(next[f.index], f.amount + f.added);
  }

  return {
    list: next,
    addedKcal,
    addedProtein,
    addedCarbs,
    addedFat,
  };
}

/**
 * After cookable scale, recover kcal lost to discrete rounding (and optional headroom)
 * by bumping flexible staples only.
 *
 * @param {object} meal
 * @param {number} targetKcal
 * @returns {object} meal
 */
export function boostMealWithFlexibleCatchUp(meal, targetKcal) {
  if (!meal || typeof meal !== 'object') return meal;
  const current = Number(meal.kcal ?? meal.calories ?? meal.recipe?.calories) || 0;
  const target = Number(targetKcal);
  if (!Number.isFinite(target) || target <= 0 || current <= 0) return meal;
  const deficit = target - current;
  if (deficit < 12) return meal;

  let primaryKey = null;
  let primaryList = null;
  if (Array.isArray(meal.recipe?.ingredients) && meal.recipe.ingredients.length) {
    primaryKey = 'recipe.ingredients';
    primaryList = meal.recipe.ingredients;
  } else if (Array.isArray(meal.ingredients) && meal.ingredients.length) {
    primaryKey = 'ingredients';
    primaryList = meal.ingredients;
  } else if (Array.isArray(meal.shopping_ingredient_lines) && meal.shopping_ingredient_lines.length) {
    primaryKey = 'shopping';
    primaryList = meal.shopping_ingredient_lines;
  }
  if (!primaryList) return meal;

  const catchUp = catchUpFlexibleIngredients(primaryList, deficit);
  if (!(catchUp.addedKcal > 0)) return meal;

  if (primaryKey === 'recipe.ingredients') meal.recipe.ingredients = catchUp.list;
  else if (primaryKey === 'ingredients') meal.ingredients = catchUp.list;
  else meal.shopping_ingredient_lines = catchUp.list;

  // Mirror flex catch-up onto secondary surfaces with the same kcal deficit
  // (keeps shopping lines roughly aligned without double-counting macros).
  if (primaryKey !== 'shopping' && Array.isArray(meal.shopping_ingredient_lines) && meal.shopping_ingredient_lines.length) {
    meal.shopping_ingredient_lines = catchUpFlexibleIngredients(
      meal.shopping_ingredient_lines,
      catchUp.addedKcal
    ).list;
  }
  if (primaryKey !== 'ingredients' && Array.isArray(meal.ingredients) && meal.ingredients.length) {
    meal.ingredients = catchUpFlexibleIngredients(meal.ingredients, catchUp.addedKcal).list;
  }
  if (primaryKey !== 'recipe.ingredients' && Array.isArray(meal.recipe?.ingredients) && meal.recipe.ingredients.length) {
    meal.recipe.ingredients = catchUpFlexibleIngredients(meal.recipe.ingredients, catchUp.addedKcal).list;
  }
  if (Array.isArray(meal.recipe?.shopping_ingredient_lines) && meal.recipe.shopping_ingredient_lines.length) {
    meal.recipe.shopping_ingredient_lines = catchUpFlexibleIngredients(
      meal.recipe.shopping_ingredient_lines,
      catchUp.addedKcal
    ).list;
  }

  const nextKcal = Math.round(current + catchUp.addedKcal);
  const nextP = Math.round(((Number(meal.protein_g) || 0) + catchUp.addedProtein) * 10) / 10;
  const nextC = Math.round(((Number(meal.carbs_g) || 0) + catchUp.addedCarbs) * 10) / 10;
  const nextF = Math.round(((Number(meal.fat_g) || 0) + catchUp.addedFat) * 10) / 10;
  const oldMult = Number(meal.portion_multiplier) || 1;
  const baseKcal = current / oldMult;
  const newMult = baseKcal > 0 ? Math.round((nextKcal / baseKcal) * 100) / 100 : oldMult;

  meal.kcal = nextKcal;
  meal.protein_g = nextP;
  meal.carbs_g = nextC;
  meal.fat_g = nextF;
  meal.portion_multiplier = newMult;
  meal.flex_catchup_kcal = Math.round((Number(meal.flex_catchup_kcal) || 0) + catchUp.addedKcal);
  if (meal.recipe && typeof meal.recipe === 'object') {
    meal.recipe.calories = nextKcal;
    meal.recipe.protein_g = nextP;
    meal.recipe.carbs_g = nextC;
    meal.recipe.fat_g = nextF;
    meal.recipe.portion_multiplier = newMult;
  }
  return meal;
}

/**
 * Atomic bundle: nutrition + every ingredient surface, or nothing.
 * Cookable rounding + nutrition from rounded mass + flex catch-up to target.
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
  let rounded = at1 ? scaleIngredientsList(at1, 1, toMult) : null;
  let effective = effectiveMultiplierFromMass(at1, rounded, toMult);
  let nutrition = scaleNutritionFields(nutritionAt1, 1, effective);

  const targetKcal = Number.isFinite(Number(nutritionAt1.kcal))
    ? Math.round(Number(nutritionAt1.kcal) * toMult)
    : null;
  if (rounded && targetKcal != null && nutrition.kcal != null && nutrition.kcal < targetKcal - 12) {
    const catchUp = catchUpFlexibleIngredients(rounded, targetKcal - nutrition.kcal);
    rounded = catchUp.list;
    nutrition = {
      kcal: Math.round((Number(nutrition.kcal) || 0) + catchUp.addedKcal),
      protein_g: Math.round(((Number(nutrition.protein_g) || 0) + catchUp.addedProtein) * 10) / 10,
      carbs_g: Math.round(((Number(nutrition.carbs_g) || 0) + catchUp.addedCarbs) * 10) / 10,
      fat_g: Math.round(((Number(nutrition.fat_g) || 0) + catchUp.addedFat) * 10) / 10,
    };
    const baseKcal = Number(nutritionAt1.kcal) || 0;
    effective = baseKcal > 0 ? nutrition.kcal / baseKcal : effective;
  }

  let ingredientsOut = ingsSrc ? scaleIngredientsList(ingsSrc, fromMult, toMult) : src.ingredients;
  let shopOut = shopSrc ? scaleIngredientsList(shopSrc, fromMult, toMult) : src.shopping_ingredient_lines;

  if (rounded && targetKcal != null) {
    if (ingsSrc && massSource === ingsSrc) ingredientsOut = rounded;
    if (shopSrc && massSource === shopSrc) shopOut = rounded;
    // Mirror flex catch-up onto the secondary surface when both exist
    if (ingsSrc && shopSrc && massSource === ingsSrc && Array.isArray(shopOut)) {
      const shopCatch = catchUpFlexibleIngredients(
        shopOut,
        Math.max(0, targetKcal - scaleNutritionFields(nutritionAt1, 1, effectiveMultiplierFromMass(
          scaleIngredientsList(shopSrc, fromMult, 1),
          scaleIngredientsList(shopSrc, fromMult, toMult),
          toMult
        )).kcal)
      );
      shopOut = shopCatch.list;
    } else if (ingsSrc && shopSrc && massSource === shopSrc && Array.isArray(ingredientsOut)) {
      ingredientsOut = rounded; // already caught up via massSource
    }
  }

  return {
    ...src,
    kcal: nutrition.kcal,
    calories: nutrition.kcal,
    protein_g: nutrition.protein_g,
    carbs_g: nutrition.carbs_g,
    fat_g: nutrition.fat_g,
    portion_multiplier: Math.round(effective * 100) / 100,
    ingredients: ingredientsOut,
    shopping_ingredient_lines: shopOut,
  };
}

/**
 * Mutate a structured meal so nutrition and ingredients stay locked together.
 * Discrete pieces become cookable; macros follow the rounded plate;
 * flexible staples catch up remaining kcal toward the requested multiplier.
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
  let rounded = at1 ? scaleIngredientsList(at1, 1, toMult) : null;
  let effective = effectiveMultiplierFromMass(at1, rounded, toMult);
  let nutrition = scaleNutritionFields(nutritionAt1, 1, effective);

  const targetKcal = Number.isFinite(Number(nutritionAt1.kcal))
    ? Math.round(Number(nutritionAt1.kcal) * toMult)
    : null;

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

  // Recover kcal lost to discrete rounding via flexible staples (rice/meat/oil…).
  if (targetKcal != null && meal.kcal != null && meal.kcal < targetKcal - 12) {
    boostMealWithFlexibleCatchUp(meal, targetKcal);
  }

  return meal;
}
