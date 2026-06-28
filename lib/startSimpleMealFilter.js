/**
 * Tvrdý filtr jednoduchých jídel pro START / initial_plan.
 * Složitá jídla se vyřazují — ne jen penalizují skóre.
 */
import { ingredientLinesFromRow, scoreRecipeSimplicity, sanitizeIngredientLineForDisplay } from './recipeSimplicityScore.js';
import { scaleMealToTarget } from './nutrition/portionScaling.js';
import {
  buildSimpleStartLibraryMeal,
  findSimpleStartRecipeByTitle,
  hasSimpleStartRecipeTitle,
  resolveSimpleStartTitle,
} from './simpleStartRecipeLibrary.js';

export const ALLOWED_SIMPLE_START_CATALOG_SOURCES = Object.freeze([
  'simple_start_library',
  'simple_start_fallback',
]);

/** @typedef {'breakfast'|'lunch'|'dinner'|'snack'|string} PlanMealType */

const HARD_START_BLOCKS = [
  { re: /burrito/i, reason: 'burrito' },
  { re: /pomerančov[eá]?\s+kuře/i, reason: 'pomerancove_kure' },
  { re: /pomeranč/i, reason: 'pomerancove_kure' },
  { re: /kokosov[eá]?\s+kari/i, reason: 'kokosove_kari' },
  { re: /\bramen/i, reason: 'ramen' },
  { re: /frittata/i, reason: 'frittata' },
  { re: /lasagn/i, reason: 'lasagne' },
  { re: /pastitsio/i, reason: 'pastitsio' },
  { re: /krab/i, reason: 'krabi' },
  { re: /\bpesto\b/i, reason: 'pesto' },
  { re: /\bsalsa\b/i, reason: 'salsa' },
  { re: /kavi[aá]r/i, reason: 'kaviar' },
  { re: /fenykl/i, reason: 'fenykl' },
  { re: /baby\s+řep/i, reason: 'baby_repa' },
  { re: /vodn[ií]\s+zel[ií]/i, reason: 'vodni_zeli' },
  { re: /glazur/i, reason: 'glazura' },
  { re: /redukc/i, reason: 'redukce' },
  { re: /\bconfit\b/i, reason: 'confit' },
  { re: /\bchřest\b/i, reason: 'chrest' },
  { re: /\bquino/i, reason: 'quinoa' },
  { re: /mexick[aá]/i, reason: 'mexicka_misa' },
  { re: /^Jak udělat/i, reason: 'food_blog_title' },
  { re: /^Předkrmy:/i, reason: 'food_blog_title' },
  { re: /citronov[eá]\s+tr[aá]v/i, reason: 'fine_dining' },
  { re: /holandsk[aá]\s+om[aá]čk/i, reason: 'holandska_omacka' },
  { re: /marin[aá]d/i, reason: 'marinada' },
  { re: /demi[\s-]?glace/i, reason: 'demi_glace' },
  { re: /bechamel/i, reason: 'bechamel' },
  { re: /amaretti/i, reason: 'amaretti' },
  { re: /želatin/i, reason: 'zelatina' },
  { re: /marshmallow/i, reason: 'marshmallow' },
  { re: /sušenk|susenk|biscuit/i, reason: 'susenky' },
  { re: /cookie/i, reason: 'cookie' },
  { re: /\bsirup\b/i, reason: 'sirup' },
  { re: /karamel/i, reason: 'karamel' },
  { re: /čokol[aá]dov[aá]\s+polev|cokoladov[aá]\s+polev/i, reason: 'cokoladova_poleva' },
  { re: /candy/i, reason: 'candy' },
  { re: /bonbon/i, reason: 'bonbon' },
  { re: /šlehačk|slehack/i, reason: 'slehacka' },
  { re: /pudink/i, reason: 'pudink' },
  { re: /slanin[aou].*vejce|vejce.*slanin/i, reason: 'bacon_breakfast_complex' },
  { re: /\bslanin/i, reason: 'slanina' },
  { re: /\bkokos/i, reason: 'kokos' },
  { re: /\bkari\b/i, reason: 'kari' },
];

const IMPERIAL_UNIT_RE = /\b\d+(\.\d+)?\s*(libra|libry|lb|lbs|cups?|oz|ounces?|tbsp|tablespoons?|tsp|teaspoons?|hrn(k|ku|ky|ků)|hrnek|hrnky)\b/i;
const ABSURD_SALT_RE = /\b\d+\s*porc[eí]\s+sol|\bserving(s)?\s+of\s+salt\b|\b\d+\s*porc[eí]\s+(amaretti|pepře|soli)\b/i;
const ALIGNMENT_TOKEN_GROUPS = {
  pastryName: ['peciv', 'chleb', 'toast', 'rohlik', 'tortill'],
  pastryIngredient: ['peciv', 'chleb', 'toast', 'rohlik', 'tortill'],
  yogurtName: ['jogurt'],
  yogurtIngredient: ['jogurt'],
  fruitName: ['ovoce'],
  fruitIngredient: ['banan', 'jabl', 'jahod', 'boruv', 'malin', 'ovoc'],
};

