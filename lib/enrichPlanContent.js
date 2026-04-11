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
import { enrichExercise } from './exerciseEnrichment';
import { resolveToCanonicalKey } from './exerciseCanonicalMap';

const MEAL_HEADINGS = ['Snídaně', 'Oběd', 'Večeře', 'Svačina'];
const SKIP_LI_PREFIXES = ['odpočinek', 'lehká procházka', 'trénink celkem'];

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
 * Extract meal descriptions and optional data attributes from plan HTML.
 * Data z vygenerovaného plánu – při zobrazení profilu se Spoonacular nevolá.
 * Returns array of { name, meal_key, recipe_id, image_url, image_trust_level }.
 */
function parseMealNamesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const re = /<p([^>]*)>[\s\S]*?<b[^>]*>(Snídaně|Oběd|Večeře|Svačina)\s*:?\s*<\/b>\s*([^<]*)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1] || '';
    const text = stripHtml(m[3] || '').slice(0, 120);
    if (text.length < 2) continue;
    const keyMatch = tag.match(/data-meal-key\s*=\s*["']([^"']*)["']/i);
    const meal_key = keyMatch ? normalizedKey(keyMatch[1]) : null;
    const recipeIdMatch = tag.match(/data-recipe-id\s*=\s*["'](\d+)["']/i);
    const recipe_id = recipeIdMatch ? parseInt(recipeIdMatch[1], 10) : null;
    const imageUrlMatch = tag.match(/data-image-url\s*=\s*["']([^"']*)["']/i);
    const image_url = imageUrlMatch ? imageUrlMatch[1].trim() : null;
    const imageTrustMatch = tag.match(/data-image-trust-level\s*=\s*["']([^"']*)["']/i);
    const image_trust_level = imageTrustMatch ? imageTrustMatch[1].trim() : 'none';
    out.push({ name: text, meal_key, recipe_id, image_url, image_trust_level });
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
 * Returns array of { name, exercise_key }. exercise_key is set from data-exercise-key when present; otherwise null.
 * Dedupe is by canonical key (exercise_key || normalizedKey(name)); fallback to text is secondary.
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
      let exercise_key = null;
      const keyMatch = (m[1] || '').match(/data-exercise-key\s*=\s*["']([^"']*)["']/i);
      if (keyMatch) exercise_key = normalizedKey(keyMatch[1]);
      else if (lower.startsWith('rozcvička') || lower.startsWith('rozcvicka')) exercise_key = 'warmup';
      else if (lower.startsWith('závěr') || lower.startsWith('zaver')) exercise_key = 'cooldown';
      const wgerMatch = (m[1] || '').match(/data-wger-exercise-id\s*=\s*["'](\d+)["']/i);
      const wgerParsed = wgerMatch ? parseInt(wgerMatch[1], 10) : NaN;
      const wger_exercise_id = Number.isFinite(wgerParsed) ? wgerParsed : null;
      const dedupe = exercise_key || normalizedKey(name);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ name, exercise_key, wger_exercise_id });
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
  for (const { name, meal_key, recipe_id, image_url, image_trust_level } of mealEntries) {
    const key = meal_key || normalizedKey(name);
    if (seenMealKey.has(key)) continue;
    seenMealKey.add(key);
    meals.push({
      query_name: name,
      meal_key: key,
      name: name,
      image_url: image_url || null,
      image_trust_level: image_trust_level || 'none',
      exact_source: image_trust_level === 'exact' ? 'spoonacular' : null,
      illustrative_source: null,
      confidence_score: image_trust_level === 'exact' ? 1 : 0,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      recipe_id: recipe_id ?? null,
      source: image_url ? 'spoonacular' : 'none',
    });
  }

  const exercises = [];
  for (const { name, exercise_key, wger_exercise_id } of exerciseEntries) {
    try {
      const enriched = await enrichExercise(name, { wger_exercise_id: wger_exercise_id ?? undefined });
      const canonicalKey = enriched.canonical_key ?? resolveToCanonicalKey(name) ?? exercise_key;
      exercises.push({
        ...enriched,
        canonical_key: canonicalKey,
        query_name: name,
        exercise_key: exercise_key ?? canonicalKey,
        wger_exercise_id: enriched.wger_exercise_id ?? wger_exercise_id ?? null,
      });
    } catch {
      // Keep exercises array intact on partial failure
    }
  }

  return { html: outHtml, meals, exercises };
}
