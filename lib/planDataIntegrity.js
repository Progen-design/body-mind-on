/**
 * Jednorázové úpravy strukturovaného plánu před persist / e-mail (data integrity).
 * Nemění vzhled šablon — pouze opravuje rozpor názvu jídla vs. receptu, cviky bez reps/duration.
 */

function normalizeMatchText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Zda můžeme bezpečně ukázat odkaz na Spoonacular recept (shoda s českým názvem jídla).
 * @param {object} meal
 * @returns {boolean}
 */
export function isRecipeConsistentWithMealDisplay(meal) {
  const r = meal?.recipe;
  if (!r || !(r.id ?? meal?.recipe_id)) return true;
  const mealLabel = [meal.display_name_cs, meal.display_name, meal.name_cs, meal.planner_suggestion_cs, meal.ai_name]
    .filter((x) => typeof x === 'string' && x.trim())
    .join(' ');
  const title = r.title_cs || r.title || '';
  if (!mealLabel.trim() || !String(title).trim()) return true;

  const m = normalizeMatchText(mealLabel);
  const t = normalizeMatchText(title);

  if ((m.includes('vejce') || m.includes('vajec') || m.includes('vajick') || /\bmichan/.test(m)) && t.includes('tofu')) {
    return false;
  }
  if ((m.includes('tofu') || m.includes('dòufu')) && (t.includes('egg') || t.includes('eggs')) && !t.includes('tofu')) {
    return false;
  }
  if ((m.includes('losos') || m.includes('salmon')) && t.includes('chicken') && !t.includes('salmon')) {
    return false;
  }
  if ((m.includes('kure') || m.includes('kurc') || m.includes('kureci') || m.includes('chicken')) && t.includes('tuna') && !t.includes('chicken')) {
    return false;
  }
  if ((m.includes('tunak') || m.includes('tuna')) && t.includes('chicken') && !t.includes('tuna')) {
    return false;
  }

  const stop = new Set([
    'the', 'and', 'with', 'for', 'from', 'grilled', 'baked', 'fresh', 'mixed', 'style', 'salad',
    'podle', 'nebo', 'jako', 'grilovane', 'pecene', 'cerstve',
  ]);
  const mealTokens = m.split(/[^a-záčďéěíňóřšťúůýž]+/).filter((x) => x.length > 3 && !stop.has(x));
  if (mealTokens.length === 0) return true;

  const hasOverlap = mealTokens.some((tok) => t.includes(tok));
  if (hasOverlap) return true;

  const crossPairs = [
    ['kure', 'chicken'],
    ['ryze', 'rice'],
    ['testovin', 'pasta'],
    ['losos', 'salmon'],
    ['tunak', 'tuna'],
    ['vejce', 'egg'],
    ['vejce', 'scrambled'],
    ['michan', 'scrambled'],
    ['cottage', 'cottage'],
    ['ovoc', 'fruit'],
    ['dzus', 'juice'],
  ];
  for (const [a, b] of crossPairs) {
    if (m.includes(a) && t.includes(b)) return true;
    if (m.includes(b) && t.includes(a)) return true;
  }

  return false;
}

/**
 * Odstraní špatně spárovaný recept; zamezí kliknutí na zjevně jiné jídlo.
 * @param {object} planJson
 * @returns {{ cleaned: number, issues: object[] }}
 */
export function sanitizeRecipeMealMismatchesInPlan(planJson) {
  const issues = [];
  let cleaned = 0;
  const days = planJson?.days;
  if (!Array.isArray(days)) return { cleaned, issues };

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const meals = day?.meals;
    if (!Array.isArray(meals)) continue;
    for (let i = 0; i < meals.length; i++) {
      const meal = meals[i];
      if (!meal?.recipe && !meal?.recipe_id) continue;
      if (meal.catalog_id || meal.recipe?.source === 'catalog') continue;
      if (isRecipeConsistentWithMealDisplay(meal)) continue;
      issues.push({
        day_index: d,
        meal_type: meal.type,
        display: meal.display_name_cs || meal.name_cs,
        recipe_id: meal.recipe?.id ?? meal.recipe_id,
        recipe_title: meal.recipe?.title,
      });
      meal.recipe = null;
      meal.recipe_id = null;
      meal.recipe_verified = false;
      cleaned += 1;
    }
  }
  if (issues.length) {
    console.warn('[planDataIntegrity] recipe display mismatch — links stripped', { count: issues.length });
  }
  return { cleaned, issues };
}

