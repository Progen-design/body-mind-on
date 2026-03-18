/**
 * lib/validation/parseStructuredPlan.js
 * Parsování a validace strukturovaného výstupu z OpenAI.
 * Strip neznámých polí, kontrola povinných struktur.
 */
import { getDeterministicMealPlan, getDeterministicWorkoutPlan } from '../services/deterministicFallback';

/**
 * Validuje a normalizuje výstup z OpenAI.
 * @param {object} raw - surový JSON z OpenAI
 * @param {object} bodyMetrics - pro fallback
 * @returns {{ valid: boolean, plan: object | null }}
 */
export function parseStructuredPlan(raw, bodyMetrics) {
  if (!raw || typeof raw !== 'object') return { valid: false, plan: null };

  const targets = raw.targets;
  const mealPlan = raw.meal_plan;
  const workoutPlan = raw.workout_plan;

  if (!targets || typeof targets !== 'object') return { valid: false, plan: null };
  if (!mealPlan?.days || !Array.isArray(mealPlan.days) || mealPlan.days.length < 7) {
    return { valid: false, plan: null };
  }

  const plan = {
    targets: {
      calories_per_day: Number(targets.calories_per_day) || 2000,
      protein_g: Number(targets.protein_g) || 120,
      carbs_g: Number(targets.carbs_g) || 220,
      fat_g: Number(targets.fat_g) || 65,
    },
    meal_plan: {
      meals_per_day: Number(mealPlan.meals_per_day) || 3,
      days: mealPlan.days.slice(0, 7).map((d, i) => ({
        day_index: i,
        day_name: d.day_name || ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'][i],
        meals: Array.isArray(d.meals) ? d.meals.map((m) => ({
          type: m.type || 'breakfast',
          search_query: typeof m.search_query === 'string' ? m.search_query.trim().slice(0, 100) : '',
        })) : [],
      })),
    },
    workout_plan: null,
  };

  if (workoutPlan?.days && Array.isArray(workoutPlan.days) && workoutPlan.days.length > 0) {
    plan.workout_plan = {
      workout_days: Array.isArray(workoutPlan.workout_days) ? workoutPlan.workout_days : workoutPlan.days.map((d) => d.day_index),
      days: workoutPlan.days.map((d) => ({
        day_index: Number(d.day_index) ?? 0,
        exercises: Array.isArray(d.exercises)
          ? d.exercises.map((e) => ({
              search_term: typeof e.search_term === 'string' ? e.search_term.trim().slice(0, 80) : '',
              sets: Number(e.sets) || 3,
              reps: typeof e.reps === 'string' ? e.reps : null,
              duration_sec: Number(e.duration_sec) || null,
            }))
          : [],
      })),
    };
  } else {
    const fallback = getDeterministicWorkoutPlan(bodyMetrics);
    plan.workout_plan = fallback;
  }

  return { valid: true, plan };
}
