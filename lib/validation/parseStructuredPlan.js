/**
 * lib/validation/parseStructuredPlan.js
 * Parsování výstupu z OpenAI / trainer agenta (v5: meal_plan + workout_plan, v6: days[]).
 * Náhradní meal/workout šablony řeší planOrchestrator po parsování (deterministicFallback).
 */
const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/**
 * První neprázdný řetězec z pole klíčů (aliasy z trainer / OpenAI výstupu).
 * @param {object} m
 * @param {string[]} keys
 */
function pickMealStringField(m, keys) {
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  return '';
}

/**
 * @param {object} m
 */
function normalizeMeal(m) {
  const name_cs = pickMealStringField(m, [
    'name_cs',
    'meal_name_cs',
    'title_cs',
    'nazev_cs',
    'czech_name',
    'meal_title_cs',
    'display_name_cs',
    'display_name',
  ]);
  const ai_name = pickMealStringField(m, ['ai_name', 'ai_meal_name', 'planner_name_cs']);
  const spoonacular_query = pickMealStringField(m, [
    'spoonacular_query',
    'query',
    'search_query',
    'spoonacularQuery',
    'meal_search_query',
    'query_en',
  ]).slice(0, 100);
  const search_query =
    typeof m.search_query === 'string' ? m.search_query.trim().slice(0, 100) : '';
  return {
    type: m.type || 'breakfast',
    name_cs,
    ai_name,
    search_query,
    spoonacular_query,
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
 * workout_plan.days vždy přesně 7 záznamů (day_index 0–6 odpovídá meal_plan).
 * Chybějící den = jeden syntetický cvik „rest“. workout_days = dny s reálným tréninkem (ne jen odpočinek).
 * @param {{ day_index: number, exercises: object[] }[]} sparseList
 */
function padWorkoutPlanToSevenDays(sparseList) {
  const by = new Map();
  for (const w of sparseList || []) {
    const di = Number(w?.day_index);
    if (!Number.isFinite(di) || di < 0 || di > 6) continue;
    if (!Array.isArray(w.exercises) || w.exercises.length === 0) continue;
    const exercises = w.exercises.map((e) => normalizeExercise(e));
    by.set(di, exercises);
  }
  const restSlot = [
    normalizeExercise({
      canonical_key: 'rest',
      name_cs: 'Odpočinek',
      sets: 1,
      reps: 1,
      search_term: 'rest',
    }),
  ];
  const days = [];
  const workout_days = [];
  for (let i = 0; i < 7; i++) {
    const exercises = by.has(i) ? by.get(i) : restSlot;
    days.push({ day_index: i, exercises });
    const hasRealWorkout = exercises.some((ex) => (ex.canonical_key || '').toLowerCase() !== 'rest');
    if (hasRealWorkout) workout_days.push(i);
  }
  return { days, workout_days };
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
  for (const d of raw.days) {
    const w = d.workout;
    const di = Number(d.day_index);
    if (!Number.isFinite(di)) continue;
    if (w && Array.isArray(w.exercises) && w.exercises.length > 0) {
      const exercises = w.exercises.map((e) => normalizeExercise(e));
      workoutDays.push({ day_index: di, exercises });
    }
  }

  /** Model často vrátí cviky v kořenovém workout_plan (v5 tvar) místo days[].workout — sloučit, pokud dny nemají cviky. */
  if (workoutDays.length === 0 && raw.workout_plan?.days && Array.isArray(raw.workout_plan.days)) {
    for (const d of raw.workout_plan.days) {
      const di = Number(d.day_index);
      if (!Number.isFinite(di) || di < 0 || di > 6) continue;
      const exList = Array.isArray(d.exercises) ? d.exercises : [];
      if (exList.length === 0) continue;
      const exercises = exList.map((e) => normalizeExercise(e));
      workoutDays.push({ day_index: di, exercises });
    }
  }

  const mpd = Math.max(1, mealDays[0]?.meals?.length || 3);

  const workoutPadded = padWorkoutPlanToSevenDays(workoutDays);

  return {
    targets: t,
    meal_plan: { meals_per_day: mpd, days: mealDays },
    workout_plan: workoutPadded,
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
  if (!raw || typeof raw !== 'object') {
    console.log('[parseStructuredPlan] reject', { reason: 'root_not_object', rawType: typeof raw });
    return { valid: false, plan: null };
  }

  /** OpenAI v5: root `targets` + `meal_plan.days` bez vnořeného `meal_plan.targets` — zkopírovat pro downstream. */
  let n = raw;
  if (n?.targets && n?.meal_plan && !n.meal_plan.targets) {
    n = { ...n, meal_plan: { ...n.meal_plan, targets: n.targets } };
  }

  const topKeys = !Array.isArray(n) ? Object.keys(n).slice(0, 40) : [];
  console.log('[parseStructuredPlan] start', {
    rawType: typeof n,
    topKeys,
    daysLength: Array.isArray(n?.days) ? n.days.length : null,
    mealPlanDaysLength: Array.isArray(n?.meal_plan?.days) ? n.meal_plan.days.length : null,
    hasTargetsObject: !!(n.targets && typeof n.targets === 'object'),
    hasMealPlanTargets: !!(n.meal_plan?.targets && typeof n.meal_plan.targets === 'object'),
  });

  const v6 = parseV6(n, _bodyMetrics);
  if (v6) return { valid: true, plan: v6 };

  const targets = n.targets;
  const mealPlan = n.meal_plan;
  const workoutPlan = n.workout_plan;

  if (!targets || typeof targets !== 'object') {
    console.log('[parseStructuredPlan] reject', { reason: 'missing_or_invalid_targets', hasTargets: !!n.targets });
    return { valid: false, plan: null };
  }
  if (!mealPlan?.days || !Array.isArray(mealPlan.days) || mealPlan.days.length < 1) {
    console.log('[parseStructuredPlan] reject', {
      reason: 'meal_plan_days_need_at_least_1',
      hasMealPlan: !!mealPlan,
      daysIsArray: Array.isArray(mealPlan?.days),
      daysLength: Array.isArray(mealPlan?.days) ? mealPlan.days.length : null,
    });
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

  if (typeof n.html === 'string' && n.html.trim()) {
    plan.html = n.html.trim();
  }

  if (workoutPlan?.days && Array.isArray(workoutPlan.days) && workoutPlan.days.length > 0) {
    const mappedWd = workoutPlan.days.map((d, i) => {
      const di = Number(d.day_index);
      return {
        day_index: Number.isFinite(di) && di >= 0 && di <= 6 ? di : i,
        exercises: Array.isArray(d.exercises) ? d.exercises.map((e) => normalizeExercise(e)) : [],
      };
    });
    plan.workout_plan = padWorkoutPlanToSevenDays(mappedWd);
  } else {
    plan.workout_plan = padWorkoutPlanToSevenDays([]);
  }

  return { valid: true, plan };
}
