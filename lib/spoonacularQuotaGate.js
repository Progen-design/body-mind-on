/**
 * Spoonacular – placené HTTP jen při registraci (START formulář → body-metrics).
 *
 * POZASTAVENO všude jinde (profil, cron, retry, náhrada jídla, recept v modalu, …).
 * Zapnutí jen když ai_tasks.payload obsahuje spoonacular_registration_only: true
 * (nastaví createInitialAITasks(..., { spoonacularRegistrationOnly: true }) z body-metrics).
 *
 * Env:
 * - SPOONACULAR_PLAN_GENERATION_ONLY=false — vypne bránu (nebezpečné, staré chování všude)
 * - SPOONACULAR_COMPRESS_REGISTRATION=false — registrace bez úsporného režimu (více bodů)
 */

/** Klíč v ai_tasks.payload – pouze registrace z body-metrics */
export const SPOONACULAR_REGISTRATION_PAYLOAD_KEY = 'spoonacular_registration_only';

/**
 * @returns {boolean} true = živá volání jen s allowLiveSpoonacular z registrace
 */
export function isSpoonacularPlanGenerationOnlyMode() {
  const v = process.env.SPOONACULAR_PLAN_GENERATION_ONLY;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  return true;
}

/**
 * Při registraci (initial_plan + payload flag) minimalizovat počet complexSearch / information.
 * @returns {boolean}
 */
export function isSpoonacularRegistrationCompressEnabled() {
  const v = process.env.SPOONACULAR_COMPRESS_REGISTRATION;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}

/**
 * Smí tento trainer task volat Spoonacular? Jen initial_plan z registrace.
 * @param {{ agent_slug?: string, task_type?: string, payload?: object }|null|undefined} task
 */
export function taskPayloadAllowsSpoonacularRegistration(task) {
  if (!task || task.agent_slug !== 'trainer' || task.task_type !== 'initial_plan') return false;
  const p = task.payload;
  return !!(p && typeof p === 'object' && p[SPOONACULAR_REGISTRATION_PAYLOAD_KEY] === true);
}

/**
 * Smí tento request poslat placené Spoonacular HTTP?
 * @param {boolean} allowLiveSpoonacular – true jen z taskPayloadAllowsSpoonacularRegistration
 */
export function spoonacularLiveOutboundEnabled(allowLiveSpoonacular) {
  if (!isSpoonacularPlanGenerationOnlyMode()) return true;
  return allowLiveSpoonacular === true;
}
