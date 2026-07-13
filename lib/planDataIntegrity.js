/**
 * Jednorázové úpravy strukturovaného plánu před persist / e-mail (data integrity).
 * Nemění vzhled šablon — pouze opravuje rozpor názvu jídla vs. receptu, cviky bez reps/duration.
 */

import {
  mergeWithTrustedRegistryMedia,
  isTrustedExercisedbGifUrl,
  isUntrustedWgerStaticUrl,
} from './exerciseRegistryMedia.js';
import { getCanonicalExercise } from './exerciseCanonicalMap.js';
import {
  exerciseDisplayNameMatchesCanonical,
  normalizeExerciseDisplayFromCanonical,
} from './exerciseIntegrity.js';

export const MAX_PUBLISHABLE_WORKOUT_SETS = 4;

const SKIP_PUBLISHABLE_SETS_CAP = new Set(['warmup', 'cooldown', 'rest', 'stretch']);

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

function capExerciseSetsForPublish(ex) {
  const key = String(ex?.canonical_key || '').trim().toLowerCase();
  if (SKIP_PUBLISHABLE_SETS_CAP.has(key)) return ex;
  const sets = Number(ex?.sets);
  if (!Number.isFinite(sets) || sets <= MAX_PUBLISHABLE_WORKOUT_SETS) return ex;
  return { ...ex, sets: MAX_PUBLISHABLE_WORKOUT_SETS };
}

function ensureExerciseDisplayNames(ex) {
  const key = String(ex?.canonical_key || '').trim().toLowerCase();
  let out = { ...ex };
  const canonical = key ? getCanonicalExercise(key) : null;
  const fallbackName = (canonical?.display_name_cs || '').trim() || (key ? key.replace(/_/g, ' ') : 'Cvik');
  const existing = String(out.display_name_cs || out.name_cs || out.name || '').trim();
  let patched = false;

  if (!existing) {
    out.display_name_cs = fallbackName;
    out.name_cs = fallbackName;
    out.name = fallbackName;
    patched = true;
  } else {
    if (!String(out.display_name_cs || '').trim()) { out.display_name_cs = existing; patched = true; }
    if (!String(out.name_cs || '').trim()) { out.name_cs = out.display_name_cs; patched = true; }
    if (!String(out.name || '').trim()) { out.name = out.display_name_cs; patched = true; }
  }

  const match = exerciseDisplayNameMatchesCanonical(out);
  if (!match.ok && canonical?.display_name_cs) {
    out = normalizeExerciseDisplayFromCanonical(out);
    patched = true;
  }

  return { out, patched };
}

function ensureExercisePublishableMedia(ex) {
  const key = String(ex?.canonical_key || '').trim().toLowerCase();
  const merged = mergeWithTrustedRegistryMedia(key, {
    gif_url: ex?.gif_url,
    image_url: ex?.image_url,
    video_url: ex?.video_url,
    source: ex?.source,
  });
  const out = { ...ex };
  let patched = false;
  if (merged.gif_url && merged.gif_url !== out.gif_url) {
    out.gif_url = merged.gif_url;
    patched = true;
  } else if (!out.gif_url && merged.gif_url) {
    out.gif_url = merged.gif_url;
    patched = true;
  }
  if (merged.video_url && !out.video_url) {
    out.video_url = merged.video_url;
    patched = true;
  }
  if (merged.image_url && !isUntrustedWgerStaticUrl(merged.image_url) && !out.image_url) {
    out.image_url = merged.image_url;
    patched = true;
  }
  if (out.gif_url && isTrustedExercisedbGifUrl(out.gif_url) && (!out.source || out.source === 'none')) {
    out.source = 'exercisedb';
  }
  return { out, patched };
}

/**
 * Před persist: max 4 série, canonical název, trusted GIF/media fallback.
 * @param {object} planJson
 * @returns {{ sets_capped: number, media_patched: number, names_patched: number }}
 */
export function normalizePublishableWorkoutExercisesInPlan(planJson) {
  const stats = { sets_capped: 0, media_patched: 0, names_patched: 0 };
  const days = planJson?.days;
  if (!Array.isArray(days)) return stats;

  for (const day of days) {
    const exs = day?.workout?.exercises;
    if (!Array.isArray(exs)) continue;
    for (let i = 0; i < exs.length; i++) {
      let ex = { ...exs[i] };
      const beforeSets = Number(ex.sets);

      const named = ensureExerciseDisplayNames(ex);
      ex = named.out;
      if (named.patched) stats.names_patched += 1;

      const capped = capExerciseSetsForPublish(ex);
      if (Number.isFinite(beforeSets) && beforeSets > MAX_PUBLISHABLE_WORKOUT_SETS) {
        stats.sets_capped += 1;
      }
      ex = capped;

      const media = ensureExercisePublishableMedia(ex);
      if (media.patched) stats.media_patched += 1;
      ex = media.out;

      exs[i] = ex;
    }
  }

  if (stats.sets_capped > 0 || stats.media_patched > 0 || stats.names_patched > 0) {
    console.info('[planDataIntegrity] publishable workout exercises normalized', stats);
  }
  return stats;
}
