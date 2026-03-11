/**
 * POST /api/plan-enrichment
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns enriched meal images and exercise media for a given plan HTML.
 *
 * RESPONSE:
 *   meal_images      { [normalized_key]: url_string }   — backward-compatible, used by PlanViewer
 *   meal_trust       { [normalized_key]: TrustObject }  — full trust metadata for future UI labels
 *   exercise_media   { [normalized_key]: MediaObject }  — includes canonical_key and trust_level
 *
 * TRUST FIELDS (PART 7 — backend-ready for UI labels):
 *   meal_trust[key].image_trust_level   "exact" | "illustrative" | "none"
 *   meal_trust[key].exact_source        "spoonacular" | null
 *   meal_trust[key].illustrative_source "pexels" | null
 *   meal_trust[key].confidence_score    0..1
 *   exercise_media[key].canonical_key   canonical exercise identifier
 *   exercise_media[key].trust_level     "exact" | "fallback" | "none"
 *   exercise_media[key].source          "exercisedb" | "pexels" | "none"
 *
 * UI can use these to show labels like:
 *   "Přesný zdroj" (exact), "Ilustrační foto" (illustrative), "Ověřený cvik" (exact exercise)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabaseServer } from '../../lib/supabaseServer';
import { enrichPlanContent } from '../../lib/enrichPlanContent';

function normalizeTextKey(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAuthToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = getAuthToken(req);
    if (!token) return res.status(401).json({ error: 'Authorization required' });

    const {
      data: { user },
      error: userErr,
    } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });

    const html = typeof req.body?.html === 'string' ? req.body.html : '';
    if (!html.trim()) {
      return res.status(400).json({ error: 'html is required' });
    }

    if (!process.env.SPOONACULAR_API_KEY && !process.env.RAPIDAPI_KEY) {
      console.warn('[plan-enrichment] SPOONACULAR_API_KEY or RAPIDAPI_KEY missing – meal exact images may be unavailable');
    }
    if (!process.env.PEXELS_API_KEY) {
      console.warn('[plan-enrichment] PEXELS_API_KEY missing – illustrative meal/exercise fallbacks may be unavailable');
    }
    if (!process.env.EXERCISEDB_API_KEY && !process.env.RAPIDAPI_KEY) {
      console.warn('[plan-enrichment] EXERCISEDB_API_KEY or RAPIDAPI_KEY missing – exercise media may be unavailable');
    }

    const enriched = await enrichPlanContent({ html });

    // meal_images: backward-compatible map of key → url string (used by current PlanViewer)
    const mealImages = {};
    // meal_trust: full trust metadata map for future UI trust labels (PART 7 — backend ready)
    const mealTrust = {};

    for (const meal of enriched.meals || []) {
      const candidates = new Set([meal?.query_name, meal?.name].filter(Boolean));
      if (meal?.query_name && meal.query_name.length > 1) {
        candidates.add(meal.query_name.slice(0, 80).trim());
      }
      for (const candidate of candidates) {
        const key = normalizeTextKey(candidate);
        if (!key) continue;
        if (meal?.image_url && !mealImages[key]) {
          mealImages[key] = meal.image_url;
        }
        if (!mealTrust[key]) {
          mealTrust[key] = {
            image_url: meal.image_url ?? null,
            image_trust_level: meal.image_trust_level ?? 'none',
            exact_source: meal.exact_source ?? null,
            illustrative_source: meal.illustrative_source ?? null,
            confidence_score: meal.confidence_score ?? 0,
            calories: meal.calories ?? null,
            protein_g: meal.protein_g ?? null,
            carbs_g: meal.carbs_g ?? null,
            fat_g: meal.fat_g ?? null,
          };
        }
      }
    }

    // exercise_media: extended with canonical_key and trust_level for UI trust badges
    const exerciseMedia = {};

    for (const ex of enriched.exercises || []) {
      const media = {
        image_url: ex?.image_url || null,
        gif_url: ex?.gif_url || null,
        source: ex?.source || 'none',
        // Trust metadata — UI may display "Ověřený cvik" or "Ilustrační foto"
        canonical_key: ex?.canonical_key || null,
        trust_level: ex?.trust_level || 'none',
        body_part: ex?.body_part || null,
        target: ex?.target || null,
        equipment: ex?.equipment || null,
      };

      const candidates = new Set([ex?.query_name, ex?.name].filter(Boolean));
      if (ex?.canonical_key) candidates.add(ex.canonical_key);
      const firstWord = (ex?.query_name || '').trim().split(/\s+/)[0];
      if (firstWord && firstWord.length > 1) candidates.add(firstWord);
      if (ex?.query_name && ex.query_name.length > 1) {
        candidates.add(ex.query_name.slice(0, 60).trim());
      }

      for (const candidate of candidates) {
        const key = normalizeTextKey(candidate);
        if (!key || exerciseMedia[key]) continue;
        exerciseMedia[key] = media;
      }
    }

    return res.status(200).json({
      ok: true,
      meal_images: mealImages,
      meal_trust: mealTrust,
      exercise_media: exerciseMedia,
    });
  } catch (err) {
    console.error('[plan-enrichment] error:', err);
    return res.status(500).json({ error: 'Failed to enrich plan media' });
  }
}
