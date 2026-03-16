/**
 * lib/validatePlanTruth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Publish gate: ověří, že plán obsahuje jen entity, které umíme bezpečně publikovat.
 *
 * Plán je publish-safe jen když:
 * - všechna jídla jsou normalizovatelná (meal_key nebo normalizovatelný název)
 * - všechny konkrétní cviky mapují na canonical key
 * - strukturální položky (Odpočinek, Rozcvička, Závěr, Lehká procházka) jsou vždy OK
 *
 * Výstup: truth_check_passed, unpublishable_meals, unpublishable_exercises,
 * meals_exact_count, exercises_exact_count, atd.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { resolveToCanonicalKey } from './exerciseCanonicalMap';
import { normalizeMealQueryCs } from './mealNormalization';

const MEAL_HEADINGS = ['Snídaně', 'Oběd', 'Večeře'];
const SKIP_LI_PREFIXES = ['odpočinek', 'lehká procházka', 'trénink celkem', 'závěr', 'zaver'];

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedKey(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrahuje jídla z HTML. */
function parseMealsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const re = /<p([^>]*)>[\s\S]*?<b[^>]*>(Snídaně|Oběd|Večeře)\s*:?\s*<\/b>\s*([^<]*)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripHtml(m[3] || '').slice(0, 120);
    if (text.length < 2) continue;
    const keyMatch = (m[1] || '').match(/data-meal-key\s*=\s*["']([^"']*)["']/i);
    const meal_key = keyMatch ? normalizedKey(keyMatch[1]) : null;
    out.push({ name: text, meal_key });
  }
  return out;
}

/** Extrahuje cviky z bloků „Trénink tento den“. */
function parseExercisesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const seen = new Set();

  function processLiBlock(blockHtml) {
    const liRe = /<li([^>]*)>([^<]+)<\/li>/gi;
    let m;
    while ((m = liRe.exec(blockHtml)) !== null) {
      const raw = stripHtml(m[2] || '');
      const lower = raw.toLowerCase();
      if (SKIP_LI_PREFIXES.some((p) => lower.startsWith(p))) continue;
      const name = raw.split(':')[0].trim().slice(0, 80);
      if (!name || name.length < 2) continue;
      let exercise_key = null;
      const keyMatch = (m[1] || '').match(/data-exercise-key\s*=\s*["']([^"']*)["']/i);
      if (keyMatch) exercise_key = normalizedKey(keyMatch[1]);
      else if (lower.startsWith('rozcvička') || lower.startsWith('rozcvicka')) exercise_key = 'warmup';
      else if (lower.startsWith('závěr') || lower.startsWith('zaver')) exercise_key = 'cooldown';
      const dedupe = exercise_key || normalizedKey(name);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ name, exercise_key });
    }
  }

  const ulMatch = html.match(
    /<p[^>]*>\s*<b[^>]*>\s*Trénink tento den[^<]*<\/b>\s*<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi
  );
  if (ulMatch) {
    for (const block of ulMatch) processLiBlock(block);
  }
  return out;
}

/** Vrací pro každý den (0–6) seznam exercise keys v pořadí. Rest day = prázdné pole. */
function getTrainingBlocksPerDay(html) {
  if (!html || typeof html !== 'string') return [];
  const blocks = html.match(
    /<p[^>]*>\s*<b[^>]*>\s*Trénink tento den[^<]*<\/b>\s*<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi
  ) || [];
  const out = [];
  for (const block of blocks) {
    const keys = [];
    const liRe = /<li([^>]*)>([^<]+)<\/li>/gi;
    let m;
    while ((m = liRe.exec(block)) !== null) {
      const raw = stripHtml(m[2] || '').toLowerCase();
      if (SKIP_LI_PREFIXES.some((p) => raw.startsWith(p))) continue;
      const keyMatch = (m[1] || '').match(/data-exercise-key\s*=\s*["']([^"']*)["']/i);
      if (keyMatch) keys.push(normalizedKey(keyMatch[1]));
      else if (raw.startsWith('rozcvička') || raw.startsWith('rozcvicka')) keys.push('warmup');
      else if (raw.startsWith('závěr') || raw.startsWith('zaver')) keys.push('cooldown');
      else keys.push(normalizedKey((m[2] || '').split(':')[0].trim()));
    }
    out.push(keys);
  }
  return out;
}

