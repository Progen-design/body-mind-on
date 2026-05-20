/**
 * Omezení živých HTTP volání Spoonacular (complexSearch, recipe information).
 *
 * Výchozí stav (bez env): plan-only ZAPNUTO všude — placené volání jen s `allowLiveSpoonacular: true`.
 * V produkci to nastavuje `taskExecutors` pouze pro `trainer` / `initial_plan` (registrace).
 *
 * Env:
 * - SPOONACULAR_PLAN_GENERATION_ONLY=false — vypne bránu (všechna stará volání)
 * - SPOONACULAR_PLAN_GENERATION_ONLY=true  — vynutí bránu i lokálně / na preview
 * - SPOONACULAR_COMPRESS_REGISTRATION=false — při initial_plan bez úsporného režimu (více API volání)
 */

/**
 * @returns {boolean} true = živá volání jen tam, kde je explicitně allowLiveSpoonacular
 */
export function isSpoonacularPlanGenerationOnlyMode() {
  const v = process.env.SPOONACULAR_PLAN_GENERATION_ONLY;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  return true;
}

/**
 * Při registraci (initial_plan) minimalizovat počet complexSearch / information.
 * @returns {boolean}
 */
export function isSpoonacularRegistrationCompressEnabled() {
  const v = process.env.SPOONACULAR_COMPRESS_REGISTRATION;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}

/**
 * Smí tento request poslat placené Spoonacular HTTP?
 * @param {boolean} allowLiveSpoonacular – musí být true u orchestrátoru plánu (initial_plan)
 */
export function spoonacularLiveOutboundEnabled(allowLiveSpoonacular) {
  if (!isSpoonacularPlanGenerationOnlyMode()) return true;
  return allowLiveSpoonacular === true;
}