const ISO_DURATION_BY_CANONICAL = {
  plank: 30,
  warmup: 60,
  cooldown: 60,
  rest: 0,
  stretch: 45,
  hold: 30,
};

function exerciseDisplayName(ex) {
  return normalizeMatchText(
    ex?.display_name_cs || ex?.name_cs || ex?.name || ex?.exercise_name || ''
  );
}

/**
 * Výchozí délka (s) u časových cviků bez reps/duration z AI.
 * @param {object} ex
 * @returns {number|null}
 */
export function inferDefaultDurationSecondsForExercise(ex) {
  const key = String(ex?.canonical_key || '').toLowerCase().trim();
  if (ISO_DURATION_BY_CANONICAL[key] != null) return ISO_DURATION_BY_CANONICAL[key];

  const name = exerciseDisplayName(ex);
  if (!name) return null;
  if (key === 'plank' || name.includes('prkno') || name.includes('plank')) return 30;
  if (name.includes('wall') && name.includes('sit')) return 45;
  if (name.includes('stre') || name.includes('stretch')) return 45;
  if (name.includes('hold') || name.includes('drz') || name.includes('isometr')) return 30;
  return null;
}

/**
 * Doplní duration_sec u isometrických cviků, pokud chybí reps i sekundy.
 * @param {object} planJson
 * @returns {number} počet upravených cviků
 */
export function normalizeWorkoutExerciseDurationsInPlan(planJson) {
  let patched = 0;
  const days = planJson?.days;
  if (!Array.isArray(days)) return patched;

  for (const day of days) {
    const exs = day?.workout?.exercises;
    if (!Array.isArray(exs)) continue;
    for (const ex of exs) {
      const reps = ex?.reps;
      const hasReps = reps != null && String(reps).trim() !== '' && String(reps).trim() !== '—';
      const durRaw = ex?.duration_seconds ?? ex?.duration_sec;
      const hasDur = Number.isFinite(Number(durRaw)) && Number(durRaw) > 0;
      if (hasReps || hasDur) continue;

      const sec = inferDefaultDurationSecondsForExercise(ex);
      if (sec == null || sec <= 0) continue;
      ex.duration_sec = sec;
      if (ex.duration_seconds == null) ex.duration_seconds = sec;
      patched += 1;
    }
  }
  return patched;
}

/**
 * Sekundová délka cviku pro UI / e-mail (sjednocení duration_sec vs duration_seconds).
 * @param {object} ex
 * @returns {number|null}
 */
export function exerciseDurationSecondsForDisplay(ex) {
  const a = Number(ex?.duration_seconds ?? ex?.duration_sec);
  if (Number.isFinite(a) && a > 0) return Math.round(a);
  const inferred = inferDefaultDurationSecondsForExercise(ex);
  return inferred != null && inferred > 0 ? inferred : null;
}

/**
 * Jednotný text sérií/reps/času — nikdy nevrátí „3×—“.
 * @param {object} ex
 * @param {{ nbsp?: boolean }} [opts]
 * @returns {string}
 */
export function formatExerciseSetsRepsDisplay(ex, opts = {}) {
  const setsNum = Number(ex?.sets);
  const setsStr = Number.isFinite(setsNum) && setsNum > 0 ? String(Math.round(setsNum)) : '3';
  const durSec = exerciseDurationSecondsForDisplay(ex);
  const unitSep = opts.nbsp ? '\u00A0s' : ' s';
  if (durSec != null) return `${setsStr}×${durSec}${unitSep}`;

  const repsRaw = ex?.reps;
  const repsStr = repsRaw != null ? String(repsRaw).trim() : '';
  if (repsStr && repsStr !== '—' && repsStr !== '-') {
    const localizedReps = repsStr
      .replace(/\bper\s+leg\b/gi, 'na každou nohu')
      .replace(/\bper\s+side\b/gi, 'na každou stranu');
    return `${setsStr}×${localizedReps}`;
  }

  return `${setsStr} sérií`;
}
