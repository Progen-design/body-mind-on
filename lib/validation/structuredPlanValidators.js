/**
 * lib/validation/structuredPlanValidators.js
 * Validace strukturovaného JSON plánu (ne HTML).
 * Nahrazuje HTML validátory pro unified pipeline.
 */

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Validuje strukturovaný plán proti body_metrics.
 * @param {object} planJson - výstup generateStructuredPlan
 * @param {object} bm - body_metrics
 * @returns {Promise<{
 *   ok: boolean,
 *   hardFail?: boolean,
 *   reason?: string,
 *   errors?: string[],
 *   warnings?: string[],
 *   corrected_plan_json?: object
 * }>}
 */
export async function validateStructuredPlan(planJson, bm) {
  const errors = [];
  const warnings = [];

  if (!planJson || typeof planJson !== 'object') {
    return { ok: false, hardFail: true, reason: 'plan_missing', errors: ['Plán je prázdný'] };
  }

  const days = planJson.days ?? [];
  if (days.length < 7) {
    errors.push(`Očekáváno 7 dní, nalezeno ${days.length}`);
  }

  const targets = planJson.targets ?? {};
  const calories = asNum(targets.calories_per_day);
  const protein = asNum(targets.protein_g);
  if (calories != null && (calories < 800 || calories > 5000)) {
    warnings.push(`Kalorie ${calories} mimo běžný rozsah 800–5000`);
  }
  if (protein != null && (protein < 50 || protein > 300)) {
    warnings.push(`Bílkoviny ${protein} g mimo běžný rozsah 50–300`);
  }

  const dietType = (bm?.diet_type || '').toLowerCase();
  if (dietType === 'vegetarian' || dietType === 'vegan') {
    const forbidden = dietType === 'vegan'
      ? ['maso', 'ryba', 'drůbež', 'vejce', 'mléko', 'sýr', 'med', 'želatina', 'chicken', 'beef', 'fish', 'meat', 'egg']
      : ['maso', 'ryba', 'drůbež', 'chicken', 'beef', 'fish', 'meat'];
    for (const day of days) {
      for (const m of day.meals ?? []) {
        const text = ((m.display_name ?? '') + (m.recipe?.title ?? '')).toLowerCase();
        for (const f of forbidden) {
          if (text.includes(f)) {
            errors.push(`Jídlo porušuje ${dietType}: ${m.display_name ?? m.recipe?.title ?? ''}`);
            break;
          }
        }
      }
    }
  }

  const foodsToAvoid = (bm?.foods_to_avoid || bm?.dietary_restrictions || '').toLowerCase();
  if (foodsToAvoid.includes('lep') || foodsToAvoid.includes('gluten')) {
    const glutenTerms = ['pšenice', 'mouka', 'těstoviny', 'chléb', 'kuskus', 'bulgur', 'wheat', 'flour', 'pasta', 'bread'];
    for (const day of days) {
      for (const m of day.meals ?? []) {
        const text = ((m.display_name ?? '') + (m.recipe?.title ?? '')).toLowerCase();
        for (const g of glutenTerms) {
          if (text.includes(g)) {
            errors.push(`Jídlo obsahuje lepek: ${m.display_name ?? m.recipe?.title ?? ''}`);
            break;
          }
        }
      }
    }
  }

  const hasHardErrors = errors.length > 0;
  return {
    ok: !hasHardErrors,
    hardFail: hasHardErrors,
    reason: hasHardErrors ? errors[0] : null,
    errors: errors.length ? errors : undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}