/** Extrahuje text sekce Suplementace (až do dalšího h3). */
function extractSupplementSection(html) {
  if (!html || typeof html !== 'string') return '';
  const match = html.match(/<h3[^>]*>\s*Suplementace\s*<\/h3>\s*([\s\S]*?)(?=<h3|$)/i);
  return stripHtml(match ? match[1] : '').trim();
}

/** Generické šablony suplementace bez kontextu (krátké / fixní). */
const GENERIC_SUPPLEMENT_PHRASES = [
  'multivitamin, d, omega-3 dle potřeby',
  'b12, d, omega-3 z řas',
  'b12, d, železo',
  'multivitamin d omega-3',
  'b12 d železo',
  'dle potřeby',
];

function isGenericSupplement(text) {
  if (!text || text.length < 25) return true;
  const norm = text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');
  return GENERIC_SUPPLEMENT_PHRASES.some((p) => norm.includes(p) && norm.length < 80);
}

/**
 * Ověří, zda je jídlo publish-safe.
 * Publish-safe = normalizovatelný název (min 3 znaky po normalizaci).
 */
function isMealPublishable(meal) {
  const key = meal.meal_key || normalizedKey(meal.name);
  const norm = normalizeMealQueryCs(meal.name);
  return (key && key.length >= 3) || (norm && norm.length >= 3);
}

/**
 * Ověří, zda je cvik publish-safe.
 * Publish-safe = mapuje na canonical key (resolveToCanonicalKey vrací hodnotu).
 */
function isExercisePublishable(exercise) {
  const canonicalKey = exercise.exercise_key
    ? (resolveToCanonicalKey(exercise.exercise_key) || resolveToCanonicalKey(exercise.name))
    : resolveToCanonicalKey(exercise.name);
  return Boolean(canonicalKey);
}

/**
 * Validace truth-safe plánu.
 * @param {string} html - Plan HTML
 * @param {object} enrichmentResult - Volitelně výsledek enrichPlanContent pro counts
 * @returns {{
 *   truth_check_passed: boolean,
 *   truth_check_reason: string|null,
 *   unpublishable_meals: string[],
 *   unpublishable_exercises: string[],
 *   meals_exact_count: number,
 *   meals_illustrative_count: number,
 *   meals_none_count: number,
 *   exercises_exact_count: number,
 *   exercises_fallback_count: number,
 *   exercises_none_count: number,
 *   publishable_meals_count: number,
 *   publishable_exercises_count: number,
 * }}
 */
