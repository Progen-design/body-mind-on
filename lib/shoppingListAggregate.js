/**
 * Aggregate shopping list lines by ingredient name + unit + raw/dry/cooked qualifier.
 * Canonical source: meal.recipe.ingredients ({ name, amount, unit, original }).
 * Fallback: meal.shopping_ingredient_lines (legacy string lines).
 */
import { roundCookableAmount, formatScaledAmount } from './nutrition/atomicPortionScale.js';

const QUALIFIER_SUFFIX_RE = /\s*\(([^)]+)\)\s*$/u;
const AMOUNT_IN_LINE_RE = /^(.+?)\s+(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s+(\S.*)$/u;
const AMOUNT_PREFIX_RE = /^(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s+(\S.+)$/u;

const QUALIFIER_DISPLAY = Object.freeze({
  syrove: '(syrové)',
  suche: '(suché)',
  varene: '(vařené)',
});

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

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string|null|undefined} unit
 * @returns {string}
 */
export function normalizeShoppingUnit(unit) {
  const raw = String(unit || '').toLowerCase().trim().replace(/[.,;]+$/g, '');
  if (!raw) return '';
  const ascii = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (ascii === 'gr' || ascii === 'gram' || ascii === 'grams') return 'g';
  if (ascii === 'milliliter' || ascii === 'milliliters') return 'ml';
  if (ascii === 'litr' || ascii === 'litru' || ascii === 'ltr') return 'l';
  if (ascii === 'kus' || ascii === 'kusy' || ascii === 'kusu') return 'ks';
  if (ascii === 'lzice') return 'lžíce';
  if (ascii === 'lzicka') return 'lžička';
  if (ascii === 'platek' || ascii === 'platky' || ascii === 'platku') return 'plátek';
  return raw;
}

/**
 * @param {string|null|undefined} qualifierText
 * @returns {string}
 */
export function normalizeShoppingQualifier(qualifierText) {
  const t = String(qualifierText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
  if (!t) return '';
  if (/syrov/.test(t)) return 'syrove';
  if (/such/.test(t)) return 'suche';
  if (/varen|varene/.test(t)) return 'varene';
  return t;
}

function splitUnitAndTrailing(unitPart) {
  const raw = String(unitPart || '').trim();
  if (!raw) return { unit: '', trailing: '' };
  const qMatch = raw.match(QUALIFIER_SUFFIX_RE);
  if (qMatch) {
    const unit = raw.slice(0, qMatch.index).trim().split(/\s+/)[0] || '';
    return { unit, trailing: qMatch[0].trim() };
  }
  const unit = raw.split(/\s+/)[0] || '';
  const trailing = raw.slice(unit.length).trim();
  return { unit, trailing };
}

/**
 * @param {string} line
 * @returns {object|null}
 */
export function parseShoppingIngredientLine(line) {
  const raw = String(line || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  let qualifierText = '';
  let qualifier = '';
  let base = raw;
  const suffixMatch = raw.match(QUALIFIER_SUFFIX_RE);
  if (suffixMatch) {
    qualifierText = suffixMatch[1].trim();
    qualifier = normalizeShoppingQualifier(qualifierText);
    base = raw.slice(0, suffixMatch.index).trim();
  }

  let name = base;
  let amount = null;
  let unit = '';

  let match = base.match(AMOUNT_IN_LINE_RE);
  if (match) {
    name = match[1].trim();
    amount = parseFlexibleNumber(match[2]);
    const split = splitUnitAndTrailing(match[3]);
    unit = normalizeShoppingUnit(split.unit);
    if (!qualifier && split.trailing) {
      const inner = split.trailing.match(/^\(([^)]+)\)$/);
      if (inner) {
        qualifierText = inner[1].trim();
        qualifier = normalizeShoppingQualifier(qualifierText);
      }
    }
  } else {
    match = base.match(AMOUNT_PREFIX_RE);
    if (match) {
      amount = parseFlexibleNumber(match[1]);
      const rest = match[2].trim();
      const split = splitUnitAndTrailing(rest);
      if (split.unit && /^\d/.test(split.unit) === false && normalizeShoppingUnit(split.unit)) {
        unit = normalizeShoppingUnit(split.unit);
        name = rest.slice(split.unit.length).trim() || rest;
      } else {
        name = rest;
        unit = 'ks';
      }
    }
  }

  const aggregatable = amount != null && Number.isFinite(amount) && amount > 0 && !!unit;

  return {
    raw,
    name,
    amount,
    unit,
    qualifier,
    qualifierText,
    aggregatable,
  };
}

function aggregateKey(parsed) {
  if (!parsed.aggregatable) {
    return `raw:${normalizeKey(parsed.raw)}`;
  }
  return `${normalizeKey(parsed.name)}|${parsed.unit}|${parsed.qualifier || ''}`;
}

function roundAggregatedAmount(amount, unit) {
  const u = normalizeShoppingUnit(unit);
  if (u === 'g') {
    const rounded = Math.round(amount / 5) * 5;
    return Math.max(5, rounded);
  }
  if (u === 'ml') {
    const rounded = Math.round(amount / 10) * 10;
    return Math.max(10, rounded);
  }
  if (u === 'kg') {
    return Math.round(amount * 100) / 100;
  }
  if (u === 'ks' || u === 'plátek' || u === 'lžíce' || u === 'lžička') {
    return Math.max(1, Math.round(amount));
  }
  return roundCookableAmount(amount, unit, '');
}

function formatQualifierForDisplay(qualifier, qualifierText) {
  if (QUALIFIER_DISPLAY[qualifier]) return QUALIFIER_DISPLAY[qualifier];
  if (qualifierText) return `(${qualifierText})`;
  return '';
}

/**
 * Display line for one structured ingredient (matches recipe.ingredients in plan JSON).
 * @param {string|object|null|undefined} ing
 * @returns {string}
 */
export function ingredientRecordToDisplayLine(ing) {
  if (ing == null) return '';
  if (typeof ing === 'string') return String(ing).replace(/\s+/g, ' ').trim();
  if (typeof ing !== 'object') return String(ing).trim();

  const original = typeof ing.original === 'string' ? ing.original.trim() : '';
  if (original) return original;

  const name = typeof ing.name === 'string' ? ing.name.trim() : '';
  const unit = ing.unit != null ? String(ing.unit).trim() : '';
  const amount = ing.amount != null && Number.isFinite(Number(ing.amount))
    ? formatScaledAmount(Number(ing.amount), { unit, name })
    : (ing.amount != null ? String(ing.amount).trim() : '');
  return [name, amount, unit].filter(Boolean).join(' ').trim();
}

/**
 * Parse structured ingredient object directly (preferred over string round-trip).
 * @param {object} ing
 * @returns {object|null}
 */
export function parseShoppingIngredientRecord(ing) {
  if (!ing || typeof ing !== 'object') return null;
  const line = ingredientRecordToDisplayLine(ing);
  if (!line) return null;

  const parsed = parseShoppingIngredientLine(line);
  if (!parsed) return null;

  if (!parsed.name && typeof ing.name === 'string') {
    parsed.name = ing.name.trim();
  }
  if (parsed.amount == null && ing.amount != null && Number.isFinite(Number(ing.amount))) {
    parsed.amount = Number(ing.amount);
    parsed.unit = normalizeShoppingUnit(ing.unit || parsed.unit);
    parsed.aggregatable = parsed.amount > 0 && !!parsed.unit;
  }

  return parsed;
}

function formatAggregatedLine(entry) {
  if (!entry.aggregatable) return entry.displayRaw || entry.raw;
  const rounded = roundAggregatedAmount(entry.amount, entry.unit);
  const displayAmount = formatScaledAmount(rounded, { unit: entry.unit, name: entry.name });
  const qual = formatQualifierForDisplay(entry.qualifier, entry.qualifierText);
  return `${entry.name} ${displayAmount} ${entry.unit}${qual ? ` ${qual}` : ''}`.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string[]} lines
 * @returns {string[]}
 */
export function aggregateShoppingIngredientLines(lines) {
  /** @type {Map<string, object>} */
  const groups = new Map();

  for (const line of lines || []) {
    const parsed = parseShoppingIngredientLine(line);
    if (!parsed) continue;
    const key = aggregateKey(parsed);

    if (!groups.has(key)) {
      groups.set(key, {
        ...parsed,
        displayRaw: parsed.raw,
        amount: parsed.aggregatable ? parsed.amount : null,
      });
      continue;
    }

    const existing = groups.get(key);
    if (parsed.aggregatable && existing.aggregatable) {
      existing.amount += parsed.amount;
    }
  }

  return [...groups.values()]
    .map(formatAggregatedLine)
    .sort((a, b) => a.localeCompare(b, 'cs'));
}

/**
 * Collect canonical ingredient lines from meals (recipe.ingredients first).
 * @param {object[]} meals
 * @returns {string[]}
 */
export function collectShoppingLinesFromMeals(meals = []) {
  const out = [];
  for (const meal of meals) {
    const recipeIngredients = Array.isArray(meal?.recipe?.ingredients) ? meal.recipe.ingredients : [];
    if (recipeIngredients.length > 0) {
      for (const ing of recipeIngredients) {
        const line = ingredientRecordToDisplayLine(ing);
        if (line) out.push(line);
      }
      continue;
    }

    const legacy = Array.isArray(meal?.shopping_ingredient_lines) ? meal.shopping_ingredient_lines : [];
    for (const line of legacy) {
      const s = String(line || '').trim();
      if (s) out.push(s);
    }

    if (legacy.length === 0 && Array.isArray(meal?.ingredients)) {
      for (const ing of meal.ingredients) {
        const line = ingredientRecordToDisplayLine(ing);
        if (line) out.push(line);
      }
    }
  }
  return out;
}

/**
 * All structured ingredient records from meals (recipe.ingredients).
 * @param {object[]} meals
 * @returns {object[]}
 */
export function collectShoppingIngredientRecordsFromMeals(meals = []) {
  const out = [];
  for (const meal of meals || []) {
    const recipeIngredients = Array.isArray(meal?.recipe?.ingredients) ? meal.recipe.ingredients : [];
    for (const ing of recipeIngredients) {
      if (ing && typeof ing === 'object') out.push(ing);
    }
  }
  return out;
}

/**
 * Sum amounts from meal.recipe.ingredients (test / integrity).
 * @param {object[]} meals
 * @param {RegExp} namePattern
 * @param {string} unit
 * @param {string|null} [qualifier]
 * @returns {number}
 */
export function sumRecipeIngredientAmounts(meals, namePattern, unit, qualifier = null) {
  const targetUnit = normalizeShoppingUnit(unit);
  const targetQualifier = qualifier != null ? normalizeShoppingQualifier(qualifier) : null;
  let sum = 0;

  for (const ing of collectShoppingIngredientRecordsFromMeals(meals)) {
    const parsed = parseShoppingIngredientRecord(ing);
    if (!parsed?.aggregatable) continue;
    if (!namePattern.test(parsed.name)) continue;
    if (normalizeShoppingUnit(parsed.unit) !== targetUnit) continue;
    if (targetQualifier != null && parsed.qualifier !== targetQualifier) continue;
    sum += parsed.amount;
  }

  return sum;
}

/**
 * Count display lines matching name+unit before aggregation (for tests).
 * @param {string[]} lines
 * @param {RegExp} namePattern
 * @param {string} unit
 * @returns {number}
 */
export function countShoppingLinesForIngredient(lines, namePattern, unit) {
  const targetUnit = normalizeShoppingUnit(unit);
  let count = 0;
  for (const line of lines || []) {
    const parsed = parseShoppingIngredientLine(line);
    if (!parsed?.aggregatable) continue;
    if (!namePattern.test(parsed.name)) continue;
    if (normalizeShoppingUnit(parsed.unit) !== targetUnit) continue;
    count += 1;
  }
  return count;
}

/**
 * @param {object[]} meals
 * @returns {string[]}
 */
export function collectShoppingLinesFromMealsLegacy(meals = []) {
  const out = [];
  for (const meal of meals) {
    const arr = meal?.shopping_ingredient_lines;
    if (!Array.isArray(arr)) continue;
    for (const line of arr) {
      const s = String(line || '').trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Sum raw (unrounded) amounts for one ingredient across meal lines — for tests.
 * @param {object[]} meals
 * @param {RegExp} namePattern
 * @param {string} unit
 * @param {string|null} [qualifier]
 * @returns {number}
 */
export function sumMealIngredientAmounts(meals, namePattern, unit, qualifier = null) {
  const recipeSum = sumRecipeIngredientAmounts(meals, namePattern, unit, qualifier);
  if (recipeSum > 0) return recipeSum;

  const targetUnit = normalizeShoppingUnit(unit);
  const targetQualifier = qualifier != null ? normalizeShoppingQualifier(qualifier) : null;
  let sum = 0;

  for (const line of collectShoppingLinesFromMealsLegacy(meals)) {
    const parsed = parseShoppingIngredientLine(line);
    if (!parsed?.aggregatable) continue;
    if (!namePattern.test(parsed.name)) continue;
    if (normalizeShoppingUnit(parsed.unit) !== targetUnit) continue;
    if (targetQualifier != null && parsed.qualifier !== targetQualifier) continue;
    sum += parsed.amount;
  }

  return sum;
}

/**
 * Parsed amount from aggregated lines (after rounding) for one ingredient.
 * @param {string[]} aggregatedLines
 * @param {RegExp} namePattern
 * @param {string} unit
 * @param {string|null} [qualifier]
 * @returns {number|null}
 */
export function getAggregatedIngredientAmount(aggregatedLines, namePattern, unit, qualifier = null) {
  const targetUnit = normalizeShoppingUnit(unit);
  const targetQualifier = qualifier != null ? normalizeShoppingQualifier(qualifier) : null;

  for (const line of aggregatedLines || []) {
    const parsed = parseShoppingIngredientLine(line);
    if (!parsed?.aggregatable) continue;
    if (!namePattern.test(parsed.name)) continue;
    if (normalizeShoppingUnit(parsed.unit) !== targetUnit) continue;
    if (targetQualifier != null && parsed.qualifier !== targetQualifier) continue;
    return parsed.amount;
  }
  return null;
}
