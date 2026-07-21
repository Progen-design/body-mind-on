/**
 * Canonical ingredient normalization — single SSOT for shopping list aggregation
 * and nutrition lookup (ingredients_nutrition.name_cs + aliases).
 */
import { ALIAS_PAIRS, CANONICAL_DISPLAY, UNIT_TO_GRAMS } from './ingredientAliasSeed.js';

const QUALIFIER_DISPLAY = Object.freeze({
  syrove: '(syrové)',
  suche: '(suché)',
  varene: '(vařené)',
});

const CANONICAL_KEYS = new Set(Object.keys(CANONICAL_DISPLAY));

/** Longest alias first for substring safety */
const ALIASES_SORTED = [...ALIAS_PAIRS].sort((a, b) => b[0].length - a[0].length);

const MEAT_FISH_RE = /\b(kureci|kruti|hovezi|veprov|losos|tunak|ryba|sunka|maso|panenka)\b/;
const DRY_GRAIN_RE = /\b(ryze|ovesne|testovin|quinoa|musli|cocka|fazole|kuskus)\b/;
const RAW_PRODUCE_RE = /\b(sladke brambory|brambory)\b/;
/** Canned, cured, dairy — never infer (syrové) */
const PROCESSED_NO_RAW_QUALIFIER_RE =
  /\b(sunka|syr|jogurt|kefir|cottage|tvaroh)\b|konzerv|uzenin|tunak \(v konzerve\)/;

/** Ascii unit → canonical singular (plurals / declension) */
const UNIT_PLURAL_TO_SINGULAR = Object.freeze({
  konzervy: 'konzerva',
  konzerv: 'konzerva',
  konzervu: 'konzerva',
  platky: 'plátek',
  platku: 'plátek',
  strouzky: 'stroužek',
  strouzku: 'stroužek',
});

/** @type {Set<string>} */
let unmappedIngredients = new Set();

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function normKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\s()/.-]/g, ' ')
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
  if (UNIT_PLURAL_TO_SINGULAR[ascii]) return UNIT_PLURAL_TO_SINGULAR[ascii];
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