export function validatePlanTruth(html, enrichmentResult = null) {
  const meals = parseMealsFromHtml(html || '');
  const exercises = parseExercisesFromHtml(html || '');

  const unpublishable_meals = [];
  const unpublishable_exercises = [];

  for (const m of meals) {
    if (!isMealPublishable(m)) unpublishable_meals.push(m.name || m.meal_key || '?');
  }

  for (const ex of exercises) {
    if (!isExercisePublishable(ex)) unpublishable_exercises.push(ex.name || ex.exercise_key || '?');
  }

  // Meal repetition: stejné jídlo (normalizovaný název) 3+× v týdnu v tomtéž slotu (snídaně/oběd/večeře)
  const repetitive_meals = [];
  if (meals.length >= 21) {
    for (const slot of [0, 1, 2]) {
      const countByKey = {};
      for (let i = slot; i < meals.length; i += 3) {
        const key = normalizedKey(meals[i].name) || normalizedKey(meals[i].meal_key) || '';
        if (key.length >= 2) countByKey[key] = (countByKey[key] || 0) + 1;
      }
      for (const [key, count] of Object.entries(countByKey)) {
        if (count >= 3) repetitive_meals.push(key);
      }
    }
  }

  // Training repetition: dny s identickým seznamem cviků (exercise keys)
  const repetitive_training_days = [];
  const blocksPerDay = getTrainingBlocksPerDay(html || '');
  const dayKeys = blocksPerDay.map((keys) => keys.join('|'));
  for (let i = 0; i < dayKeys.length; i++) {
    for (let j = i + 1; j < dayKeys.length; j++) {
      if (dayKeys[i].length >= 2 && dayKeys[i] === dayKeys[j]) {
        if (!repetitive_training_days.includes(i)) repetitive_training_days.push(i);
        if (!repetitive_training_days.includes(j)) repetitive_training_days.push(j);
      }
    }
  }
  repetitive_training_days.sort((a, b) => a - b);

  // Suplementace: příliš generická bez odůvodnění v kontextu
  const unjustified_supplements = [];
  const supplementText = extractSupplementSection(html || '');
  if (supplementText && isGenericSupplement(supplementText)) {
    unjustified_supplements.push(supplementText.slice(0, 120));
  }

  let meals_exact_count = 0;
  let meals_illustrative_count = 0;
  let meals_none_count = 0;
  let exercises_exact_count = 0;
  let exercises_fallback_count = 0;
  let exercises_none_count = 0;

  if (enrichmentResult?.meals) {
    for (const m of enrichmentResult.meals) {
      const t = m.image_trust_level || 'none';
      if (t === 'exact') meals_exact_count++;
      else if (t === 'illustrative') meals_illustrative_count++;
      else meals_none_count++;
    }
  }

  if (enrichmentResult?.exercises) {
    for (const e of enrichmentResult.exercises) {
      const t = e.trust_level || 'none';
      if (t === 'exact') exercises_exact_count++;
      else if (t === 'fallback') exercises_fallback_count++;
      else exercises_none_count++;
    }
  }

  const truth_check_passed =
    unpublishable_meals.length === 0 && unpublishable_exercises.length === 0;
  const truth_check_reason = truth_check_passed
    ? null
    : [
        unpublishable_meals.length ? `unpublishable_meals: ${unpublishable_meals.join(', ')}` : null,
        unpublishable_exercises.length ? `unpublishable_exercises: ${unpublishable_exercises.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('; ') || 'unknown';

  /** Soft gate: plán je vhodný k publikaci bez retry, pokud není příliš repetitivní ani šablonovitý. */
  const soft_gate_passed =
    repetitive_meals.length === 0 &&
    repetitive_training_days.length === 0 &&
    unjustified_supplements.length === 0;
  const soft_gate_reason = soft_gate_passed
    ? null
    : [
        repetitive_meals.length ? `repetitive_meals: ${repetitive_meals.slice(0, 5).join(', ')}` : null,
        repetitive_training_days.length ? `repetitive_training_days: dny ${repetitive_training_days.join(', ')}` : null,
        unjustified_supplements.length ? `unjustified_supplements: šablonovitý text` : null,
      ]
        .filter(Boolean)
        .join('; ') || 'unknown';

  return {
    truth_check_passed,
    truth_check_reason,
    soft_gate_passed,
    soft_gate_reason,
    unpublishable_meals,
    unpublishable_exercises,
    repetitive_meals: [...new Set(repetitive_meals)],
    repetitive_training_days,
    unjustified_supplements,
    meals_exact_count,
    meals_illustrative_count,
    meals_none_count,
    exercises_exact_count,
    exercises_fallback_count,
    exercises_none_count,
    publishable_meals_count: meals.length - unpublishable_meals.length,
    publishable_exercises_count: exercises.length - unpublishable_exercises.length,
  };
}
