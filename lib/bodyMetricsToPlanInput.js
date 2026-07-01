/**
 * lib/bodyMetricsToPlanInput.js
 * Mapuje body_metrics (registrace, profil) na vstup pro planOrchestrator.
 * Jediný mapper pro unified pipeline.
 */

import { computeTargetsForPlan } from './services/deterministicFallback';
import { parseTrainingEnvironment, parseAvailableEquipment } from './trainingEnvironment.js';
import { calculateAgeFromBirthDate } from './bodyMetricsBirthDate.js';

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Odvodí workouts_per_week z freq_choice nebo weekly_sessions_user.
 * @param {string|number} freq - např. "1-2", "3-4", "5+"
 * @param {number} weeklySessions
 */
function deriveWorkoutsPerWeek(freq, weeklySessions) {
  const n = asNum(weeklySessions);
  if (n != null && n >= 0 && n <= 7) return n;
  if (!freq || typeof freq !== 'string') return 3;
  const t = String(freq).toLowerCase();
  if (t.includes('1') && !t.includes('3')) return 1;
  if (t.includes('2')) return 2;
  if (t.includes('3') || t.includes('4')) return 3;
  if (t.includes('5')) return 5;
  return 3;
}

/**
 * Odvodí preferred_workout_days z workout_days string.
 * @param {string} workoutDaysStr - "1,3,5" (0=neděle, 6=sobota)
 */
function parseWorkoutDays(workoutDaysStr) {
  if (!workoutDaysStr) return [];
  const parts = String(workoutDaysStr).split(/[,\s]+/);
  return parts
    .map((p) => asNum(p.trim()))
    .filter((n) => n != null && n >= 0 && n <= 6);
}

/** Denní kalorický cíl z DB nebo odvozený z goal + váha. */
function dailyCalorieTarget(bm) {
  const fromDb = asNum(bm?.calories_target);
  if (fromDb != null) return fromDb;
  return asNum(computeTargetsForPlan(bm)?.calories_per_day) ?? 2200;
}

/** Při vysokém kalorickém cíli (≥2600) 4 jídla včetně svačiny, jinak výchozí 3. */
function deriveMealsPerDay(bm) {
  if (dailyCalorieTarget(bm) >= 2600) return 4;
  return asNum(bm?.meals_per_day) ?? 3;
}

/**
 * Mapuje body_metrics na vstup pro generateStructuredPlan.
 * @param {object} bm - body_metrics z DB (registrace, profil)
 * @returns {object} - { goal, diet_type, meals_per_day, workouts_per_week, preferred_workout_days, equipment, ... }
 */
export function bodyMetricsToPlanInput(bm) {
  if (!bm || typeof bm !== 'object') {
    return {
      goal: 'udrzovani',
      diet_type: 'standard',
      meals_per_day: 3,
      workouts_per_week: 3,
      preferred_workout_days: [1, 3, 5],
      equipment: 'bodyweight',
      age: null,
      height_cm: null,
      weight_kg: null,
      allergies: null,
      dietary_restrictions: null,
      foods_to_avoid: null,
      workout_duration_min: 60,
    };
  }

  const goal = (bm.goal || 'udrzovani').toLowerCase().trim();
  const dietRaw = (bm.diet_type || 'standard').toLowerCase().trim();
  const dietType = ['vegetarian', 'vegan'].includes(dietRaw) ? dietRaw : 'standard';

  const sessionsFromProfile = bm.weekly_sessions_user ?? bm.weekly_sessions ?? bm.workouts_per_week;
  const workoutsPerWeek = deriveWorkoutsPerWeek(bm.freq_choice, sessionsFromProfile);
  const preferredWorkoutDays = parseWorkoutDays(bm.workout_days);
  const trainingEnvironment = parseTrainingEnvironment(bm);
  const availableEquipment = parseAvailableEquipment(bm);
  const equipmentFromEnv = trainingEnvironment === 'home_bodyweight'
    ? 'bodyweight'
    : trainingEnvironment === 'home_equipment'
      ? (availableEquipment.length ? availableEquipment.join(', ') : 'home_equipment')
      : 'gym';

  return {
    goal: ['redukce', 'nabirani_svaly', 'udrzovani'].includes(goal) ? goal : 'udrzovani',
    diet_type: dietType,
    meals_per_day: Math.min(6, Math.max(2, deriveMealsPerDay(bm))),
    workouts_per_week: workoutsPerWeek,
    preferred_workout_days: preferredWorkoutDays.length > 0 ? preferredWorkoutDays : [1, 3, 5].slice(0, workoutsPerWeek),
    equipment: Array.isArray(bm.equipment) ? bm.equipment.join(', ') : (bm.equipment || equipmentFromEnv),
    training_environment: trainingEnvironment,
    available_equipment: availableEquipment,
    age: asNum(bm.age) ?? calculateAgeFromBirthDate(bm.birth_date),
    height_cm: asNum(bm.height_cm) ?? asNum(bm.height),
    weight_kg: asNum(bm.weight_kg) ?? asNum(bm.weight),
    allergies: bm.allergies || bm.dietary_restrictions || null,
    dietary_restrictions: bm.dietary_restrictions || null,
    foods_to_avoid: bm.foods_to_avoid || null,
    workout_duration_min: Math.min(90, Math.max(20, asNum(bm.workout_duration_min) ?? 60)),
  };
}
