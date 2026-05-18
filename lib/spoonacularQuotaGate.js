/**
 * Omezení živých HTTP volání Spoonacular (complexSearch, recipe information).
 *
 * Režim „plan-only“ zapnutý mimo jiné na Vercel production (viz `isSpoonacularPlanGenerationOnlyMode`).
 * V něm se placená volání provedou jen když `searchMealMetadata` / `callSpoonacular` dostanou
 * `allowLiveSpoonacular: true` — v produkci to nastavuje jen `resolveMeals` při úkolu
 * `initial_plan` (registrace / první plán).
 *
 * Vynutit přísný režim i lokálně / na preview: SPOONACULAR_PLAN_GENERATION_ONLY=true
 * Vypnout ochranu (všechna volání jako dřív): SPOONACULAR_PLAN_GENERATION_ONLY=false
 */

/**
 * @returns {boolean} true = živá volání jen tam, kde je explicitně allowLiveSpoonacular
 */
export function isSpoonacularPlanGenerationOnlyMode() {
  const v = process.env.SPOONACULAR_PLAN_GENERATION_ONLY;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  return process.env.VERCEL_ENV === 'production';
}

/**
 * Smí tento request poslat placené Spoonacular HTTP?
 * @param {boolean} allowLiveSpoonacular – musí být true u orchestrátoru plánu
 */
export function spoonacularLiveOutboundEnabled(allowLiveSpoonacular) {
  if (!isSpoonacularPlanGenerationOnlyMode()) return true;
  return allowLiveSpoonacular === true;
}
