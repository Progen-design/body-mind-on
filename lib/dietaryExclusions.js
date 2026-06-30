/**
 * Parsování a filtrování vyloučených potravin pro START plán.
 */

const CHEESE_HARD_TERMS = ['syr', 'eidam', 'gouda', 'mozzarella', 'parmazan', 'cottage', 'ricotta', 'mascarpone'];
const DAIRY_TERMS = [
  ...CHEESE_HARD_TERMS,
  'tvaroh',
  'jogurt',
  'mleko',
  'mlec',
  'kefír',
  'kefir',
  'smetan',
  'slehack',
  'bryndz',
];

function normalizeFoodText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitFoodTerms(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\n]+/)
    .map((part) => normalizeFoodText(part))
    .filter(Boolean);
}

function termMatchesNormalized(text, term) {
  if (!text || !term) return false;
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(text) || text.includes(term);
}

function rawTermsIncludeCheese(rawTerms) {
  return rawTerms.some((t) =>
    t.includes('syr')
    || t.includes('eidam')
    || t.includes('gouda')
    || t.includes('mozzarella')
    || t.includes('parmazan')
  );
}

function rawTermsIncludeDairy(rawTerms) {
  return rawTerms.some((t) =>
    t.includes('mlec')
    || t.includes('laktoz')
    || t.includes('tvaroh')
    || t.includes('jogurt')
    || t.includes('kefír')
    || t.includes('kefir')
    || t.includes('syr')
  );
}

/**
 * @param {object|null|undefined} bodyMetrics
 * @returns {{ rawTerms: string[], cheeseExcluded: boolean, dairyExcluded: boolean, blockedTerms: string[] }}
 */
export function parseDietaryExclusions(bodyMetrics) {
  const combined = [
    bodyMetrics?.foods_to_avoid,
    bodyMetrics?.dietary_restrictions,
    bodyMetrics?.allergies,
  ]
    .filter(Boolean)
    .join(', ');

  const rawTerms = splitFoodTerms(combined);
  const cheeseExcluded = rawTermsIncludeCheese(rawTerms);
  const dairyExcluded = rawTermsIncludeDairy(rawTerms) || String(bodyMetrics?.diet_type || '').toLowerCase() === 'lactose_free';

  const blockedTerms = [];
  if (dairyExcluded) {
    blockedTerms.push(...DAIRY_TERMS);
  } else if (cheeseExcluded) {
    blockedTerms.push(...CHEESE_HARD_TERMS.filter((t) => t !== 'cottage' && t !== 'ricotta' && t !== 'mascarpone'));
    blockedTerms.push('syr');
  }

  for (const term of rawTerms) {
    if (!blockedTerms.includes(term)) blockedTerms.push(term);
  }

  return {
    rawTerms,
    cheeseExcluded,
    dairyExcluded,
    blockedTerms: [...new Set(blockedTerms)],
  };
}

/**
 * @param {string} text
 * @param {{ blockedTerms?: string[], cheeseExcluded?: boolean, dairyExcluded?: boolean }} exclusions
 */
export function textContainsExcludedFood(text, exclusions) {
  const norm = normalizeFoodText(text);
  if (!norm) return false;

  const blocked = exclusions?.blockedTerms || [];
  for (const term of blocked) {
    if (termMatchesNormalized(norm, term)) return true;
  }

  if (exclusions?.dairyExcluded) {
    for (const term of DAIRY_TERMS) {
      if (termMatchesNormalized(norm, term)) return true;
    }
  } else if (exclusions?.cheeseExcluded) {
    for (const term of CHEESE_HARD_TERMS) {
      if (term === 'cottage' || term === 'ricotta' || term === 'mascarpone') continue;
      if (termMatchesNormalized(norm, term)) return true;
    }
    if (norm.includes('syr')) return true;
  }

  return false;
}

/**
 * @param {object|null|undefined} mealLike
 * @param {ReturnType<typeof parseDietaryExclusions>} exclusions
 */
export function mealContainsExcludedFood(mealLike, exclusions) {
  if (!mealLike || !exclusions) return false;
  const parts = [
    mealLike.name_cs,
    mealLike.display_name_cs,
    mealLike.display_name,
    mealLike.title,
    mealLike.ai_name,
  ];
  for (const part of parts) {
    if (textContainsExcludedFood(part, exclusions)) return true;
  }

  const ingredientSources = [
    mealLike.shopping_ingredient_lines,
    mealLike.ingredients,
    mealLike.recipe?.ingredients,
    mealLike.fallback_meal_template?.shopping_ingredient_lines,
  ];
  for (const source of ingredientSources) {
    if (!Array.isArray(source)) continue;
    for (const line of source) {
      const text = typeof line === 'string' ? line : line?.name || line?.original || '';
      if (textContainsExcludedFood(text, exclusions)) return true;
    }
  }

  return false;
}

/**
 * @param {object|null|undefined} template
 * @param {ReturnType<typeof parseDietaryExclusions>} exclusions
 */
export function isTemplateAllowedForExclusions(template, exclusions) {
  if (!template) return false;
  return !mealContainsExcludedFood(template, exclusions)
    && !mealContainsExcludedFood(template.fallback_meal_template, exclusions);
}

/**
 * Bezpečná náhrada za jídlo se sýrem.
 * @param {string} mealType
 */
export function cheeseFreeAlternativeName(mealType) {
  return cheeseFreeAlternativeNames(mealType)[0];
}

/**
 * @param {string} mealType
 * @returns {string[]}
 */
export function cheeseFreeAlternativeNames(mealType) {
  const mt = String(mealType || 'lunch').toLowerCase();
  if (mt === 'breakfast') {
    return ['Vejce s pečivem a zeleninou', 'Ovesná kaše s proteinem', 'Jogurt s ovocem', 'Cottage s pečivem'];
  }
  if (mt === 'snack') {
    return ['Sendvič se šunkou', 'Jogurt s ovocem', 'Vejce natvrdo se zeleninou', 'Kefír a pečivo'];
  }
  if (mt === 'dinner') {
    return ['Kuře se zeleninou', 'Brambory s vejcem', 'Těstoviny s kuřetem', 'Omeleta se zeleninou'];
  }
  return ['Kuře s rýží a zeleninou', 'Rýže s vejcem a zeleninou', 'Těstoviny s tuňákem', 'Brambory s vejcem'];
}

export default parseDietaryExclusions;
