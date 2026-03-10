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

/** Extract meal descriptions from plan HTML (after Snídaně/Oběd/Večeře headings). */
function parseMealNamesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const names = new Set();
  for (const heading of MEAL_HEADINGS) {
    const re = new RegExp(
      `(?:<[^>]*>|\\b)${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?[^<]*</[^>]*>([^<]*)`,
      'gi'
    );
    let m;
    while ((m = re.exec(html)) !== null) {
      const text = stripHtml(m[1] || '').slice(0, 120);
      if (text && text.length > 2) names.add(text);
    }
    const re2 = new RegExp(
      `${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?\\s*([^<]+)`,
      'gi'
    );
    while ((m = re2.exec(html)) !== null) {
      const text = stripHtml(m[1] || '').slice(0, 120);
      if (text && text.length > 2) names.add(text);
    }
  }
  return Array.from(names);
}

/** Extract exercise names from training section (Trénink tento den <ul><li>...). */
function parseExerciseNamesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const names = new Set();

  const ulMatch = html.match(
    /<p[^>]*>\s*<b[^>]*>\s*Trénink tento den[^<]*<\/b>\s*<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi
  );
  if (ulMatch) {
    for (const block of ulMatch) {
      const liRe = /<li[^>]*>([^<]+)<\/li>/gi;
      let m;
      while ((m = liRe.exec(block)) !== null) {
        const raw = stripHtml(m[1] || '');
        const lower = raw.toLowerCase();
        if (SKIP_LI_PREFIXES.some((p) => lower.startsWith(p))) continue;
        const name = raw.split(':')[0].trim().slice(0, 80);
        if (name && name.length > 1) names.add(name);
      }
    }
  }

  const anyLiRe =
    /<h[34][^>]*>[^<]*Trénink[^<]*<\/h[34]>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  let m;
  while ((m = anyLiRe.exec(html)) !== null) {
    const liRe2 = /<li[^>]*>([^<]+)<\/li>/gi;
    let m2;
    while ((m2 = liRe2.exec(m[1])) !== null) {
      const raw = stripHtml(m2[1] || '');
      const lower = raw.toLowerCase();
      if (SKIP_LI_PREFIXES.some((p) => lower.startsWith(p))) continue;
      const name = raw.split(':')[0].trim().slice(0, 80);
      if (name && name.length > 1) names.add(name);
    }
  }

  return Array.from(names);
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
  const mealNames = parseMealNamesFromHtml(outHtml);
  const exerciseNames = parseExerciseNamesFromHtml(outHtml);

  const meals = [];
  const exercises = [];

  for (const name of mealNames) {
    try {
      const enriched = await enrichMeal(name);
      meals.push({ ...enriched, query_name: name });
    } catch {
      // Keep meals array intact on partial failure
    }
  }

  for (const name of exerciseNames) {
    try {
      const enriched = await enrichExercise(name);
      // Also attach canonical_key resolved at parse time (resolveToCanonicalKey is synchronous)
      const canonicalKey = enriched.canonical_key ?? resolveToCanonicalKey(name);
      exercises.push({ ...enriched, canonical_key: canonicalKey, query_name: name });
    } catch {
      // Keep exercises array intact on partial failure
    }
  }

  return { html: outHtml, meals, exercises };
}
