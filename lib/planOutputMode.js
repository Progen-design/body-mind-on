/**
 * Jednotný produktový přepínač: co zobrazit uživateli v UI a e-mailech.
 *
 * Generování plánu (unified pipeline) vždy může produkovat jídelníček i trénink v JSON/HTML;
 * tento modul říká, zda se trénink a média jídel smí uživateli vykreslit.
 *
 * Výchozí: nutrition_training (profil, plánovací e-maily a digest včetně tréninku; obrázky jídel v e-mailu zůstávají vypnuté).
 * Pro skrytí tréninku v UI a e-mailech nastav PLAN_OUTPUT_MODE=nutrition_only (a případně NEXT_PUBLIC_PLAN_OUTPUT_MODE).
 *
 * Env (libovolná z nich; první výhra):
 *   PLAN_OUTPUT_MODE
 *   NEXT_PUBLIC_PLAN_OUTPUT_MODE  (dostupná i v browser bundle)
 *
 * Hodnoty: nutrition_only | nutrition_training
 */

export const DEFAULT_PLAN_OUTPUT_MODE = 'nutrition_training';

/** @typedef {'nutrition_only' | 'nutrition_training'} PlanOutputMode */

/**
 * @param {unknown} raw
 * @returns {PlanOutputMode}
 */
export function normalizePlanOutputMode(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (s === 'nutrition_training' || s === 'full' || s === 'training') return 'nutrition_training';
  return 'nutrition_only';
}

/**
 * Výchozí režim z prostředí (server i klient).
 * @returns {PlanOutputMode}
 */
export function getDefaultPlanOutputModeFromEnv() {
  const fromEnv =
    (typeof process !== 'undefined' &&
      process.env &&
      (process.env.PLAN_OUTPUT_MODE || process.env.NEXT_PUBLIC_PLAN_OUTPUT_MODE)) ||
    '';
  return normalizePlanOutputMode(fromEnv || DEFAULT_PLAN_OUTPUT_MODE);
}

/**
 * @param {object|null|undefined} plan – např. řádek ai_generated_plans (volitelně output_mode až přidáte do DB)
 * @param {object|null|undefined} _user – rezerva (profiles.plan_output_mode apod.)
 * @param {{ outputMode?: string|null }} [options] – explicitní přepínač (API / test)
 * @returns {PlanOutputMode}
 */
export function getPlanOutputMode(plan, _user, options = {}) {
  if (options?.outputMode != null && String(options.outputMode).trim() !== '') {
    return normalizePlanOutputMode(options.outputMode);
  }
  const fromPlan = plan?.output_mode ?? plan?.plan_output_mode;
  if (fromPlan != null && String(fromPlan).trim() !== '') {
    return normalizePlanOutputMode(fromPlan);
  }
  return getDefaultPlanOutputModeFromEnv();
}

/**
 * @param {PlanOutputMode|string} mode
 * @returns {boolean}
 */
export function shouldRenderTraining(mode) {
  return normalizePlanOutputMode(mode) === 'nutrition_training';
}

/**
 * Obrázky jídel v profilu (Spoonacular / enrichment). V nutrition_only nezobrazujeme.
 * @param {PlanOutputMode|string} mode
 * @returns {boolean}
 */
export function shouldRenderMealImages(mode) {
  return normalizePlanOutputMode(mode) === 'nutrition_training';
}

/**
 * Blok tréninku v těle e-mailu s plánem.
 * @param {PlanOutputMode|string} mode
 * @returns {boolean}
 */
export function shouldIncludeTrainingInEmail(mode) {
  return normalizePlanOutputMode(mode) === 'nutrition_training';
}

/**
 * HTML dne v denním digestu (nad rámec textové nápovědy trainingDayKind).
 * @param {PlanOutputMode|string} mode
 * @returns {boolean}
 */
export function shouldIncludeTrainingInDigest(mode) {
  return normalizePlanOutputMode(mode) === 'nutrition_training';
}

/**
 * E-mail klientům: mazat obrázky/GIF/atributy — vždy (Gmail, konzistence).
 * Trénink se řídí shouldIncludeTrainingInEmail; média nikdy neposíláme v plánovacím e-mailu.
 * @returns {true}
 */
export function shouldStripMediaFromPlanEmail() {
  return true;
}