const STRICT_BREAKFAST_BLOCKS = [
  { re: /\bsmetan/i, reason: 'breakfast_smetana' },
  { re: /\bf[ií]k/i, reason: 'breakfast_fiky' },
  { re: /\bdatl/i, reason: 'breakfast_datle' },
  { re: /\bmascarpone\b/i, reason: 'breakfast_mascarpone' },
  { re: /\bricotta\b/i, reason: 'breakfast_ricotta' },
  { re: /\bheavy\s+cream\b/i, reason: 'breakfast_heavy_cream' },
  { re: /\bcream\b/i, reason: 'breakfast_cream' },
  { re: /\bsyrup\b|\bmaple\b/i, reason: 'breakfast_syrup' },
  { re: /marshmallow|cookie|candy|bonbon|šlehačk|slehack/i, reason: 'breakfast_dessert_topping' },
  { re: /dezertn[ií]\s+topping|dessert\s+topping/i, reason: 'breakfast_dessert_topping' },
];
const OATMEAL_ALLOWED_RE = /(ovesn|vlock|mlek|vod|protein|banan|jabl|jahod|boruv|malin|skoric|med)/i;

const START_SAFE_FALLBACK_BY_TYPE = {
  breakfast: [
    {
      name_cs: 'Tvaroh s vločkami a banánem',
      kcal: 420,
      protein_g: 28,
      carbs_g: 52,
      fat_g: 10,
      shopping_ingredient_lines: ['tvaroh 200 g', 'ovesné vločky 50 g', 'banán 1 ks'],
    },
    {
      name_cs: 'Řecký jogurt s ovocem',
      kcal: 380,
      protein_g: 22,
      carbs_g: 45,
      fat_g: 12,
      shopping_ingredient_lines: ['řecký jogurt 200 g', 'banán nebo jablko 1 ks', 'mandle 15 g'],
    },
    {
      name_cs: 'Vejce s pečivem a zeleninou',
      kcal: 450,
      protein_g: 24,
      carbs_g: 38,
      fat_g: 22,
      shopping_ingredient_lines: ['vejce 3 ks', 'celozrné pečivo 2 plátky', 'okurka nebo rajče'],
    },
    {
      name_cs: 'Ovesná kaše',
      kcal: 400,
      protein_g: 14,
      carbs_g: 58,
      fat_g: 12,
      shopping_ingredient_lines: ['ovesné vločky 60 g', 'mléko 200 ml', 'banán 1 ks'],
    },
  ],
  snack: [
    {
      name_cs: 'Jogurt s ovocem',
      kcal: 220,
      protein_g: 14,
      carbs_g: 28,
      fat_g: 6,
      shopping_ingredient_lines: ['jogurt 180 g', 'banán nebo jablko 1 ks'],
    },
    {
      name_cs: 'Cottage s pečivem',
      kcal: 260,
      protein_g: 18,
      carbs_g: 24,
      fat_g: 10,
      shopping_ingredient_lines: ['cottage 150 g', 'celozrné pečivo 1 plátek'],
    },
    {
      name_cs: 'Proteinový nápoj a banán',
      kcal: 280,
      protein_g: 25,
      carbs_g: 32,
      fat_g: 4,
      shopping_ingredient_lines: ['proteinový nápoj 1 dávka', 'banán 1 ks'],
    },
    {
      name_cs: 'Sendvič se šunkou',
      kcal: 300,
      protein_g: 18,
      carbs_g: 30,
      fat_g: 12,
      shopping_ingredient_lines: ['celozrné pečivo 2 plátky', 'šunka 60 g', 'sýr 1 plátek', 'zelenina'],
    },
  ],
  lunch: [
    {
      name_cs: 'Rýže s vejcem a zeleninou',
      kcal: 540,
      protein_g: 24,
      carbs_g: 64,
      fat_g: 20,
      shopping_ingredient_lines: ['rýže 80 g', 'vejce 2 ks', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    },
    {
      name_cs: 'Kuře s rýží a zeleninou',
      kcal: 620,
      protein_g: 42,
      carbs_g: 65,
      fat_g: 16,
      shopping_ingredient_lines: ['kuřecí prsa 150 g', 'rýže 80 g', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    },
    {
      name_cs: 'Krůtí maso s bramborem',
      kcal: 580,
      protein_g: 40,
      carbs_g: 48,
      fat_g: 18,
      shopping_ingredient_lines: ['krůtí prsa 150 g', 'brambory 250 g', 'zelenina 150 g'],
    },
    {
      name_cs: 'Těstoviny s tuňákem',
      kcal: 600,
      protein_g: 38,
      carbs_g: 68,
      fat_g: 14,
      shopping_ingredient_lines: ['těstoviny 80 g', 'tuňák ve vlastní šťávě 1 konzerva', 'zelenina 100 g'],
    },
    {
      name_cs: 'Čočka s vejcem',
      kcal: 550,
      protein_g: 32,
      carbs_g: 58,
      fat_g: 16,
      shopping_ingredient_lines: ['čočka 80 g', 'vejce 2 ks', 'zelenina 150 g'],
    },
  ],
  dinner: [
    {
      name_cs: 'Omeleta se zeleninou',
      kcal: 480,
      protein_g: 32,
      carbs_g: 18,
      fat_g: 28,
      shopping_ingredient_lines: ['vejce 3 ks', 'zelenina 200 g', 'olivový olej 1 lžíce'],
    },
    {
      name_cs: 'Tuňákový salát s pečivem',
      kcal: 520,
      protein_g: 36,
      carbs_g: 42,
      fat_g: 18,
      shopping_ingredient_lines: ['tuňák ve vlastní šťávě 1 konzerva', 'zelenina 150 g', 'celozrné pečivo 2 plátky'],
    },
    {
      name_cs: 'Brambory s vejcem',
      kcal: 500,
      protein_g: 20,
      carbs_g: 52,
      fat_g: 22,
      shopping_ingredient_lines: ['brambory 300 g', 'vejce 2 ks', 'zelenina 100 g'],
    },
    {
      name_cs: 'Tvarohová miska',
      kcal: 420,
      protein_g: 34,
      carbs_g: 32,
      fat_g: 14,
      shopping_ingredient_lines: ['tvaroh 250 g', 'banán 1 ks', 'mandle 15 g'],
    },
  ],
};

function combinedText(row) {
  return extractFullCatalogValidationText(row);
}

/**
 * Celý text katalogového řádku pro START validaci (název, suroviny, postup, metadata).
 * @param {object|null|undefined} row
 * @returns {string}
 */
export function extractFullCatalogValidationText(row) {
  if (!row || typeof row !== 'object') return '';
  const parts = [
    row.name_cs,
    row.name_en,
    row.title,
    row.title_cs,
    ingredientLinesFromRow(row).join(' '),
    row.instructions_cs,
    row.instructions,
    row.source,
    row.spoonacular_url,
  ];
  return parts
    .flatMap((p) => {
      if (Array.isArray(p)) return p.map(String);
      return [String(p || '')];
    })
    .join(' ')
    .trim();
}

/**
 * @param {string|string[]} content
 * @param {PlanMealType} [mealType]
 * @returns {string|null}
 */
export function getIngredientComplexityReason(content, mealType = 'lunch') {
  const lines = Array.isArray(content)
    ? content.map((s) => String(s || '').trim()).filter(Boolean)
    : String(content || '').split(/\n/).map((s) => s.trim()).filter(Boolean);
  const src = lines.join(' ');
  if (!src.trim()) return null;

  const mt = String(mealType || 'lunch').toLowerCase();
  const lineCount = lines.length;

  if (mt === 'breakfast' || mt === 'snidane' || mt === 'snack' || mt === 'svacina') {
    if (lineCount > 8) return 'too_many_ingredients';
  } else if (lineCount > 12) {
    return 'too_many_ingredients';
  }

  if (IMPERIAL_UNIT_RE.test(src)) return 'imperial_units';
  if (ABSURD_SALT_RE.test(src)) return 'absurd_salt_units';

  const stepCount = (src.match(/\d+\.\s/g) || []).length + (src.match(/\n/g) || []).length;
  if (src.length > 900 || stepCount > 8) return 'food_blog_instructions';

  return null;
}

function isBreakfastMeal(mealType) {
  const mt = String(mealType || '').toLowerCase();
  return mt === 'breakfast' || mt === 'snidane';
}

/**
 * Strict START breakfast guard (no dessert-like breakfast recipes).
 * @param {object} row
 * @param {PlanMealType} mealType
 * @returns {string|null}
 */
export function getStrictBreakfastReason(row, mealType) {
  if (!isBreakfastMeal(mealType)) return null;
  const ingLines = ingredientLinesFromRow(row);
  const ingText = ingLines.join(' ');
  const checkText = `${String(row?.name_cs || '')} ${String(row?.name_en || '')} ${ingText} ${String(row?.instructions || '')}`;

  for (const rule of STRICT_BREAKFAST_BLOCKS) {
    if (rule.re.test(checkText)) return rule.reason;
  }

  // Brusinky in first two dominant ingredients are too dessert-like for START breakfast.
  const firstTwo = ingLines.slice(0, 2).join(' ');
  if (/brusink/i.test(firstTwo)) return 'breakfast_brusinky_main';

  const name = normalizeMatchText(row?.name_cs || row?.name_en || '');
  if (name.includes('ovesn') && name.includes('kas')) {
    for (const line of ingLines) {
      const normLine = normalizeMatchText(line);
      if (!OATMEAL_ALLOWED_RE.test(normLine)) {
        return 'breakfast_oatmeal_non_simple';
      }
    }
  }
  return null;
}

/**
 * @param {object|null|undefined} row
 * @param {PlanMealType} [mealType]
 * @param {object|null|undefined} [slotMeal]
 * @returns {string|null}
 */
export function getFullContentStartBlockReason(row, mealType = 'lunch', slotMeal = null) {
  if (!row || typeof row !== 'object') return 'missing_recipe';

  const mt = String(mealType || row.meal_type || slotMeal?.type || 'lunch').toLowerCase();
  const text = extractFullCatalogValidationText(row);
  if (!text) return 'empty_recipe';

  for (const { re, reason } of HARD_START_BLOCKS) {
    if (re.test(text)) return reason;
  }

  const nameCs = String(row.name_cs || '').trim();
  const nameEn = String(row.name_en || '').trim();
  if (nameCs.length > 52 || nameEn.length > 58) return 'long_food_blog_name';

  const ingLines = ingredientLinesFromRow(row);
  const instr = String(row.instructions_cs || row.instructions || '').trim();
  const ingComplex = getIngredientComplexityReason(ingLines, mt)
    || getIngredientComplexityReason(instr, mt);
  if (ingComplex) return ingComplex;
  const breakfastStrict = getStrictBreakfastReason(row, mt);
  if (breakfastStrict) return breakfastStrict;

  if ((mt === 'breakfast' || mt === 'snidane') && /\bkari\b/i.test(nameCs) && !/kuře s rýží/i.test(nameCs)) {
    return 'kari_breakfast';
  }
  if (/\bkari\b/i.test(nameCs) && /(kokos|ramen|thaj)/i.test(nameCs)) return 'kari_default';

  if (instr.length > 900) return 'food_blog_instructions';

  const agentName = slotMeal?.name_cs ? String(slotMeal.name_cs).trim() : '';
  if (agentName && nameEn && nameEn !== nameCs) {
    for (const { re, reason } of HARD_START_BLOCKS) {
      if (re.test(nameEn)) return `name_en_mismatch:${reason}`;
    }
    if (scoreRecipeSimplicity({ name_cs: nameEn, ingredients: row.ingredients }, mt) < 0) {
      return 'name_en_too_complex';
    }
  }

  if (scoreRecipeSimplicity(row, mt) < 0) return 'low_simplicity_score';

  if (slotMeal?.allowed_catalog_match_terms?.length) {
    const intent = getAgentIntentMismatchReason(row, slotMeal);
    if (intent) return intent;
  }

  if (slotMeal?.name_cs) {
    const align = getAgentIngredientAlignmentReason(row, slotMeal);
    if (align) return align;
  }

  return null;
}

/**
 * @param {object|null|undefined} recipe
 * @param {PlanMealType} [mealType]
 * @returns {string|null} důvod vyřazení nebo null = povoleno
 */
export function getHardStartBlockReason(recipe, mealType = 'lunch') {
  return getFullContentStartBlockReason(recipe, mealType, null);
}

/**
 * @param {object|null|undefined} recipe
 * @param {PlanMealType} [mealType]
 * @returns {boolean}
 */
export function isAllowedForStartPlan(recipe, mealType = 'lunch') {
  return getHardStartBlockReason(recipe, mealType) === null;
}

/** Alias pro spec. */
export function isHardSimpleStartMeal(recipe, mealType = 'lunch') {
  return isAllowedForStartPlan(recipe, mealType);
}

/**
 * @param {object[]} rows
 * @param {PlanMealType} mealType
 * @returns {{ kept: object[], excluded: { id: unknown, reason: string }[] }}
 */
export function filterCatalogCandidatesForStartPlan(rows, mealType) {
  const kept = [];
  const excluded = [];
  for (const row of rows || []) {
    const reason = getHardStartBlockReason(row, mealType);
    if (reason) excluded.push({ id: row?.id ?? null, reason });
    else kept.push(row);
  }
  return { kept, excluded };
}

const AGENT_NAME_FOOD_TERMS = [
  { key: 'vejce', aliases: ['vejce', 'vejec'] },
  { key: 'tvaroh', aliases: ['tvaroh'] },
  { key: 'jogurt', aliases: ['jogurt', 'jogurtu'] },
  { key: 'vločk', aliases: ['vločk', 'vločky'] },
  { key: 'brambor', aliases: ['brambor'] },
  { key: 'rýž', aliases: ['rýž', 'ryze', 'rýže'] },
  { key: 'kuře', aliases: ['kuře', 'kuřec', 'kuřecí'] },
  { key: 'krůt', aliases: ['krůt', 'krůtí'] },
  { key: 'tuňák', aliases: ['tuňák', 'tunak'] },
  { key: 'čočk', aliases: ['čočk', 'cock'] },
  { key: 'fazole', aliases: ['fazole', 'fazol'] },
  { key: 'cottage', aliases: ['cottage'] },
  { key: 'kefír', aliases: ['kefír', 'kefir'] },
  { key: 'ovoce', aliases: ['ovoce', 'ovoci', 'banán', 'jabl', 'malin', 'borův', 'jahod'] },
  { key: 'pečiv', aliases: ['pečiv', 'toast', 'chléb', 'chleba', 'rohlík', 'tortill'] },
  { key: 'těstovin', aliases: ['těstovin', 'testovin', 'špaget', 'tortill'] },
  { key: 'šunk', aliases: ['šunk', 'sunk'] },
  { key: 'sýr', aliases: ['sýr', 'syre', 'sýra'] },
  { key: 'zelenin', aliases: ['zelenin', 'mrkev', 'okur', 'rajč', 'paprik', 'brokol'] },
];

function requiredAgentTermsFromName(nameCs) {
  const norm = normalizeMatchText(nameCs);
  const hits = [];
  for (const term of AGENT_NAME_FOOD_TERMS) {
    if (term.aliases.some((a) => norm.includes(normalizeMatchText(a)))) hits.push(term.key);
  }
  return [...new Set(hits)];
}

function ingredientTextMatchesTerm(ingNorm, termKey) {
  const term = AGENT_NAME_FOOD_TERMS.find((t) => t.key === termKey);
  if (!term) return false;
  return term.aliases.some((a) => ingNorm.includes(normalizeMatchText(a)));
}

function includesAnyToken(textNorm, tokens) {
  return (tokens || []).some((t) => textNorm.includes(t));
}

function hasPastryIngredient(linesNorm) {
  return (linesNorm || []).some((line) => {
    if (!line) return false;
    if (line.includes('prasek do peciva') || line.includes('prasku do peciva')) return false;
    return /\bpeciv|\bchleb|\btoast|\brohlik|\btortill|\bbaget|\bhousk/i.test(line);
  });
}

/**
 * Název musí odpovídat kritickým surovinám (pečivo/jogurt/ovoce).
 * @param {string} name
 * @param {string} ingNorm
 * @returns {string|null}
 */
export function getCriticalNameIngredientAlignmentReason(name, ingNorm, ingredientLines = []) {
  const nameNorm = normalizeMatchText(name);
  if (!nameNorm || !ingNorm) return null;
  const linesNorm = ingredientLines.map((l) => normalizeMatchText(l));

  if (includesAnyToken(nameNorm, ALIGNMENT_TOKEN_GROUPS.pastryName) && !hasPastryIngredient(linesNorm)) {
    return 'missing_pastry_ingredient';
  }
  if (includesAnyToken(nameNorm, ALIGNMENT_TOKEN_GROUPS.yogurtName) && !includesAnyToken(ingNorm, ALIGNMENT_TOKEN_GROUPS.yogurtIngredient)) {
    return 'missing_yogurt_ingredient';
  }
  if (includesAnyToken(nameNorm, ALIGNMENT_TOKEN_GROUPS.fruitName) && !includesAnyToken(ingNorm, ALIGNMENT_TOKEN_GROUPS.fruitIngredient)) {
    return 'missing_fruit_ingredient';
  }
  return null;
}

/**
 * Agent název musí sedět i do surovin — ne jen do názvu katalogu.
 * @param {object} row
 * @param {object|null|undefined} slotMeal
 * @returns {string|null}
 */
export function getAgentIngredientAlignmentReason(row, slotMeal) {
  if (!slotMeal?.name_cs) return null;
  const ingLines = ingredientLinesFromRow(row);
  if (!ingLines.length) return null;
  const ingNorm = normalizeMatchText(ingLines.join(' '));
  const critical = getCriticalNameIngredientAlignmentReason(slotMeal.name_cs, ingNorm, ingLines);
  if (critical) return critical;
  const required = requiredAgentTermsFromName(slotMeal.name_cs);
  if (required.length < 2) return null;
  const matched = required.filter((term) => ingredientTextMatchesTerm(ingNorm, term));
  if (matched.length < required.length) return 'agent_ingredient_mismatch';
  return null;
}

function normalizeMatchText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Katalogový řádek odpovídá záměru agenta (allowed + forbidden termy ze slotu).
 * @param {object} row
 * @param {object|null|undefined} slotMeal
 * @returns {string|null} důvod vyřazení nebo null
 */
export function getAgentIntentMismatchReason(row, slotMeal) {
  if (!slotMeal?.allowed_catalog_match_terms?.length) return null;
  const text = normalizeMatchText(extractFullCatalogValidationText(row));
  const ingText = normalizeMatchText(ingredientLinesFromRow(row).join(' '));
  const forbidden = [...(slotMeal.forbidden_catalog_terms || [])];
  for (const term of forbidden) {
    const t = normalizeMatchText(term);
    if (t && (text.includes(t) || ingText.includes(t))) return `forbidden_term:${term}`;
  }
  for (const { re, reason } of HARD_START_BLOCKS) {
    if (re.test(ingText)) return `ingredient_blocked:${reason}`;
  }
  const allowed = slotMeal.allowed_catalog_match_terms || [];
  const matches = allowed.some((term) => {
    const t = normalizeMatchText(term);
    return t && text.includes(t);
  });
  if (!matches) return 'agent_intent_mismatch';
  return null;
}

/**
 * @param {object|null|undefined} recipe
 * @param {object|null|undefined} slotMeal
 * @returns {string|null}
 */
export function getSimpleStartBlockReason(recipe, slotMeal) {
  const mealType = slotMeal?.type || recipe?.meal_type || 'lunch';
  return getFullContentStartBlockReason(recipe, mealType, slotMeal);
}

/**
 * Jednoduchý postup pro fallback jídlo.
 * @param {string} displayName
 * @param {string[]} shoppingLines
 * @returns {string[]}
 */
export function buildSimpleFallbackInstructions(displayName, shoppingLines = [], mealType = 'lunch') {
  const library = findSimpleStartRecipeByTitle(displayName, mealType);
  if (library?.instructions?.length >= 4) {
    return [...library.instructions];
  }

  const name = String(displayName || '').toLowerCase();
  if (/rýž|ryz/i.test(name) && /vejce|vajec/i.test(name)) {
    return [
      'Uvař rýži podle návodu na obalu.',
      'Zeleninu nakrájej na menší kousky.',
      'Na pánvi rozehřej trochu oleje.',
      'Přidej zeleninu a krátce ji orestuj.',
      'Přidej vejce a míchej, dokud se nesrazí.',
      'Vmíchej rýži, dochuť solí a pepřem a podávej.',
    ];
  }
  if (/cottage/i.test(name)) {
    return [
      'Dej cottage do misky nebo na talíř.',
      'Nakrájej zeleninu na kousky.',
      'Přidej zeleninu ke cottage.',
      'Připrav si celozrnné pečivo, pokud ho máš v jídle.',
      'Lehce osol a opepři podle chuti.',
      'Podávej hned jako studené jídlo.',
    ];
  }
  if (/tvaroh|jogurt|kefír/i.test(name)) {
    return [
      'Dej tvaroh nebo jogurt do misky.',
      'Přidej ovoce nebo ořechy podle seznamu surovin.',
      'Lehce promíchej.',
      'Dochutí podle chuti.',
      'Podávej hned po smíchání.',
    ];
  }
  if (/sendvič|pečiv|šunka|sýr/i.test(name)) {
    return [
      'Připrav si plátky celozrnného pečiva.',
      'Na pečivo dej šunku, sýr nebo náplň podle seznamu.',
      'Zeleninu nakrájej na kousky.',
      'Slož sendvič a podávej se zeleninou.',
      'Lehce dochutí solí a pepřem.',
      'Sněz hned jako rychlé jídlo.',
    ];
  }
  if (/vejce|omeleta/i.test(name)) {
    return [
      'Vejce rozšlehej nebo uvař podle typu jídla.',
      'Zeleninu nakrájej na menší kousky.',
      'Na pánvi rozehřej kapku oleje.',
      'Připrav vejce s restovanou zeleninou.',
      'Lehce osol a opepři.',
      'Podávej teplé hned po dochucení.',
    ];
  }
  if (/těstovin/i.test(name) && /tuňák|tunak/i.test(name)) {
    return [
      'Uvař těstoviny podle návodu na obalu.',
      'Tuňáka sceď a rozmělni vidličkou.',
      'Zeleninu nakrájej na menší kousky.',
      'Smíchej těstoviny s tuňákem a zeleninou.',
      'Lehce osol a opepři.',
      'Podávej hned, ideálně teplé.',
    ];
  }
  if (/těstovin/i.test(name) && /kuře|kur/i.test(name)) {
    return [
      'Uvař těstoviny podle návodu na obalu.',
      'Kuřecí prsa nakrájej na menší kousky.',
      'Osol, opepři a opeč na pánvi s trochou oleje.',
      'Přidej zeleninu a krátce prohřej.',
      'Smíchej s uvařenými těstovinami.',
      'Podávej teplé.',
    ];
  }
  if (/rýž|těstovin|brambor|čočk|fazole/i.test(name)) {
    return [
      'Uvař přílohu podle návodu na obalu.',
      'Připrav bílkovinu podle seznamu surovin.',
      'Zeleninu nakrájej a krátce orestuj nebo přidej syrovou.',
      'Vše smíchej na talíři.',
      'Dochuť solí a pepřem.',
      'Podávej teplé hned po dochucení.',
    ];
  }
  if (/kuře|krůt|tuňák/i.test(name)) {
    return [
      'Maso nakrájej na menší kousky.',
      'Osol a opepři podle chuti.',
      'Opeč nebo uvař maso na pánvi.',
      'Připrav přílohu nebo zeleninu podle seznamu.',
      'Vše dej na talíř a dochutí.',
      'Podávej teplé hned po přípravě.',
    ];
  }
  if (shoppingLines.length <= 3) {
    return [
      'Připrav suroviny podle seznamu.',
      'Suroviny nakrájej, pokud je to potřeba.',
      'Slož jídlo na talíř nebo do misky.',
      'Lehce dochutí solí a pepřem.',
      'Podávej hned po přípravě.',
    ];
  }
  return [
    'Připrav suroviny podle seznamu.',
    'Suroviny nakrájej a připrav podle typu jídla.',
    'Uvař nebo poskládej jídlo bez složitých omáček.',
    'Dochuť solí a pepřem podle chuti.',
    'Podávej hned po dochucení.',
  ];
}

/**
 * Najde nejbližší START fallback šablonu podle názvu a typu jídla.
 * @param {string} displayName
 * @param {PlanMealType} mealType
 * @returns {object|null}
 */
export function findStartFallbackTemplate(displayName, mealType = 'lunch') {
  const mt = String(mealType || 'lunch').toLowerCase();
  const templates = START_SAFE_FALLBACK_BY_TYPE[mt] || START_SAFE_FALLBACK_BY_TYPE.lunch;
  const norm = normalizeMatchText(displayName);
  const hit = templates.find((tpl) => normalizeMatchText(tpl.name_cs) === norm);
  if (hit) return hit;
  return templates.find((tpl) => {
    const t = normalizeMatchText(tpl.name_cs);
    return norm.includes(t) || t.includes(norm);
  }) || templates[0] || null;
}

/**
 * @param {object|null|undefined} recipe
 * @param {object|null|undefined} slotMeal
 * @returns {boolean}
 */
export function isAllowedForSimpleStartPlan(recipe, slotMeal) {
  return getSimpleStartBlockReason(recipe, slotMeal) === null;
}

/**
 * @param {object[]} rows
 * @param {object} slotMeal
 * @returns {{ kept: object[], excluded: { id: unknown, reason: string }[] }}
 */
export function filterCatalogCandidatesForAgentSlot(rows, slotMeal) {
  const kept = [];
  const excluded = [];
  for (const row of rows || []) {
    const reason = getSimpleStartBlockReason(row, slotMeal);
    if (reason) excluded.push({ id: row?.id ?? null, reason });
    else kept.push(row);
  }
  return { kept, excluded };
}

/**
 * @param {object} slotMeal
 * @param {number} slotTarget
 * @param {number} [seed]
 * @returns {object}
 */
/**
 * START plán: vždy lokální knihovna nebo fallback — bez katalogu/API.
 * @param {object} slotMeal
 * @param {number} slotTarget
 * @param {number} [slotSalt]
 * @returns {{ row: null, meal: object }}
 */
export function resolveSimpleStartLocalSlot(slotMeal, slotTarget, slotSalt = 0) {
  const mealType = slotMeal?.type || 'lunch';
  const resolvedTitle = resolveSimpleStartTitle(slotMeal?.name_cs);
  const libraryMeal = buildSimpleStartLibraryMeal(resolvedTitle, mealType, {
    planner_source: slotMeal?.planner_source || 'simple_meal_planner_agent',
  });
  if (libraryMeal) {
    const scaled = scaleMealToTarget(
      {
        kcal: libraryMeal.kcal,
        protein_g: libraryMeal.protein_g,
        carbs_g: libraryMeal.carbs_g,
        fat_g: libraryMeal.fat_g,
      },
      slotTarget
    );
    const portionMultiplier = scaled.portion_multiplier ?? 1;
    return {
      row: null,
      meal: {
        ...libraryMeal,
        name_cs: libraryMeal.display_name_cs,
        kcal: scaled.kcal,
        protein_g: scaled.protein_g,
        carbs_g: scaled.carbs_g,
        fat_g: scaled.fat_g,
        portion_multiplier: portionMultiplier,
        recipe: {
          ...libraryMeal.recipe,
          calories: scaled.kcal,
          protein_g: scaled.protein_g,
          carbs_g: scaled.carbs_g,
          fat_g: scaled.fat_g,
          portion_multiplier: portionMultiplier,
        },
      },
    };
  }
  return {
    row: null,
    meal: buildStartSafeFallbackMeal(
      { ...slotMeal, name_cs: resolvedTitle || slotMeal?.name_cs },
      slotTarget,
      slotSalt
    ),
  };
}

export function isAllowedSimpleStartCatalogSource(value) {
  return ALLOWED_SIMPLE_START_CATALOG_SOURCES.includes(String(value || '').trim());
}

export function buildStartSafeFallbackMeal(slotMeal, slotTarget, seed = 0) {
  const slotMealType = slotMeal?.type || 'lunch';
  const resolvedTitle = resolveSimpleStartTitle(slotMeal?.name_cs);
  if (hasSimpleStartRecipeTitle(resolvedTitle, slotMealType)) {
    const libraryMeal = buildSimpleStartLibraryMeal(resolvedTitle, slotMealType, {
      planner_source: slotMeal?.planner_source || 'simple_meal_planner_agent',
    });
    if (libraryMeal) {
      const scaled = scaleMealToTarget(
        {
          kcal: libraryMeal.kcal,
          protein_g: libraryMeal.protein_g,
          carbs_g: libraryMeal.carbs_g,
          fat_g: libraryMeal.fat_g,
        },
        slotTarget
      );
      const portionMultiplier = scaled.portion_multiplier ?? 1;
      return {
        ...libraryMeal,
        kcal: scaled.kcal,
        protein_g: scaled.protein_g,
        carbs_g: scaled.carbs_g,
        fat_g: scaled.fat_g,
        portion_multiplier: portionMultiplier,
        recipe: {
          ...libraryMeal.recipe,
          calories: scaled.kcal,
          protein_g: scaled.protein_g,
          carbs_g: scaled.carbs_g,
          fat_g: scaled.fat_g,
          portion_multiplier: portionMultiplier,
        },
      };
    }
  }
  const mealType = slotMeal?.type || 'lunch';
  const agentTpl = slotMeal?.fallback_meal_template;
  let tpl;
  if (agentTpl?.name_cs && agentTpl?.kcal) {
    tpl = agentTpl;
  } else {
    const templates = START_SAFE_FALLBACK_BY_TYPE[mealType] || START_SAFE_FALLBACK_BY_TYPE.lunch;
    const idx = Math.abs(Number(seed) || 0) % templates.length;
    tpl = templates[idx];
  }

  const scaled = scaleMealToTarget(
    {
      kcal: tpl.kcal,
      protein_g: tpl.protein_g,
      carbs_g: tpl.carbs_g,
      fat_g: tpl.fat_g,
    },
    slotTarget
  );

  const display_name_cs = slotMeal?.name_cs || tpl.name_cs;
  const shopping_ingredient_lines = (tpl.shopping_ingredient_lines || []).map(sanitizeIngredientLineForDisplay);
  const simple_instructions_cs = buildSimpleFallbackInstructions(display_name_cs, shopping_ingredient_lines, mealType);
  const fallbackSource = slotMeal?.planner_source === 'simple_meal_planner_agent'
    ? 'simple_start_fallback'
    : 'start_safe_fallback';

  return {
    type: mealType,
    name_cs: display_name_cs,
    ai_name: null,
    display_name_cs,
    display_name: display_name_cs,
    planner_suggestion_cs: slotMeal?.name_cs && slotMeal.name_cs !== display_name_cs ? slotMeal.name_cs : null,
    recipe_verified: false,
    kcal: scaled.kcal,
    protein_g: scaled.protein_g,
    carbs_g: scaled.carbs_g,
    fat_g: scaled.fat_g,
    portion_multiplier: scaled.portion_multiplier ?? 1,
    recipe_id: null,
    recipe: {
      id: null,
      title: display_name_cs,
      title_cs: display_name_cs,
      image: null,
      source_url: null,
      sourceUrl: null,
      ready_in_minutes: 15,
      calories: scaled.kcal,
      protein_g: scaled.protein_g,
      carbs_g: scaled.carbs_g,
      fat_g: scaled.fat_g,
      source: fallbackSource,
      portion_multiplier: scaled.portion_multiplier ?? 1,
    },
    image_url: null,
    image_trust_level: 'none',
    shopping_ingredient_lines,
    simple_instructions_cs,
    catalog_id: null,
    catalog_source: fallbackSource,
    planner_source: slotMeal?.planner_source || null,
  };
}

/**
 * Bezpečný log důvodu odmítnutí katalogu (bez PII).
 * @param {string} event
 * @param {object} payload
 */
export function logCatalogSimpleStart(event, payload = {}) {
  console.log(`[catalog-simple-start] ${event}`, payload);
}

export default isAllowedForStartPlan;
