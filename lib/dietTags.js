/**
 * Jednotný formát diet_tags pro recipes_catalog.
 *
 * Spoonacular vrací mezerový zápis ("gluten free", "lacto ovo vegetarian"),
 * katalog i filtr pracují s podtržítkovým. Tenhle modul je jediné místo, kde
 * je ta mapa — importér i čtecí filtr sahají sem. Migrace
 * 20260730100000_normalize_diet_tags.sql obsahuje tutéž tabulku v SQL; když
 * se mění jedna, musí se změnit i druhá.
 */

/** @type {Readonly<Record<string, string>>} */
export const DIET_TAG_ALIASES = Object.freeze({
  'gluten free': 'gluten_free',
  'lacto ovo vegetarian': 'vegetarian',
  'dairy free': 'dairy_free',
  'fodmap friendly': 'low_fodmap',
  'whole 30': 'whole30',
  'low carb': 'low_carb',
});

/**
 * Implikace mezi tagy: veganský recept vyhoví i požadavku na vegetariánský.
 * Opačně to neplatí — vegetariánské jídlo může obsahovat mléko nebo vejce.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const DIET_TAG_IMPLIES = Object.freeze({
  vegan: Object.freeze(['vegetarian']),
});

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeDietTag(raw) {
  const t = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return DIET_TAG_ALIASES[t] ?? t;
}

/**
 * Normalizuje a deduplikuje seznam tagů.
 *
 * @param {unknown} list
 * @returns {string[]}
 */
export function normalizeDietTags(list) {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const item of list) {
    const t = normalizeDietTag(item);
    if (t) out.add(t);
  }
  return [...out];
}

/**
 * Splňuje recept požadovaný tag? Bere v úvahu implikace z DIET_TAG_IMPLIES.
 *
 * @param {string[]} recipeTags už normalizované tagy receptu
 * @param {string} requiredTag už normalizovaný požadavek
 * @returns {boolean}
 */
export function dietTagSatisfied(recipeTags, requiredTag) {
  if (recipeTags.includes(requiredTag)) return true;
  return recipeTags.some((t) => (DIET_TAG_IMPLIES[t] ?? []).includes(requiredTag));
}
