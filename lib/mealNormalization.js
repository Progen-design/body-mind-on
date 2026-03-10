/**
 * lib/mealNormalization.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Czech meal name normalization + Czech → English translation for external API queries.
 *
 * Purpose: improve Spoonacular / Pexels hit quality by:
 *   1. Cleaning noisy AI-generated meal names before sending as search queries
 *   2. Translating common Czech food terms to English for better Spoonacular coverage
 *
 * Spoonacular has significantly better coverage for English queries. Providing
 * an English translation as an additional search candidate substantially
 * increases the probability of a high-confidence (exact) match.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Strip diacritics from a string.
 */
export function removeDiacritics(s) {
  if (!s || typeof s !== 'string') return '';
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// ─── Czech → English translation layer ──────────────────────────────────────
//
// Keys are diacritics-removed (ASCII) Czech food terms, sorted longest-first
// to avoid partial replacements (e.g. "kureci prsa" must match before "kureci").
// Translation is intentionally practical — covers the most common AI-generated
// Czech meal terms, not a full dictionary.
//
const CS_EN_RAW = [
  // Multi-word phrases first
  ['ovesna kase', 'oatmeal'],
  ['kureci prsa', 'chicken breast'],
  ['kureci stehna', 'chicken thighs'],
  ['kureci maso', 'chicken'],
  ['hovezi maso', 'beef'],
  ['vepřove maso', 'pork'],
  ['vepřove', 'pork'],
  ['krevety', 'shrimp'],
  ['sweet potato', 'sweet potato'],   // passthrough guard
  ['bataty', 'sweet potato'],
  ['brambory', 'potatoes'],
  ['testoviny', 'pasta'],
  ['rajcata', 'tomatoes'],
  ['spenat', 'spinach'],
  ['boruvky', 'blueberries'],
  ['jahody', 'strawberries'],
  ['banan', 'banana'],
  ['jogurt', 'yogurt'],
  ['tvaroh', 'cottage cheese'],
  ['zelenina', 'vegetables'],
  ['brokolice', 'broccoli'],
  ['paprika', 'bell pepper'],
  ['mrkev', 'carrot'],
  ['cuketa', 'zucchini'],
  ['quinoa', 'quinoa'],
  // Single-word proteins
  ['kureci', 'chicken'],
  ['hovezi', 'beef'],
  ['losos', 'salmon'],
  ['tunak', 'tuna'],
  ['treska', 'cod'],
  ['vejce', 'eggs'],
  ['tofu', 'tofu'],
  ['tempeh', 'tempeh'],
  // Grains / carbs
  ['ryze', 'rice'],
  ['oves', 'oatmeal'],
  // Generic terms
  ['salat', 'salad'],
  ['polevka', 'soup'],
  ['prsa', 'breast'],
  ['stehna', 'thighs'],
  // Cooking methods (improve matching in English)
  ['na grilu', 'grilled'],
  ['na gril', 'grilled'],
  ['pecene', 'baked'],
  ['varene', 'boiled'],
  ['dusene', 'steamed'],
];

// Pre-normalize the map once at module load time.
// Both keys are already ASCII (diacritics-removed), sorted longest-first.
const CS_TO_EN_MAP = CS_EN_RAW
  .map(([cs, en]) => [removeDiacritics(cs).toLowerCase(), en])
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Translate a normalized Czech meal query to a rough English equivalent.
 * The translation is practical (most common terms), not linguistically complete.
 * Returns empty string if nothing useful can be produced.
 *
 * @param {string} czechQuery  Already-normalized Czech meal name (no parentheses, no prefixes).
 * @returns {string}
 */
export function translateMealQueryToEn(czechQuery) {
  if (!czechQuery || typeof czechQuery !== 'string') return '';
  let en = removeDiacritics(czechQuery).toLowerCase().trim();
  for (const [cs, enWord] of CS_TO_EN_MAP) {
    if (en.includes(cs)) {
      en = en.replace(new RegExp(cs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), enWord);
    }
  }
  return en.replace(/\s+/g, ' ').trim();
}

/**
 * Build an ordered list of search query CANDIDATES for Spoonacular.
 *
 * ORDER RATIONALE:
 * Spoonacular has far better English coverage. English candidates are placed FIRST
 * so the pipeline exits early (score >= threshold) without wasting API calls on
 * Czech queries that rarely match Spoonacular titles.
 *
 * Czech candidates are still included as fallback — useful for well-known
 * internationalised dishes (e.g. "quinoa", "tempeh") that Spoonacular indexes.
 *
 * Candidates are deduplicated. Candidates longer than 60 chars are skipped
 * (too noisy for Spoonacular's search ranking).
 *
 * Order:
 *   1. Simplified English (before " s " connector) — typically "chicken breast grilled"
 *   2. Full English translation   — "chicken breast grilled rice vegetables"
 *   3. Simplified Czech           — "Kuřecí prsa na grilu"
 *   4. Full Czech                 — "Kuřecí prsa na grilu s rýží a zeleninou"
 *   5. First 3 Czech words        — short fallback
 *   6. First word English         — single-keyword last resort
 *
 * @param {string} mealName  Raw meal name from plan HTML.
 * @returns {string[]}
 */
export function buildMealSearchCandidates(mealName) {
  const base = normalizeMealQueryCs(mealName);
  if (!base) return [];

  const MAX_LEN = 60;
  const candidates = [];
  const seen = new Set();
  const add = (s) => {
    const trimmed = (s || '').trim();
    if (trimmed && trimmed.length >= 4 && trimmed.length <= MAX_LEN && !seen.has(trimmed)) {
      seen.add(trimmed);
      candidates.push(trimmed);
    }
  };

  const beforeConnector = base.split(/\s+s\s+|\s+se\s+/)[0].trim();
  const enFull = translateMealQueryToEn(base);
  const enSimplified = (beforeConnector !== base) ? translateMealQueryToEn(beforeConnector) : '';

  // 1. Simplified English (most Spoonacular-friendly: short, English, specific)
  if (enSimplified && enSimplified !== enFull) add(enSimplified);

  // 2. Full English translation
  add(enFull);

  // 3. Simplified Czech (before connector)
  if (beforeConnector !== base) add(beforeConnector);

  // 4. Full Czech
  add(base);

  // 5. First 3 Czech words (short fallback)
  const words = base.split(/\s+/);
  if (words.length > 3) add(words.slice(0, 3).join(' '));

  // 6. First word English (single-keyword last resort)
  if (words.length > 1) {
    const enFirst = translateMealQueryToEn(words[0]);
    if (enFirst && enFirst !== words[0]) add(enFirst);
  }

  return candidates;
}

/**
 * Normalize a Czech meal name for search API queries.
 *
 * Examples:
 *   "Kuřecí prsa na grilu s rýží a zeleninou (kuřecí prsa, jasmínová rýže, paprika, brokolice, olivový olej)"
 *   → "Kuřecí prsa na grilu s rýží a zeleninou"
 *
 *   "Snídaně: Ovesná kaše s borůvkami (skořice, chia)"
 *   → "Ovesná kaše s borůvkami"
 *
 *   "200g kuřecí prsa"
 *   → "kuřecí prsa"
 */
export function normalizeMealQueryCs(mealName) {
  if (!mealName || typeof mealName !== 'string') return '';
  let q = mealName.trim();

  // Remove leading meal-type prefix: "Snídaně: ", "Oběd: ", "Večeře: " etc.
  q = q.replace(/^(Snídaně|Oběd|Večeře|Dopolední svačina|Odpolední svačina|Svačina|Svač\.)\s*[:–-]\s*/i, '');

  // Remove parenthetical ingredient lists (can be long and confuse search)
  // "dish name (ingredient1, ingredient2, ...)" → "dish name"
  q = q.replace(/\s*\([^)]{3,120}\)/g, '');

  // Remove measurement quantities: "200g", "1 porce", "3 lžíce" etc.
  q = q.replace(/\b\d+\s*(g|ml|ks|lžíce|lžička|hrnek|porce|dkg)\b/gi, '');

  // Remove extraneous separators left after removals
  q = q.replace(/\s*[,;]+\s*$/, '');

  // Collapse whitespace
  q = q.replace(/\s+/g, ' ').trim();

  return q.slice(0, 80);
}

