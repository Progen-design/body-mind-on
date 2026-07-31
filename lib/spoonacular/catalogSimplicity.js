/**
 * Recipe simplicity rules (steps, ready time, no-cook snacks) — pure, no Supabase.
 */
import { extractInstructionStepsEn } from './instructionSteps.js';
import { getMealSimplicityRules } from './catalogImportGate.js';

/** Reject recipes with genuinely heavy prep (overnight / specialized gear). */
export const COMPLEX_PREP_REGEX = Object.freeze([
  /marinate overnight/i,
  /chill overnight/i,
  /overnight in the (fridge|refrigerator)/i,
  /double boiler/i,
  /deep[- ]?fry/i,
  /pressure cooker/i,
  /candy thermometer/i,
  /proof for \d+/i,
  /rise for \d+\s*(hour|hours)/i,
]);

/** Cooking verbs/patterns — rejected for svacina (no-cook snacks). */
export const COOKING_REGEX = Object.freeze([
  /\bbake\b/i,
  /\bboil\b/i,
  /\bsimmer\b/i,
  /\bfry\b/i,
  /\broast\b/i,
  /\bgrill\b/i,
  /\bcook\b/i,
  /\boven\b/i,
  /\bstovetop\b/i,
  /\bstove top\b/i,
  /\bmicro?wave\b/i,
  /\bpreheat\b/i,
  /\bsaut[eé]\b/i,
  /\bbroil\b/i,
  /\bsteam\b/i,
  /\bpoach\b/i,
  /\bbraise\b/i,
  /\bskillet\b/i,
  /\bpan[- ]?fry/i,
  /\bheat (the|a|over|on|in)\b/i,
]);

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} catalogMealType
 * @returns {{ pass: boolean, reason: string|null }}
 */
export function evaluateRecipeSimplicity(recipe, catalogMealType) {
  const rules = getMealSimplicityRules(catalogMealType);
  const steps = extractInstructionStepsEn(recipe.analyzedInstructions);

  // Čas je TVRDÁ podmínka a kontroluje se první, bez ohledu na to, jestli známe kroky.
  // Neznámý čas neprojde: nemáme jak ověřit, že je recept rychlý, a mlčky předpokládat,
  // že ano, je horší než ho nepustit. complexSearch voláme s addRecipeInformation=true,
  // takže readyInMinutes v odpovědi být má — když se `ready_time_unknown` začne
  // objevovat ve skipped_filter_reasons, změnil se tvar odpovědi.
  const ready = Number(recipe.readyInMinutes);
  if (!Number.isFinite(ready) || ready <= 0) {
    return { pass: false, reason: 'ready_time_unknown' };
  }
  if (ready > rules.maxReadyTime) {
    return { pass: false, reason: 'ready_time_exceeded' };
  }

  // complexSearch list results often omit analyzedInstructions — only enforce step rules when present.
  // Zpřísnit i tohle na tvrdý gate až samostatně, aby šel dopad změřit odděleně od času.
  if (steps.length === 0) {
    return { pass: true, reason: null };
  }
  if (steps.length > rules.maxSteps) {
    return { pass: false, reason: 'too_many_steps' };
  }

  const stepsText = steps.join('\n');
  for (const re of COMPLEX_PREP_REGEX) {
    if (re.test(stepsText)) return { pass: false, reason: 'complex_preparation' };
  }

  // noCooking is advisory only — active svacina corpus includes cooked snacks.
  if (rules.noCooking) {
    for (const re of COOKING_REGEX) {
      if (re.test(stepsText)) {
        return { pass: true, reason: null, warning: 'requires_cooking' };
      }
    }
  }

  return { pass: true, reason: null };
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} catalogMealType
 * @returns {boolean}
 */
export function recipePassesSimplicityFilter(recipe, catalogMealType) {
  return evaluateRecipeSimplicity(recipe, catalogMealType).pass;
}
