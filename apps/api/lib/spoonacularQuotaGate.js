/**
 * Spoonacular – runtime default OFF. Live HTTP jen v režimu `live` (legacy) nebo `seed` (seed skript).
 *
 * Env:
 * - SPOONACULAR_MODE=off|seed|live — default off (runtime generátor plánu nikdy nevolá API)
 * - SPOONACULAR_PLAN_GENERATION_ONLY=false — jen v režimu live: vypne registration-only bránu
 * - SPOONACULAR_COMPRESS_REGISTRATION — legacy (live režim)
 */

/** Klíč v ai_tasks.payload — historický; v režimu off se ignoruje */
export const SPOONACULAR_REGISTRATION_PAYLOAD_KEY = 'spoonacular_registration_only';

/**
 * @returns {'off'|'seed'|'live'}
 */
export function getSpoonacularMode() {
  const v = String(process.env.SPOONACULAR_MODE || 'off').trim().toLowerCase();
  if (v === 'seed' || v === 'live') return v;
  return 'off';
}

/**
 * Smí běžet seedRecipes.js (jednorázový import)?
 * @returns {boolean}
 */
export function isSpoonacularSeedModeAllowed() {
  return getSpoonacularMode() === 'seed';
}

/**
 * @returns {boolean} legacy: plan-only gate v režimu live
 */
export function isSpoonacularPlanGenerationOnlyMode() {
  if (getSpoonacularMode() !== 'live') return true;
  const v = process.env.SPOONACULAR_PLAN_GENERATION_ONLY;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}

/**
 * @returns {boolean}
 */
export function isSpoonacularRegistrationCompressEnabled() {
  const v = process.env.SPOONACULAR_COMPRESS_REGISTRATION;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}

/**
 * @param {{ agent_slug?: string, task_type?: string, payload?: object }|null|undefined} task
 */
export function taskPayloadAllowsSpoonacularRegistration(task) {
  if (getSpoonacularMode() !== 'live') return false;
  if (!task || task.agent_slug !== 'trainer' || task.task_type !== 'initial_plan') return false;
  const p = task.payload;
  return !!(p && typeof p === 'object' && p[SPOONACULAR_REGISTRATION_PAYLOAD_KEY] === true);
}

/**
 * Smí tento request poslat placené Spoonacular HTTP?
 * V režimu off/seed (runtime) vždy false.
 * @param {boolean} allowLiveSpoonacular
 */
export function spoonacularLiveOutboundEnabled(allowLiveSpoonacular) {
  if (getSpoonacularMode() !== 'live') return false;
  if (!isSpoonacularPlanGenerationOnlyMode()) return true;
  return allowLiveSpoonacular === true;
}

/**
 * Tvrdý zákaz runtime HTTP — vyhodí chybu místo tichého no-op (volitelné volání ze seed/live cest).
 * @param {boolean} allowLiveSpoonacular
 */
export function assertSpoonacularLiveAllowed(allowLiveSpoonacular = false) {
  if (!spoonacularLiveOutboundEnabled(allowLiveSpoonacular)) {
    const err = new Error(
      `Spoonacular live HTTP blocked (SPOONACULAR_MODE=${getSpoonacularMode()}). Použij recipes_catalog nebo seed skript.`
    );
    err.permanent = true;
    err.code = 'SPOONACULAR_BLOCKED';
    throw err;
  }
}
