/**
 * Aggregate shopping list lines by ingredient name + unit + raw/dry/cooked qualifier.
 * Source lines come from meal.shopping_ingredient_lines in structured_plan_json.
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
 * @param {object[]} meals
 * @returns {string[]}
 */
export function collectShoppingLinesFromMeals(meals = []) {
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
  const targetUnit = normalizeShoppingUnit(unit);
  const targetQualifier = qualifier != null ? normalizeShoppingQualifier(qualifier) : null;
  let sum = 0;

  for (const line of collectShoppingLinesFromMeals(meals)) {
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
