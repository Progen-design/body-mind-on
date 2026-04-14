/**
 * lib/validation/mealTrainingCoherence.js
 *
 * Produktová pravidla souhry jídel a tréninku (zdroj pravdy pro dokumentaci i validátory).
 * Runtime neprovádí automatické přepočty kalorií podle tréninku — viz ONBOARDING_PRODUCTION_SPEC §1.
 */

/** @readonly */
export const MEAL_TRAINING_COHERENCE = {
  /** Jednotný denní cíl targets po celý týden; žádný server-side „leg day carbs“. */
  targetsAreUniformDaily: true,

  /** Počet jídel na každý kalendářní den ve výstupu = meals_per_day z profilu. */
  mealsPerDayMustMatchProfile: true,

  /**
   * Počet dnů s reálným tréninkem vs. workouts_per_week z profilu (bodyMetricsToPlanInput).
   * Odchylka větší než workoutDaysMatchProfileTolerance → error ve structuredPlanValidators.
   */
  workoutDaysMustMatchProfile: true,

  /** Povolená odchylka počtu tréninkových dnů oproti profilu (např. 1 ⇒ akceptuje ±1). */
  workoutDaysMatchProfileTolerance: 1,

  /** Každý tréninkový den musí mít aspoň jeden cvik s uživatelsky čitelným názvem. */
  trainingDayRequiresNamedExercise: true,

  /**
   * Ověřené jídlo: display_name_cs z přeloženého titulu Spoonacular; planner_suggestion_cs = název z LLM.
   * @see lib/services/planOrchestratorResolve.js resolveMeals
   */
  verifiedMealDisplayTitleFromSpoonacular: true,

  /**
   * Vybavení z profilu se respektuje primárně v promptu LLM; strojová kontrola je jen heuristická varování.
   * @type {Readonly<Record<string, readonly string[]>>}
   */
  equipmentHeuristicKeywords: Object.freeze({
    barbell: ['barbell', 'činka', 'olympic'],
    dumbbell: ['dumbbell', 'jednoručka', 'jednoruc'],
    machine: ['machine', 'smith', 'kettlebell', 'kettle'],
    cable: ['cable', 'kladka'],
  }),
};

/**
 * Vrací normalizované klíče vybavení z body_metrics (malá písmena).
 * @param {object|null|undefined} bm
 * @returns {string[]}
 */
export function normalizeEquipmentKeys(bm) {
  const raw = bm?.equipment;
  if (!raw) return ['bodyweight'];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True, pokud profil neobsahuje danou kategorii vybavení (pro varování ve validátoru).
 * @param {string[]} equipmentKeys
 * @param {'barbell'|'dumbbell'|'machine'|'cable'} category
 */
export function profileLacksEquipmentCategory(equipmentKeys, category) {
  const set = new Set(equipmentKeys);
  const synonyms = {
    barbell: ['barbell', 'bar', 'olympic', 'činka'],
    dumbbell: ['dumbbell', 'dumbbells', 'jednoručky', 'weights'],
    machine: ['machine', 'gym', 'smith', 'kettlebell', 'kettlebells'],
    cable: ['cable', 'kladka', 'pulley'],
  };
  const needles = synonyms[category] || [];
  const has = needles.some((n) => {
    for (const k of set) {
      if (k.includes(n) || n.includes(k)) return true;
    }
    return false;
  });
  return !has;
}