function stripParentheticalFromName(key) {
  return key.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function applyAlias(key) {
  for (const [alias, canonical] of ALIASES_SORTED) {
    if (key === alias) return canonical;
  }
  for (const [alias, canonical] of ALIASES_SORTED) {
    if (alias.length >= 4 && key.includes(alias)) return canonical;
  }
  if (CANONICAL_KEYS.has(key)) return key;
  return key;
}

/**
 * Czech declension variants → base lemma (normalized, no diacritics).
 * @param {string} key
 * @returns {string[]}
 */
function declensionVariants(key) {
  const variants = new Set([key]);
  variants.add(key.replace(/\bbileho jogurtu\b/g, 'bily jogurt'));
  variants.add(key.replace(/\bbileho\b/g, 'bily'));

  const words = key.split(' ');
  if (words.length === 0) return [...variants];

  const last = words[words.length - 1];
  const prefix = words.slice(0, -1);

  if (last.endsWith('u') && last.length > 2) {
    variants.add([...prefix, last.slice(0, -1)].join(' '));
  }
  if (last === 'orechu' || last === 'orech') {
    variants.add([...prefix, 'orechy'].join(' '));
  }
  if (last.endsWith('u') && last.startsWith('banan')) {
    variants.add([...prefix, 'banan'].join(' '));
  }

  return [...variants];
}

/**
 * Resolve raw ingredient name to canonical nutrition key + Czech display.
 * @param {string|null|undefined} rawName
 * @returns {{ key: string, display: string, matched: boolean }}
 */
export function resolveCanonicalName(rawName) {
  const trimmed = String(rawName || '').trim();
  let key = stripParentheticalFromName(normKey(trimmed));
  if (!key) {
    return { key: '', display: trimmed, matched: false };
  }

  key = applyAlias(key);
  if (CANONICAL_KEYS.has(key)) {
    return { key, display: CANONICAL_DISPLAY[key] || trimmed, matched: true };
  }

  for (const variant of declensionVariants(key)) {
    const aliased = applyAlias(variant);
    if (CANONICAL_KEYS.has(aliased)) {
      return { key: aliased, display: CANONICAL_DISPLAY[aliased] || trimmed, matched: true };
    }
  }

  let bestKey = null;
  let bestLen = 0;
  for (const ck of CANONICAL_KEYS) {
    if (key.includes(ck) || ck.includes(key)) {
      if (ck.length > bestLen) {
        bestKey = ck;
        bestLen = ck.length;
      }
    }
  }
  if (bestKey) {
    return { key: bestKey, display: CANONICAL_DISPLAY[bestKey] || trimmed, matched: true };
  }

  return { key, display: trimmed, matched: false };
}

/**
 * Infer canonical (syrové)/(suché) for display — never splits aggregation groups.
 * @param {string} canonicalKey
 * @param {string} parsedQualifier normalized qualifier from line
 * @returns {string}
 */
export function inferCanonicalQualifier(canonicalKey, parsedQualifier = '', rawName = '') {
  const context = `${canonicalKey} ${normKey(rawName)}`;
  if (PROCESSED_NO_RAW_QUALIFIER_RE.test(context)) return '';
  if (MEAT_FISH_RE.test(canonicalKey) || RAW_PRODUCE_RE.test(canonicalKey)) return 'syrove';
  if (DRY_GRAIN_RE.test(canonicalKey)) return 'suche';
  return parsedQualifier || '';
}

/**
 * Convert amount+unit to canonical shopping unit (g/ml/ks/plátek).
 * Spoons → grams via unit_conversions seed.
 * @param {number|null} amount
 * @param {string|null|undefined} unit
 * @returns {{ amount: number, unit: string, aggregatable: boolean }}
 */
export function convertToCanonicalUnit(amount, unit) {
  const n = Number(amount);
  const u = normalizeShoppingUnit(unit);
  if (!Number.isFinite(n) || n <= 0 || !u) {
    return { amount: 0, unit: u, aggregatable: false };
  }

  if (u === 'g') return { amount: n, unit: 'g', aggregatable: true };
  if (u === 'ml') return { amount: n, unit: 'ml', aggregatable: true };
  if (u === 'ks' || u === 'plátek' || u === 'konzerva' || u === 'stroužek') {
    return { amount: n, unit: u, aggregatable: true };
  }

  const ascii = u.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const gramsPer = UNIT_TO_GRAMS[ascii];
  if (gramsPer != null) {
    return { amount: n * gramsPer, unit: 'g', aggregatable: true };
  }

  return { amount: n, unit: u, aggregatable: true };
}

/**
 * @param {object} parsed output of parseShoppingIngredientLine / parseShoppingIngredientRecord
 * @returns {object}
 */
export function normalizeParsedIngredient(parsed) {
  if (!parsed) {
    return {
      raw: '',
      name: '',
      displayName: '',
      canonicalKey: '',
      amount: 0,
      unit: '',
      qualifier: '',
      qualifierText: '',
      aggregatable: false,
      matched: false,
      groupKey: 'raw:',
      rawKey: '',
    };
  }

  const canonical = resolveCanonicalName(parsed.name);
  if (!canonical.matched && parsed.name) {
    unmappedIngredients.add(String(parsed.name).trim());
  }

  const converted = parsed.aggregatable
    ? convertToCanonicalUnit(parsed.amount, parsed.unit)
    : { amount: parsed.amount, unit: parsed.unit, aggregatable: false };

  const qualifier = inferCanonicalQualifier(canonical.key, parsed.qualifier || '', parsed.name);
  const qualifierText = qualifier === 'syrove'
    ? 'syrové'
    : qualifier === 'suche'
      ? 'suché'
      : qualifier === 'varene'
        ? 'vařené'
        : parsed.qualifierText || '';

  const aggregatable = converted.aggregatable;
  const groupKey = aggregatable
    ? `${canonical.key}|${converted.unit}`
    : `raw:${normKey(parsed.raw || parsed.name)}`;

  return {
    raw: parsed.raw,
    name: canonical.display,
    displayName: canonical.display,
    canonicalKey: canonical.key,
    amount: converted.amount,
    unit: converted.unit,
    qualifier,
    qualifierText,
    aggregatable,
    matched: canonical.matched,
    groupKey,
    rawKey: normKey(parsed.raw || parsed.name),
  };
}

export function resetUnmappedIngredients() {
  unmappedIngredients = new Set();
}

export function getUnmappedIngredients() {
  return [...unmappedIngredients];
}

export function formatQualifierForDisplay(qualifier, qualifierText) {
  if (QUALIFIER_DISPLAY[qualifier]) return QUALIFIER_DISPLAY[qualifier];
  if (qualifierText) return `(${qualifierText})`;
  return '';
}