/**
 * Build an ordered list of search query candidates from most to least specific.
 * Used as a fallback chain when the primary query returns no relevant result.
 *
 * Returns: string[] ordered from most specific to least specific.
 */
export function buildMealSearchHints(mealName) {
  const base = normalizeMealQueryCs(mealName);
  if (!base) return [];

  const hints = new Set([base]);

  // "Kuřecí prsa na grilu s rýží a zeleninou"
  // → try "Kuřecí prsa na grilu" (before " s " connector)
  const beforeConnector = base.split(/\s+s\s+|\s+se\s+/)[0].trim();
  if (beforeConnector && beforeConnector !== base && beforeConnector.length >= 5) {
    hints.add(beforeConnector);
  }

  // Take the first 1-3 words as a last-resort fallback
  const words = base.split(/\s+/);
  if (words.length > 3) {
    const shortForm = words.slice(0, 3).join(' ');
    if (shortForm.length >= 5) hints.add(shortForm);
  }
  if (words.length > 1) {
    const firstWord = words[0];
    if (firstWord.length >= 4) hints.add(firstWord);
  }

  return [...hints].filter(Boolean);
}

/**
 * Compute a similarity score between a meal query and a Spoonacular recipe.
 * Returns a value in [0, 1].
 *
 * Used by mealEnrichment.js to decide whether a Spoonacular hit is trustworthy.
 */
export function scoreMealMatch(mealName, recipe) {
  if (!mealName || !recipe || typeof recipe !== 'object') return 0;

  const normalize = (s) =>
    removeDiacritics(String(s || ''))
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const inputNorm = normalize(normalizeMealQueryCs(mealName));
  const titleNorm = normalize(recipe.title || '');

  if (!inputNorm || !titleNorm) return 0;

  // Exact match
  if (inputNorm === titleNorm) return 1.0;

  // Word-overlap ratio (how many input words appear in the recipe title)
  const inputWords = inputNorm.split(' ').filter((w) => w.length > 2);
  const titleTokens = new Set(titleNorm.split(' '));

  const matched = inputWords.filter((w) => titleTokens.has(w)).length;
  const overlapRatio = inputWords.length > 0 ? matched / inputWords.length : 0;

  let score = overlapRatio * 0.70;

  // Bonus: title contains first significant word of input (main ingredient)
  const firstSignificant = inputWords[0] ?? '';
  if (firstSignificant && titleNorm.includes(firstSignificant)) score += 0.10;

  // Bonus: recipe has nutrition data (more specific result)
  if (recipe.nutrition?.nutrients?.length > 0) score += 0.10;

  // Bonus: recipe has image
  if (recipe.image) score += 0.05;

  // Penalty: if the recipe title looks completely unrelated (0 overlap)
  if (overlapRatio === 0) score = Math.min(score, 0.05);

  return Math.min(1.0, Math.round(score * 1000) / 1000);
}
