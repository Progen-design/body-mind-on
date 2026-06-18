/**
 * lib/validation/onboardingSchema.js
 * Validace input contractu pro onboarding generate-plan.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */

const GOALS = ['redukce', 'nabirani_svaly', 'udrzovani'];
const DIET_TYPES = ['standard', 'vegetarian', 'vegan'];
const GENDERS = ['male', 'female', 'other'];
const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced'];

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Odvodí workout_days z workouts_per_week a preferred_workout_days.
 * @param {number} workoutsPerWeek
 * @param {number[]} preferredWorkoutDays
 * @returns {number[]}
 */
export function deriveWorkoutDays(workoutsPerWeek, preferredWorkoutDays = []) {
  if (!workoutsPerWeek || workoutsPerWeek < 1) return [];

  const valid = Array.isArray(preferredWorkoutDays)
    ? preferredWorkoutDays
        .map((d) => asNum(d))
        .filter((d) => d >= 0 && d <= 6)
    : [];

  if (valid.length > 0) {
    const picked = valid.slice(0, workoutsPerWeek);
    if (picked.length >= workoutsPerWeek) return picked;
    const fallbackOrder = [1, 3, 5, 2, 4, 6, 0];
    for (const d of fallbackOrder) {
      if (picked.length >= workoutsPerWeek) break;
      if (!picked.includes(d)) picked.push(d);
    }
    return picked.slice(0, workoutsPerWeek);
  }

  const defaults = {
    1: [3],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return defaults[workoutsPerWeek] ?? [1, 3, 5].slice(0, workoutsPerWeek);
}

/**
 * Validuje body_metrics. Vrací { ok, error?, details? }.
 * @param {object} bm
 * @returns {{ ok: boolean, error?: string, details?: Record<string, string> }}
 */
export function validateBodyMetrics(bm) {
  if (!bm || typeof bm !== 'object') {
    return { ok: false, error: 'body_metrics je povinné', details: { body_metrics: 'Povinné pole' } };
  }

  const details = {};

  const goal = (bm.goal || 'udrzovani').toLowerCase().trim();
  if (!GOALS.includes(goal)) {
    details.goal = `goal musí být ${GOALS.join(', ')}`;
  }

  const mealsPerDay = asNum(bm.meals_per_day);
  if (mealsPerDay == null) {
    details.meals_per_day = 'meals_per_day je povinné';
  } else if (mealsPerDay < 2 || mealsPerDay > 6) {
    details.meals_per_day = 'meals_per_day musí být 2–6';
  }

  const workoutsPerWeek = asNum(bm.workouts_per_week);
  if (workoutsPerWeek == null) {
    details.workouts_per_week = 'workouts_per_week je povinné';
  } else if (workoutsPerWeek < 0 || workoutsPerWeek > 7) {
    details.workouts_per_week = 'workouts_per_week musí být 0–7';
  }

  const preferred = bm.preferred_workout_days;
  if (Array.isArray(preferred)) {
    const invalid = preferred.some((d) => {
      const n = asNum(d);
      return n == null || n < 0 || n > 6;
    });
    if (invalid) {
      details.preferred_workout_days = 'preferred_workout_days musí obsahovat čísla 0–6';
    }
  }

  const dietType = (bm.diet_type || '').toLowerCase().trim();
  if (dietType && !DIET_TYPES.includes(dietType)) {
    details.diet_type = `diet_type musí být ${DIET_TYPES.join(', ')}`;
  }

  const age = asNum(bm.age);
  if (age != null && (age < 10 || age > 120)) {
    details.age = 'věk mimo rozsah 10–120';
  }

  const height = asNum(bm.height_cm);
  if (height != null && (height < 100 || height > 250)) {
    details.height_cm = 'výška mimo rozsah 100–250 cm';
  }

  const weight = asNum(bm.weight_kg);
  if (weight != null && (weight < 30 || weight > 300)) {
    details.weight_kg = 'váha mimo rozsah 30–300 kg';
  }

  if (Object.keys(details).length > 0) {
    return {
      ok: false,
      error: Object.values(details)[0],
      details,
    };
  }

  return { ok: true };
}
