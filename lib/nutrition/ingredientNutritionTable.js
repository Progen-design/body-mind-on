/**
 * Static per-100g nutrition for common START / catalog ingredients.
 * Synced from ingredients_nutrition (reference rows with name_cs).
 * Used for flex catch-up kcal accounting without a live DB round-trip.
 */

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @typedef {{ kcal: number, protein_g: number, carbs_g: number, fat_g: number }} MacroPer100 */

/** @type {Record<string, MacroPer100>} */
const BY_NORMALIZED = {
  'arasidove maslo': { kcal: 588, protein_g: 25, carbs_g: 20, fat_g: 50 },
  avokado: { kcal: 160, protein_g: 2, carbs_g: 8.5, fat_g: 15 },
  banan: { kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3 },
  'bila ryba': { kcal: 82, protein_g: 18, carbs_g: 0, fat_g: 0.7 },
  'bily jogurt': { kcal: 61, protein_g: 3.5, carbs_g: 4.7, fat_g: 3.3 },
  jogurt: { kcal: 61, protein_g: 3.5, carbs_g: 4.7, fat_g: 3.3 },
  brambory: { kcal: 77, protein_g: 2, carbs_g: 17, fat_g: 0.1 },
  brokolice: { kcal: 34, protein_g: 2.8, carbs_g: 7, fat_g: 0.4 },
  'celozrnny chleb': { kcal: 247, protein_g: 13, carbs_g: 41, fat_g: 3.4 },
  'celozrnne pecivo': { kcal: 247, protein_g: 13, carbs_g: 41, fat_g: 3.4 },
  'celozrnny toast': { kcal: 247, protein_g: 13, carbs_g: 41, fat_g: 3.4 },
  'cerstve ovoce': { kcal: 55, protein_g: 0.8, carbs_g: 13, fat_g: 0.3 },
  cesnek: { kcal: 149, protein_g: 6.4, carbs_g: 33, fat_g: 0.5 },
  cibule: { kcal: 40, protein_g: 1.1, carbs_g: 9.3, fat_g: 0.1 },
  cocka: { kcal: 352, protein_g: 25, carbs_g: 60, fat_g: 1.1 },
  cottage: { kcal: 98, protein_g: 11, carbs_g: 3.4, fat_g: 4.3 },
  cuketa: { kcal: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3 },
  fazole: { kcal: 90, protein_g: 6.5, carbs_g: 15, fat_g: 0.5 },
  'hovezi maso': { kcal: 187, protein_g: 21, carbs_g: 0, fat_g: 11 },
  'libove hovezi maso': { kcal: 187, protein_g: 21, carbs_g: 0, fat_g: 11 },
  jablko: { kcal: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2 },
  kefir: { kcal: 41, protein_g: 3.3, carbs_g: 4.5, fat_g: 1 },
  'kruti prsa': { kcal: 135, protein_g: 29, carbs_g: 0, fat_g: 1.7 },
  'kruti prso': { kcal: 135, protein_g: 29, carbs_g: 0, fat_g: 1.7 },
  'kureci prsa': { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  'kureci prso': { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  losos: { kcal: 208, protein_g: 20, carbs_g: 0, fat_g: 13 },
  maslo: { kcal: 717, protein_g: 0.9, carbs_g: 0.1, fat_g: 81 },
  med: { kcal: 304, protein_g: 0.3, carbs_g: 82, fat_g: 0 },
  mleko: { kcal: 47, protein_g: 3.4, carbs_g: 4.8, fat_g: 1.5 },
  mrkev: { kcal: 41, protein_g: 0.9, carbs_g: 9.6, fat_g: 0.2 },
  musli: { kcal: 380, protein_g: 10, carbs_g: 65, fat_g: 8 },
  okurka: { kcal: 15, protein_g: 0.7, carbs_g: 3.6, fat_g: 0.1 },
  olej: { kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100 },
  'olivovy olej': { kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100 },
  orechy: { kcal: 650, protein_g: 15, carbs_g: 14, fat_g: 60 },
  mandle: { kcal: 650, protein_g: 15, carbs_g: 14, fat_g: 60 },
  'ovesne vlocky': { kcal: 380, protein_g: 13, carbs_g: 60, fat_g: 7 },
  paprika: { kcal: 31, protein_g: 1, carbs_g: 6, fat_g: 0.3 },
  'proteinovy prasek': { kcal: 380, protein_g: 80, carbs_g: 8, fat_g: 4 },
  protein: { kcal: 380, protein_g: 80, carbs_g: 8, fat_g: 4 },
  quinoa: { kcal: 368, protein_g: 14, carbs_g: 64, fat_g: 6 },
  rajce: { kcal: 18, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2 },
  ryba: { kcal: 208, protein_g: 20, carbs_g: 0, fat_g: 13 },
  ryze: { kcal: 360, protein_g: 7, carbs_g: 79, fat_g: 0.7 },
  'ryze (bila)': { kcal: 360, protein_g: 7, carbs_g: 79, fat_g: 0.7 },
  'sladke brambory': { kcal: 86, protein_g: 1.6, carbs_g: 20, fat_g: 0.1 },
  sunka: { kcal: 145, protein_g: 18, carbs_g: 1.5, fat_g: 7 },
  syr: { kcal: 350, protein_g: 25, carbs_g: 1.5, fat_g: 27 },
  testoviny: { kcal: 350, protein_g: 12, carbs_g: 72, fat_g: 1.5 },
  'tunak (v konzerve)': { kcal: 116, protein_g: 26, carbs_g: 0, fat_g: 1 },
  tunak: { kcal: 116, protein_g: 26, carbs_g: 0, fat_g: 1 },
  tvaroh: { kcal: 98, protein_g: 12, carbs_g: 3.5, fat_g: 4 },
  vejce: { kcal: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11 },
  'veprova panenka': { kcal: 143, protein_g: 21, carbs_g: 0, fat_g: 6 },
  'libove maso (napr. veprove)': { kcal: 143, protein_g: 21, carbs_g: 0, fat_g: 6 },
  zelenina: { kcal: 35, protein_g: 2, carbs_g: 6, fat_g: 0.3 },
};

/** Prefer these when catching up kcal (staple flex foods). Lower = better. */
const CATCHUP_PRIORITY = [
  [/ryze/, 1],
  [/testovin|pasta/, 2],
  [/ovesn|vlock/, 3],
  [/quinoa|musli/, 4],
  [/kureci|kruti|hovezi|veprov|maso|losos|ryba|tunak/, 5],
  [/tvaroh|cottage|jogurt|kefir|mleko/, 6],
  [/protein/, 7],
  [/olej|maslo|arasid/, 8],
  [/orech|mandl|avokad/, 9],
  [/brambor|cocka|fazol/, 10],
  [/zelenin|brokol|salat|mrkev|okurk|rajc|paprik/, 20],
];

/**
 * @param {string|null|undefined} name
 * @returns {MacroPer100|null}
 */
export function lookupIngredientNutritionPer100g(name) {
  const n = norm(name);
  if (!n) return null;
  if (BY_NORMALIZED[n]) return BY_NORMALIZED[n];
  // Substring / alias match (longest key first)
  let best = null;
  let bestLen = 0;
  for (const [key, val] of Object.entries(BY_NORMALIZED)) {
    if (n.includes(key) || key.includes(n)) {
      if (key.length > bestLen) {
        best = val;
        bestLen = key.length;
      }
    }
  }
  return best;
}

/**
 * Catch-up priority (1 = best). Unknown flex → 15.
 * @param {string} name
 */
export function flexCatchUpPriority(name) {
  const n = norm(name);
  for (const [re, p] of CATCHUP_PRIORITY) {
    if (re.test(n)) return p;
  }
  return 15;
}

/**
 * Max extra grams for flex catch-up on one ingredient (from current amount).
 * @param {string} name
 * @param {number} currentAmount
 */
export function maxFlexCatchUpGrams(name, currentAmount) {
  const n = norm(name);
  const cur = Number(currentAmount) || 0;
  if (/olej|maslo|arasid/.test(n)) return Math.min(15, Math.max(5, Math.round(cur * 0.35)));
  if (/orech|mandl/.test(n)) return Math.min(30, Math.max(10, Math.round(cur * 0.4)));
  if (/ryze|testovin|ovesn|quinoa|musli|brambor|cocka/.test(n)) {
    return Math.min(80, Math.max(20, Math.round(cur * 0.55)));
  }
  if (/kureci|kruti|hovezi|veprov|maso|losos|ryba|tunak|sunka/.test(n)) {
    return Math.min(100, Math.max(25, Math.round(cur * 0.45)));
  }
  if (/tvaroh|cottage|jogurt|kefir|mleko|protein/.test(n)) {
    return Math.min(120, Math.max(30, Math.round(cur * 0.5)));
  }
  if (/zelenin|brokol|salat|mrkev|okurk|rajc|paprik|cibul/.test(n)) {
    return Math.min(80, Math.max(20, Math.round(cur * 0.5)));
  }
  return Math.min(60, Math.max(15, Math.round(cur * 0.4)));
}

/**
 * Macros for grams of a named ingredient.
 * @param {string} name
 * @param {number} grams
 */
export function nutritionFromGrams(name, grams) {
  const per = lookupIngredientNutritionPer100g(name);
  const g = Number(grams);
  if (!per || !Number.isFinite(g) || g <= 0) {
    return { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  }
  const f = g / 100;
  return {
    kcal: per.kcal * f,
    protein_g: per.protein_g * f,
    carbs_g: per.carbs_g * f,
    fat_g: per.fat_g * f,
  };
}
