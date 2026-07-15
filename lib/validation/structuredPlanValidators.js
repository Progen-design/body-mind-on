/**
 * lib/validation/structuredPlanValidators.js
 * Validace strukturovaného JSON plánu (ne HTML).
 * Nahrazuje HTML validátory pro unified pipeline.
 */

import { bodyMetricsToPlanInput } from '../bodyMetricsToPlanInput';
import { MEAL_TRAINING_COHERENCE, normalizeEquipmentKeys, profileLacksEquipmentCategory } from './mealTrainingCoherence';

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function exerciseHasDisplayName(ex) {
  const n = String(ex?.name ?? ex?.display_name_cs ?? ex?.name_cs ?? '').trim();
  return n.length > 0;
}

/** @param {object} ex */
function exerciseTextForEquipmentHeuristic(ex) {
  return [ex.display_name_cs, ex.name, ex.name_cs, ex.search_term]
    .filter((x) => typeof x === 'string' && x.trim())
    .join(' ')
    .toLowerCase();
}

/** Dny jen s canonical_key „rest“ nejsou tréninkové dny (plán má 7× workout kvůli mapování na kalendář). */
function exerciseIsRest(ex) {
  return String(ex?.canonical_key ?? '')
    .trim()
    .toLowerCase() === 'rest';
}

