/**
 * Tvrdý filtr jednoduchých jídel pro START / initial_plan.
 * Složitá jídla se vyřazují — ne jen penalizují skóre.
 */
import { ingredientLinesFromRow, scoreRecipeSimplicity, sanitizeIngredientLineForDisplay } from './recipeSimplicityScore.js';
import { scaleMealToTarget } from './nutrition/portionScaling.js';

/** @typedef {'breakfast'|'lunch'|'dinner'|'snack'|string} PlanMealType */

const HARD_START_BLOCKS = [
  { re: /burrito/i, reason: 'burrito' },
  { re: /pomerančov[eá]?\s+kuře/i, reason: 'pomerancove_kure' },
  { re: /pomeranč/i, reason: 'pomerancove_kure' },
  { re: /kokosov[eá]?\s+kari/i, reason: 'kokosove_kari' },
  { re: /\bramen/i, reason: 'ramen' },
  { re: /frittata/i, reason: 'frittata' },
  { re: /lasagn/i, reason: 'lasagne' },
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
  { re: /\bquinoa\b/i, reason: 'quinoa' },
  { re: /mexick[aá]/i, reason: 'mexicka_misa' },
  { re: /^Jak udělat/i, reason: 'food_blog_title' },
  { re: /^Předkrmy:/i, reason: 'food_blog_title' },
  { re: /citronov[eá]\s+tr[aá]v/i, reason: 'fine_dining' },
  { re: /slanin[aou].*vejce|vejce.*slanin/i, reason: 'bacon_breakfast_complex' },
];

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
  const name = String(row?.name_cs || row?.name_en || '').trim();
  const ing = ingredientLinesFromRow(row).join(' ');
  const instr = String(row?.instructions || row?.instructions_cs || '').trim();
  return `${name} ${ing} ${instr}`.trim();
}

/**
 * @param {object|null|undefined} recipe
 * @param {PlanMealType} [mealType]
 * @returns {string|null} důvod vyřazení nebo null = povoleno
 */
export function getHardStartBlockReason(recipe, mealType = 'lunch') {
  if (!recipe || typeof recipe !== 'object') return 'missing_recipe';
  const text = combinedText(recipe);
  if (!text) return 'empty_recipe';

  for (const { re, reason } of HARD_START_BLOCKS) {
    if (re.test(text)) return reason;
  }

  const name = String(recipe.name_cs || recipe.name_en || '').trim();
  if (name.length > 52) return 'long_food_blog_name';

  const mt = String(mealType || recipe.meal_type || 'lunch').toLowerCase();
  if ((mt === 'breakfast' || mt === 'snidane') && /\bkari\b/i.test(name) && !/kuře s rýží/i.test(name)) {
    return 'kari_breakfast';
  }
  if (/\bkari\b/i.test(name) && /(kokos|ramen|thaj)/i.test(name)) return 'kari_default';

  if (scoreRecipeSimplicity(recipe, mealType) < 0) return 'low_simplicity_score';

  return null;
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

/**
 * @param {object} slotMeal
 * @param {number} slotTarget
 * @param {number} [seed]
 * @returns {object}
 */
export function buildStartSafeFallbackMeal(slotMeal, slotTarget, seed = 0) {
  const mealType = slotMeal?.type || 'lunch';
  const templates = START_SAFE_FALLBACK_BY_TYPE[mealType] || START_SAFE_FALLBACK_BY_TYPE.lunch;
  const idx = Math.abs(Number(seed) || 0) % templates.length;
  const tpl = templates[idx];

  const scaled = scaleMealToTarget(
    {
      kcal: tpl.kcal,
      protein_g: tpl.protein_g,
      carbs_g: tpl.carbs_g,
      fat_g: tpl.fat_g,
    },
    slotTarget
  );

  const display_name_cs = tpl.name_cs;
  const shopping_ingredient_lines = tpl.shopping_ingredient_lines.map(sanitizeIngredientLineForDisplay);

  return {
    type: mealType,
    name_cs: display_name_cs,
    ai_name: null,
    display_name_cs,
    display_name: display_name_cs,
    planner_suggestion_cs: null,
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
      source: 'start_safe_fallback',
      portion_multiplier: scaled.portion_multiplier ?? 1,
    },
    image_url: null,
    image_trust_level: 'none',
    shopping_ingredient_lines,
    catalog_id: null,
    catalog_source: 'start_safe_fallback',
  };
}

export default isAllowedForStartPlan;
