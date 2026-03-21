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

/**
 * Dvouslovné názvy jídel na začátku řetězce (delší první).
 * Např. "cottage cheese fruit" → cottage cheese
 */
const COMPOUND_PREFIXES = [
  { phrase: 'cottage cheese', out: 'cottage cheese' },
  { phrase: 'sweet potato', out: 'sweet potato' },
  { phrase: 'protein smoothie', out: 'protein smoothie' },
  { phrase: 'chicken salad', out: 'chicken salad' },
  { phrase: 'chicken stir fry', out: 'chicken' },
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

  // Speciální dvojice před obecným pravidlem
  if (words[0] === 'lean' && words[1] === 'meat') return 'chicken';
  if (words[0] === 'white' && words[1] === 'fish') return 'fish';

  const first = words[0];
  if (LEADING_SKIP.has(first) && words.length >= 2) {
    return words[1];
  }

  return words[0];
}