/** Aspoň jeden cvik, který není čistý odpočinek. */
function isRealTrainingWorkout(w) {
  if (w == null) return false;
  const exs = w.exercises ?? [];
  return exs.some((ex) => !exerciseIsRest(ex));
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
export async function validateStructuredPlan(planJson, bm, opts = {}) {
  const onboardingSoftGate = opts.onboardingSoftGate === true;
  const errors = [];
  const warnings = [];

  if (!planJson || typeof planJson !== 'object') {
    return { ok: false, hardFail: true, reason: 'plan_missing', errors: ['Plán je prázdný'] };
  }

  const planInput = bodyMetricsToPlanInput(bm);
  const expectedMealsPerDay = planInput.meals_per_day;
  const expectedWorkoutsPerWeek = planInput.workouts_per_week;

  const days = planJson.days ?? [];
  if (days.length < 7) {
    errors.push(`Očekáváno 7 dní, nalezeno ${days.length}`);
  }

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const meals = day.meals ?? [];
    const mealCount = meals.length;
    if (mealCount < expectedMealsPerDay) {
      const label = day.day_name ?? `den_index ${day.day_index ?? i}`;
      errors.push(`${label}: očekáváno alespoň ${expectedMealsPerDay} jídel (profil), nalezeno ${mealCount}`);
    } else if (mealCount > expectedMealsPerDay) {
      const label = day.day_name ?? `den_index ${day.day_index ?? i}`;
      const honestyAdds = meals.filter((m) => m?.calorie_honesty_added === true).length;
      warnings.push(
        `${label}: ${mealCount} jídel (profil ${expectedMealsPerDay}${honestyAdds ? `, +${honestyAdds} doplněno pro kcal` : ''})`
      );
    }
    if (mealCount > 0 && meals.every((m) => m.recipe_verified === false)) {
      const label = day.day_name ?? `den_index ${day.day_index ?? i}`;
      warnings.push(`${label}: všechna jídla jsou neověřená (Spoonacular)`);
    }
  }

  const equipmentKeys = normalizeEquipmentKeys(bm);
  let workoutDayCount = 0;
  for (const day of days) {
    const w = day.workout;
    if (w == null) continue;
    const exs = w.exercises ?? [];
    const label = day.day_name ?? `day_index ${day.day_index ?? '?'}`;
    if (exs.length === 0) {
      errors.push(`Tréninkový den (${label}): žádné cviky`);
      continue;
    }
    if (!isRealTrainingWorkout(w)) {
      continue;
    }
    workoutDayCount++;
    const named = exs.filter(exerciseHasDisplayName);
    if (named.length === 0) {
      errors.push(`Tréninkový den (${label}): cviky bez názvu`);
    }
    const allUnverified = exs.every((e) => e.exercise_verified === false);
    if (allUnverified) {
      warnings.push(`Tréninkový den (${label}): všechny cviky jsou neověřené (wger/registry)`);
    }
    for (const ex of exs) {
      const hay = exerciseTextForEquipmentHeuristic(ex);
      if (!hay) continue;
      for (const [category, keywords] of Object.entries(MEAL_TRAINING_COHERENCE.equipmentHeuristicKeywords)) {
        if (!profileLacksEquipmentCategory(equipmentKeys, category)) continue;
        const hit = keywords.some((kw) => hay.includes(kw));
        if (hit) {
          const exLabel = ex.display_name_cs || ex.name || ex.name_cs || 'cvik';
          warnings.push(
            `Tréninkový den (${label}): „${exLabel}“ může vyžadovat ${category} (profil: ${equipmentKeys.join(', ')})`
          );
          break;
        }
      }
    }
  }

  if (workoutDayCount > 7) {
    errors.push(`Plán má více než 7 tréninkových dnů s cviky (nalezeno ${workoutDayCount})`);
  } else if (MEAL_TRAINING_COHERENCE.workoutDaysMustMatchProfile) {
    const tol = Number(MEAL_TRAINING_COHERENCE.workoutDaysMatchProfileTolerance);
    const tolerance = Number.isFinite(tol) && tol >= 0 ? tol : 2;
    if (expectedWorkoutsPerWeek === 0) {
      if (workoutDayCount > 0) {
        errors.push(`Profil má 0 tréninků týdně, plán má ${workoutDayCount} tréninkových dnů`);
      }
    } else if (workoutDayCount === 0) {
      errors.push(
        `Profil: ${expectedWorkoutsPerWeek} tréninků týdně, plán neobsahuje žádný tréninkový den s cviky`
      );
    } else if (
      workoutDayCount > 0 &&
      expectedWorkoutsPerWeek > 0 &&
      Math.abs(workoutDayCount - expectedWorkoutsPerWeek) > tolerance
    ) {
      errors.push(
        `Profil: ${expectedWorkoutsPerWeek} tréninků týdně (odchylka max. ${tolerance}), plán má ${workoutDayCount} tréninkových dnů s cviky`
      );
    }
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

  const MIN_DAY_CALORIE_RATIO = 1 - 0.05;
  const MAX_DAY_CALORIE_RATIO = 1 + 0.05;
  const honestUnderrunAllowed = planJson?.calorie_honesty?.plan_under_target === true
    || onboardingSoftGate
    || (days || []).some((d) => d?.calorie_under_target === true);
  if (calories != null && calories >= 800) {
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const mealCount = (day.meals ?? []).length;
      const label = day.day_name ?? `den ${i + 1}`;
      let sum = 0;
      let counted = 0;
      for (const m of day.meals ?? []) {
        const k = asNum(m?.kcal ?? m?.recipe?.calories);
        if (k != null && k > 0) {
          sum += k;
          counted += 1;
        }
      }
      if (mealCount > 0 && counted === 0) {
        errors.push(
          `${label}: žádné jídlo nemá kalorie z receptu (Spoonacular) — plán je neúplný`
        );
        continue;
      }
      if (mealCount > 0 && counted < mealCount) {
        warnings.push(
          `${label}: pouze ${counted}/${mealCount} jídel má uvedené kalorie z receptu`
        );
      }
      if (counted === 0) continue;
      const dayTarget = asNum(day.daily_target_kcal) ?? calories;
      const ratio = sum / dayTarget;
      if (ratio < MIN_DAY_CALORIE_RATIO) {
        const msg = `${label}: součet kalorií z jídel je ${Math.round(sum)} kcal (~${Math.round(ratio * 100)} % cíle dne ${Math.round(dayTarget)} kcal), minimum ${Math.round(MIN_DAY_CALORIE_RATIO * 100)} %`;
        if (honestUnderrunAllowed) {
          warnings.push(`${msg} — honest underrun (neinventujeme kcal)`);
        } else {
          errors.push(msg);
        }
      } else if (ratio > MAX_DAY_CALORIE_RATIO) {
        errors.push(
          `${label}: součet kalorií ${Math.round(sum)} kcal přesahuje ~${Math.round(MAX_DAY_CALORIE_RATIO * 100)} % denního cíle (${Math.round(dayTarget)} kcal)`
        );
      }
    }
  }

  const dietType = (bm?.diet_type || '').toLowerCase();
  if (dietType === 'vegetarian' || dietType === 'vegan') {
    const forbidden = dietType === 'vegan'
      ? ['maso', 'ryba', 'drůbež', 'vejce', 'mléko', 'sýr', 'med', 'želatina', 'chicken', 'beef', 'fish', 'meat', 'egg']
      : ['maso', 'ryba', 'drůbež', 'chicken', 'beef', 'fish', 'meat'];
    for (const day of days) {
      for (const m of day.meals ?? []) {
        const label = (m.display_name_cs || m.display_name || '').trim();
        const text = (label + (m.recipe?.title ?? '')).toLowerCase();
        for (const f of forbidden) {
          if (text.includes(f)) {
            errors.push(`Jídlo porušuje ${dietType}: ${label || m.recipe?.title || ''}`);
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
        const label = (m.display_name_cs || m.display_name || '').trim();
        const text = (label + (m.recipe?.title ?? '')).toLowerCase();
        for (const g of glutenTerms) {
          if (text.includes(g)) {
            errors.push(`Jídlo obsahuje lepek: ${label || m.recipe?.title || ''}`);
            break;
          }
        }
      }
    }
  }

  if (onboardingSoftGate && errors.length > 0) {
    const hardErrors = errors.filter((e) =>
      /Očekáváno 7 dní|Plán je prázdný|žádné jídlo nemá kalorie/i.test(e)
    );
    const softErrors = errors.filter((e) => !hardErrors.includes(e));
    if (softErrors.length) {
      warnings.push(...softErrors.map((e) => `[onboarding-soft] ${e}`));
    }
    errors.splice(0, errors.length, ...hardErrors);
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
