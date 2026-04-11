/**
 * lib/validation/parseStructuredPlan.js
 * Parsování výstupu z OpenAI / trainer agenta (v5: meal_plan + workout_plan, v6: days[]).
 * Náhradní meal/workout šablony řeší planOrchestrator po parsování (deterministicFallback).
 */
const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/**
 * @param {object} m
 */
function normalizeMeal(m) {
  return {
    type: m.type || 'breakfast',
    name_cs: typeof m.name_cs === 'string' ? m.name_cs.trim().slice(0, 120) : '',
    ai_name: typeof m.ai_name === 'string' ? m.ai_name.trim().slice(0, 120) : '',
    search_query: typeof m.search_query === 'string' ? m.search_query.trim().slice(0, 100) : '',
    spoonacular_query: typeof m.spoonacular_query === 'string' ? m.spoonacular_query.trim().slice(0, 100) : '',
  };
}

/**
 * @param {object} e
 */
function normalizeExercise(e) {
  return {
    search_term: typeof e.search_term === 'string' ? e.search_term.trim().slice(0, 80) : '',
    canonical_key: typeof e.canonical_key === 'string' ? e.canonical_key.trim().slice(0, 80).toLowerCase() : '',
    name_cs: typeof e.name_cs === 'string' ? e.name_cs.trim().slice(0, 120) : '',
    sets: Number(e.sets) || 3,
    reps: typeof e.reps === 'string' ? e.reps : e.reps != null ? String(e.reps) : null,
    duration_sec: Number(e.duration_sec) || null,
  };
}

/**
 * v6: days[] s day_index, meals (name_cs, spoonacular_query), workout.exercises (canonical_key, name_cs)
 * @param {object[]} rawDays
 */
function normalizeV6MealDays(rawDays) {
  const days = Array.isArray(rawDays) ? rawDays : [];
  const byIndex = new Map();
  for (const d of days) {
    const di = Number(d.day_index);
    if (Number.isFinite(di) && di >= 0 && di <= 6) byIndex.set(di, d);
  }
  const padded = [];
  for (let i = 0; i < 7; i++) {
    const d = byIndex.get(i) || days[i] || {};
    const mealList = Array.isArray(d.meals) ? d.meals : [];
    const meals = mealList.map((m) => normalizeMeal(m));
    const di = Number(d.day_index);
    const dayIndex = Number.isFinite(di) ? di : i;
    padded.push({
      day_index: dayIndex,
      day_name: typeof d.day_name === 'string' ? d.day_name : CZECH_DAYS[dayIndex % 7],
      meals,
    });
  }
  return padded;
}

/**
 * @param {object} raw
 * @param {object} _bodyMetrics
 */
function parseV6(raw, _bodyMetrics) {
  if (!raw?.days || !Array.isArray(raw.days) || raw.days.length === 0) return null;

  const targetsRaw = raw.targets || raw.metrics || {};
  const t = {
    calories_per_day: Number(targetsRaw.calories_per_day || targetsRaw.calories) || 2000,
    protein_g: Number(targetsRaw.protein_g) || 120,
    carbs_g: Number(targetsRaw.carbs_g) || 220,
    fat_g: Number(targetsRaw.fat_g) || 65,
  };

  const mealDays = normalizeV6MealDays(raw.days);

  const workoutDays = [];
  const workoutDayIndices = [];
  for (const d of raw.days) {
    const w = d.workout;
    const di = Number(d.day_index);
    if (!Number.isFinite(di)) continue;
    if (w && Array.isArray(w.exercises) && w.exercises.length > 0) {
      const exercises = w.exercises.map((e) => normalizeExercise(e));
      workoutDays.push({ day_index: di, exercises });
      workoutDayIndices.push(di);
    }
  }

  const mpd = Math.max(1, mealDays[0]?.meals?.length || 3);

  return {
    targets: t,
    meal_plan: { meals_per_day: mpd, days: mealDays },
    workout_plan:
      workoutDays.length > 0
        ? { workout_days: workoutDayIndices, days: workoutDays }
        : { workout_days: [], days: [] },
    _format: 'v6',
    html: raw.html,
    shopping_list: raw.shopping_list,
    mindset_tip: raw.mindset_tip,
    metrics: raw.metrics,
  };
}

/**
 * Validuje a normalizuje výstup z OpenAI / agenta.
 * @param {object} raw - surový JSON
 * @param {object} _bodyMetrics - rezervováno (fallback už neřešíme zde)
 * @returns {{ valid: boolean, plan: object | null }}
 */
export function parseStructuredPlan(raw, _bodyMetrics) {
  if (!raw || typeof raw !== 'object') return { valid: false, plan: null };

  const v6 = parseV6(raw, _bodyMetrics);
  if (v6) return { valid: true, plan: v6 };

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
        day_name: d.day_name || CZECH_DAYS[i],
        meals: Array.isArray(d.meals) ? d.meals.map((m) => normalizeMeal(m)) : [],
      })),
    },
    workout_plan: null,
    _format: 'v5',
  };

  if (workoutPlan?.days && Array.isArray(workoutPlan.days) && workoutPlan.days.length > 0) {
    plan.workout_plan = {
      workout_days: Array.isArray(workoutPlan.workout_days) ? workoutPlan.workout_days : workoutPlan.days.map((d) => d.day_index),
      days: workoutPlan.days.map((d) => ({
        day_index: Number(d.day_index) ?? 0,
        exercises: Array.isArray(d.exercises) ? d.exercises.map((e) => normalizeExercise(e)) : [],
      })),
    };
  } else {
    plan.workout_plan = { workout_days: [], days: [] };
  }

  return { valid: true, plan };
}
