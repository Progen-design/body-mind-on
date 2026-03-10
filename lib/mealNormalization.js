/**
 * lib/mealNormalization.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Czech meal name normalization for external API queries.
 *
 * Purpose: improve Spoonacular / Pexels hit quality by cleaning noisy
 * AI-generated meal names before sending them as search queries.
 *
 * TODO (future): Add Czech → English translation layer for Spoonacular,
 * which has better English coverage. For now normalization only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Strip diacritics from a string.
 */
export function removeDiacritics(s) {
  if (!s || typeof s !== 'string') return '';
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
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
