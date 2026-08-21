/**
 * Zkrácení anglických search dotazů pro Spoonacular (1–2 slova, hlavní ingredience).
 * Dlouhé fráze vrací málo relevantní výsledky a confidence 0.
 */

function norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Přídavná jména na začátku — přeskočit na další slovo (hlavní ingredience). */
const LEADING_SKIP = new Set([
  'grilled',
  'lean',
  'white',
  'healthy',
  'baked',
  'roasted',
  'fried',
  'steamed',
  'smoked',
  'raw',
]);

/** Rozšířený skip (první 3 slova) — „fresh mixed seasonal …“ */
const BROADER_SKIP = new Set([
  ...LEADING_SKIP,
  'fresh',
  'mixed',
  'seasonal',
  'low',
  'high',
  'quick',
  'easy',
  'stir',
  'whole',
]);

/** Druhé slovo je jen doplněk → vrať jen první významové (beef vegetables → beef) */
const TRAILING_GENERIC = new Set([
  'vegetables',
  'rice',
  'fruit',
  'potatoes',
  'toast',
  'muesli',
  'banana',
  'eggs',
  'berries',
  'vegetable',
]);

/** Smysluplné druhé slovo u bílkoviny / jídla (2 slova pro vyhledávání) */
const MEANINGFUL_SECOND = new Set(['breast', 'thigh', 'salad', 'fry', 'cheese', 'potato', 'meat']);

/**
 * Dvouslovné názvy jídel na začátku řetězce (delší první).
 */
const COMPOUND_PREFIXES = [
  { phrase: 'chicken stir fry', out: 'chicken' },
  { phrase: 'chicken breast', out: 'chicken breast' },
  { phrase: 'chicken salad', out: 'chicken salad' },
  { phrase: 'cottage cheese', out: 'cottage cheese' },
  { phrase: 'sweet potato', out: 'sweet potato' },
  { phrase: 'protein smoothie', out: 'protein smoothie' },
  { phrase: 'whole grain', out: 'whole grain' },
];

/** Celé normalizované dotazy z AI plánu → krátký dotaz pro API */
const EXACT_NORMALIZED = {
  'smoothie protein toast': 'protein smoothie',
  'lean meat vegetables': 'chicken',
  'lean beef vegetables': 'beef',
  'white fish vegetables': 'fish',
  'fish rice salad': 'fish',
  'fish vegetables': 'fish',
  'grilled salmon potatoes salad': 'salmon',
  'beef quinoa vegetables': 'beef',
  'oatmeal banana eggs': 'oatmeal',
  'oatmeal pancakes fruit': 'oatmeal',
  'yogurt muesli fruit': 'yogurt',
  'turkey sweet potato': 'turkey',
  'chicken salad avocado': 'chicken salad',
  'eggs whole grain toast': 'eggs',
  'omelette vegetables': 'omelette',
  'grilled chicken vegetables': 'chicken',
};

/**
 * Obecná logika: první ne-skip slovo v prvních 3 slovech, max 2 slova (např. chicken breast).
 * @param {string} query
 * @returns {string}
 */
function shortenBySkipLoop(queryNorm) {
  const words = queryNorm.split(/\s+/).filter(Boolean);
  if (!words.length) return '';

  for (let i = 0; i < Math.min(words.length, 3); i++) {
    const w = words[i].toLowerCase();
    if (BROADER_SKIP.has(w)) continue;

    const w1 = words[i];
    const w2 = words[i + 1];
    const w2l = w2 ? w2.toLowerCase() : '';
    if (w2 && TRAILING_GENERIC.has(w2l)) {
      return w1;
    }
    if (w2 && MEANINGFUL_SECOND.has(w2l)) {
      return `${w1} ${w2}`;
    }
    return w1;
  }
  return words[0];
}

/**
 * @param {string} query - typicky anglický search_query z meal plánu
 * @returns {string}
 */
export function shortenMealSearchQuery(query) {
  const n = norm(query);
  if (!n) return '';

  if (EXACT_NORMALIZED[n]) return EXACT_NORMALIZED[n];

  for (const { phrase, out } of COMPOUND_PREFIXES) {
    if (n === phrase || n.startsWith(`${phrase} `)) return out;
  }

  const words = n.split(/\s+/).filter(Boolean);
  if (!words.length) return '';

  if (words[0] === 'lean' && words[1] === 'meat') return 'chicken';
  if (words[0] === 'white' && words[1] === 'fish') return 'fish';

  const first = words[0];
  if (LEADING_SKIP.has(first) && words.length >= 2) {
    return words[1];
  }

  const loop = shortenBySkipLoop(n);
  if (loop) return loop;

  return words[0];
}

/** Alias pro dokumentaci / import z jiných modulů */
export const shortenSpoonacularQuery = shortenMealSearchQuery;
