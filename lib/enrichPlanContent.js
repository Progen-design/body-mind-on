/**
 * lib/enrichPlanContent.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Enrich plan HTML with meal and exercise metadata from external APIs.
 *
 * IMPORTANT:
 *   Does NOT modify the original HTML. Returns enrichment as a side structure.
 *   Do NOT inject remote images into HTML/email – email rendering can break.
 *   Keep enriched media only in the enrichment object (for profile UI only).
 *
 * TRUST PASSTHROUGH:
 *   Each meal object now carries full trust metadata:
 *     { image_trust_level, exact_source, illustrative_source, confidence_score }
 *   Each exercise object now carries:
 *     { canonical_key, trust_level, source }
 *   This allows the UI to display labels like "Přesný zdroj" / "Ilustrační foto" / "Ověřený cvik".
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { enrichMeal } from './mealEnrichment';
import { enrichExercise } from './exerciseEnrichment';
import { resolveToCanonicalKey } from './exerciseCanonicalMap';

const MEAL_HEADINGS = ['Snídaně', 'Oběd', 'Večeře'];
const KNOWN_EXERCISES = [
  'Dřepy', 'Kliky', 'Přítahy v předklonu', 'Mrtvý tah', 'Rumunský mrtvý tah',
  'Bench press', 'Tlaky', 'Prkno', 'Výpady', 'Rozcvička', 'Závěr',
];
const SKIP_LI_PREFIXES = ['odpočinek', 'lehká procházka', 'trénink celkem', 'rozcvička', 'závěr'];

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize key for lookup (lowercase, no diacritics, single spaces). */
function normalizedKey(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract meal descriptions and optional data-meal-key from plan HTML.
 * Returns array of { name, meal_key } (meal_key from data-meal-key if present).
 */
function parseMealNamesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const re = /<p([^>]*)>[\s\S]*?<b[^>]*>(Snídaně|Oběd|Večeře)\s*:?\s*<\/b>\s*([^<]*)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1] || '';
    const text = stripHtml(m[3] || '').slice(0, 120);
    if (text.length < 2) continue;
    const keyMatch = tag.match(/data-meal-key\s*=\s*["']([^"']*)["']/i);
    const meal_key = keyMatch ? normalizedKey(keyMatch[1]) : null;
    out.push({ name: text, meal_key });
  }
  if (out.length > 0) return out;
  for (const heading of MEAL_HEADINGS) {
    const re2 = new RegExp(
      `(?:<[^>]*>|\\b)${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?[^<]*</[^>]*>([^<]*)`,
      'gi'
    );
    while ((m = re2.exec(html)) !== null) {
      const text = stripHtml(m[1] || '').slice(0, 120);
      if (text && text.length > 2) out.push({ name: text, meal_key: null });
    }
    const re3 = new RegExp(
      `${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?\\s*([^<]+)`,
      'gi'
    );
    while ((m = re3.exec(html)) !== null) {
      const text = stripHtml(m[1] || '').slice(0, 120);
      if (text && text.length > 2) out.push({ name: text, meal_key: null });
    }
  }
  return out;
}

/**
 * Extract exercise names and optional data-exercise-key from training section.
 * Returns array of { name, exercise_key } (exercise_key from data-exercise-key if present).
 */
function parseExerciseNamesFromHtml(html) {
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
      const keyMatch = (m[1] || '').match(/data-exercise-key\s*=\s*["']([^"']*)["']/i);
      const exercise_key = keyMatch ? normalizedKey(keyMatch[1]) : null;
      const dedupe = exercise_key || name;
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

  const anyLiRe =
    /<h[34][^>]*>[^<]*Trénink[^<]*<\/h[34]>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  let m;
  while ((m = anyLiRe.exec(html)) !== null) processLiBlock(m[1]);

  return out;
}

/**
 * Enrich plan content: parse meals and exercises from HTML, resolve trust-aware metadata.
 * Original HTML is returned unchanged.
 * Enrichment result includes full trust metadata for downstream UI rendering.
 *
 * @param {{ html?: string, parsedPlan?: object }} options
 * @returns {Promise<{
 *   html: string,
 *   meals: Array<{
 *     query_name: string,
 *     name: string,
 *     image_url: string|null,
 *     source: string,
 *     image_trust_level: "exact"|"illustrative"|"none",
 *     exact_source: "spoonacular"|null,
 *     illustrative_source: "pexels"|null,
 *     confidence_score: number,
 *     calories: number|null,
 *     protein_g: number|null,
 *     carbs_g: number|null,
 *     fat_g: number|null
 *   }>,
 *   exercises: Array<{
 *     query_name: string,
 *     name: string,
 *     canonical_key: string|null,
 *     image_url: string|null,
 *     gif_url: string|null,
 *     body_part: string|null,
 *     target: string|null,
 *     equipment: string|null,
 *     source: string,
 *     trust_level: "exact"|"fallback"|"none"
 *   }>
 * }>}
 */
export async function enrichPlanContent({ html = '', parsedPlan = null } = {}) {
  const outHtml = html && typeof html === 'string' ? html : '';
  const mealEntries = parseMealNamesFromHtml(outHtml);
  const exerciseEntries = parseExerciseNamesFromHtml(outHtml);

  const meals = [];
  const seenMealKey = new Set();
  for (const { name, meal_key } of mealEntries) {
    const key = meal_key || normalizedKey(name);
    if (seenMealKey.has(key)) continue;
    seenMealKey.add(key);
    try {
      const enriched = await enrichMeal(name);
      meals.push({ ...enriched, query_name: name, meal_key: key });
    } catch {
      // Keep meals array intact on partial failure
    }
  }

  const exercises = [];
  for (const { name, exercise_key } of exerciseEntries) {
    try {
      const enriched = await enrichExercise(name);
      const canonicalKey = enriched.canonical_key ?? resolveToCanonicalKey(name) ?? exercise_key;
      exercises.push({
        ...enriched,
        canonical_key: canonicalKey,
        query_name: name,
        exercise_key: exercise_key ?? canonicalKey,
      });
    } catch {
      // Keep exercises array intact on partial failure
    }
  }

  return { html: outHtml, meals, exercises };
}
