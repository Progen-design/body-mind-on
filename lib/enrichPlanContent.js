/**
 * Enrich plan HTML with meal and exercise metadata from external APIs.
 * Does NOT modify the original HTML; returns enrichment as a side structure for UI (profile meal cards, exercise cards, GIF previews, dynamic content detail views).
 * Do NOT inject remote images into HTML/email – email rendering can break; keep enriched media only in enrichment object.
 */
import { enrichMeal } from './mealEnrichment';
import { enrichExercise } from './exerciseEnrichment';

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

/** Extract meal descriptions from plan HTML (after Snídaně/Oběd/Večeře). */
function parseMealNamesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const names = new Set();
  for (const heading of MEAL_HEADINGS) {
    const re = new RegExp(`(?:<[^>]*>|\\b)${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?[^<]*</[^>]*>([^<]*)`, 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      const text = stripHtml(m[1] || '').slice(0, 120);
      if (text && text.length > 2) names.add(text);
    }
    const re2 = new RegExp(`${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?\\s*([^<]+)`, 'gi');
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
  const ulMatch = html.match(/<p[^>]*>\s*<b[^>]*>\s*Trénink tento den[^<]*<\/b>\s*<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi);
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
  const anyLiRe = /<h[34][^>]*>[^<]*Trénink[^<]*<\/h[34]>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi;
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
 * Enrich plan: parse meals and exercises from HTML, call external APIs, return enrichment metadata.
 * Original html is returned unchanged; meals and exercises arrays hold enriched data for future UI.
 * @param {{ html?: string, parsedPlan?: object }} options
 * @returns {Promise<{ html: string, meals: Array<object>, exercises: Array<object> }>}
 */
export async function enrichPlanContent({ html = '', parsedPlan = null } = {}) {
  const outHtml = html && typeof html === 'string' ? html : '';
  const mealNames = parseMealNamesFromHtml(outHtml);
  const exerciseNames = parseExerciseNamesFromHtml(outHtml);

  const meals = [];
  const exercises = [];

  try {
    for (const name of mealNames) {
      const enriched = await enrichMeal(name);
      meals.push(enriched);
    }
  } catch (err) {
    // keep meals as-is on partial failure
  }

  try {
    for (const name of exerciseNames) {
      const enriched = await enrichExercise(name);
      exercises.push(enriched);
    }
  } catch (err) {
    // keep exercises as-is on partial failure
  }

  return { html: outHtml, meals, exercises };
}
