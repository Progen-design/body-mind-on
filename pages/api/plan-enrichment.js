/**
 * POST /api/plan-enrichment
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns enriched meal images and exercise media for a given plan HTML.
 * Cache: in-memory by plan_html hash, TTL 5 min – snižuje opakované volání při stejném plánu.
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

/** Produce extra lookup keys from normalized meal name so PlanViewer can match e.g. "Kuřecí prsa s rýží a zeleninou" to enrichment "Kuřecí prsa s rýží". */
function mealKeyVariants(normalized) {
  if (!normalized || typeof normalized !== 'string') return [];
  const out = [normalized];
  let s = normalized.trim();
  while (s.length > 10) {
    const m = s.match(/\s+(?:a|s)\s+[a-z0-9]+$/);
    if (!m) break;
    s = s.slice(0, m.index).trim();
    if (s.length > 3) out.push(s);
  }
  return out;
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

    const hasSpoonacular = !!(process.env.SPOONACULAR_API_KEY || process.env.RAPIDAPI_KEY);
    const hasPexels = !!process.env.PEXELS_API_KEY;
    const hasExerciseDb = !!(process.env.EXERCISEDB_API_KEY || process.env.RAPIDAPI_KEY);
    const hasExerciseDbHost = !!(process.env.EXERCISEDB_API_HOST || process.env.RAPIDAPI_KEY);
    if (!hasSpoonacular) {
      console.warn('[plan-enrichment] SPOONACULAR_API_KEY or RAPIDAPI_KEY missing – meal exact images will be none/placeholder');
    }
    if (!hasPexels) {
      console.warn('[plan-enrichment] PEXELS_API_KEY missing – illustrative fallbacks will be unavailable');
    }
    if (!hasExerciseDb) {
      console.warn('[plan-enrichment] EXERCISEDB_API_KEY or RAPIDAPI_KEY missing – exercise media will be none/placeholder');
    }
    if (hasExerciseDb && !hasExerciseDbHost) {
      console.warn('[plan-enrichment] EXERCISEDB_API_HOST not set – ExerciseDB may fail (use RAPIDAPI host or set EXERCISEDB_API_HOST)');
    }
    if (!hasSpoonacular || !hasPexels || !hasExerciseDb || (hasExerciseDb && !hasExerciseDbHost)) {
      console.info('[plan-enrichment] ENV summary:', { hasSpoonacular, hasPexels, hasExerciseDb, hasExerciseDbHost });
    }

    const cacheKey = simpleHash(html);
    const cached = enrichmentCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ENRICHMENT_CACHE_TTL_MS) {
      return res.status(200).json({
        ...cached.payload,
        _diagnostics: {
          ...cached.payload._diagnostics,
          enrichment_cached: true,
          cache_hit: true,
        },
      });
    }

    const enriched = await enrichPlanContent({ html });

    // meal_images: backward-compatible map of key → url string (used by current PlanViewer)
    const mealImages = {};
    // meal_trust: full trust metadata map for future UI trust labels (PART 7 — backend ready)
    const mealTrust = {};

    for (const meal of enriched.meals || []) {
      const trustObj = {
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
      // PRIORITY 1: canonical meal_key from HTML (data-meal-key)
      const primaryKey = meal?.meal_key && normalizeTextKey(meal.meal_key) ? normalizeTextKey(meal.meal_key) : null;
      if (primaryKey) {
        if (meal?.image_url) mealImages[primaryKey] = meal.image_url;
        mealTrust[primaryKey] = trustObj;
      }
      // Fallback: query_name, name, mealKeyVariants for backward compatibility and frontend lookup
      const rawCandidates = new Set([meal?.query_name, meal?.name].filter(Boolean));
      if (meal?.query_name && meal.query_name.length > 1) rawCandidates.add(meal.query_name.slice(0, 80).trim());
      const candidates = new Set();
      for (const raw of rawCandidates) {
        const key = normalizeTextKey(raw);
        if (key) candidates.add(key);
        for (const v of mealKeyVariants(key)) candidates.add(v);
      }
      for (const key of candidates) {
        if (!key) continue;
        if (meal?.image_url && !mealImages[key]) mealImages[key] = meal.image_url;
        if (!mealTrust[key]) mealTrust[key] = trustObj;
      }
    }

    // exercise_media: extended with canonical_key and trust_level for UI trust badges
    const exerciseMedia = {};

    for (const ex of enriched.exercises || []) {
      const media = {
        image_url: ex?.image_url || null,
        gif_url: ex?.gif_url || null,
        source: ex?.source || 'none',
        canonical_key: ex?.canonical_key || null,
        trust_level: ex?.trust_level || 'none',
        body_part: ex?.body_part || null,
        target: ex?.target || null,
        equipment: ex?.equipment || null,
      };
      // PRIORITY 1: canonical exercise_key from HTML (data-exercise-key)
      const primaryKey = ex?.exercise_key && normalizeTextKey(ex.exercise_key) ? normalizeTextKey(ex.exercise_key) : null;
      if (primaryKey && !exerciseMedia[primaryKey]) {
        exerciseMedia[primaryKey] = media;
      }
      const rawCandidates = new Set([ex?.query_name, ex?.name].filter(Boolean));
      if (ex?.canonical_key) rawCandidates.add(ex.canonical_key);
      if (ex?.exercise_key) rawCandidates.add(ex.exercise_key);
      const firstWord = (ex?.query_name || '').trim().split(/\s+/)[0];
      if (firstWord && firstWord.length > 1) rawCandidates.add(firstWord);
      if (ex?.query_name && ex.query_name.length > 1) rawCandidates.add(ex.query_name.slice(0, 60).trim());
      const keysToSet = new Set();
      for (const raw of rawCandidates) {
        const key = normalizeTextKey(raw);
        if (key) keysToSet.add(key);
      }
      for (const key of keysToSet) {
        if (!key || exerciseMedia[key]) continue;
        exerciseMedia[key] = media;
      }
    }

    const mealKeysCount = new Set((enriched.meals || []).map((m) => m?.meal_key).filter(Boolean)).size;
    const exercisesWithKey = (enriched.exercises || []).filter((e) => e?.exercise_key).length;
    const exercisesByText = (enriched.exercises || []).length - exercisesWithKey;

    const mealsExact = (enriched.meals || []).filter((m) => (m?.image_trust_level ?? 'none') === 'exact').length;
    const mealsIllustrative = (enriched.meals || []).filter((m) => (m?.image_trust_level ?? 'none') === 'illustrative').length;
    const mealsNone = (enriched.meals || []).filter((m) => (m?.image_trust_level ?? 'none') === 'none').length;
    const exercisesExact = (enriched.exercises || []).filter((e) => (e?.trust_level ?? 'none') === 'exact').length;
    const exercisesFallback = (enriched.exercises || []).filter((e) => (e?.trust_level ?? 'none') === 'fallback').length;
    const exercisesNone = (enriched.exercises || []).filter((e) => (e?.trust_level ?? 'none') === 'none').length;

    const payload = {
      ok: true,
      meal_images: mealImages,
      meal_trust: mealTrust,
      exercise_media: exerciseMedia,
      _diagnostics: {
        meal_keys_count: mealKeysCount,
        exercise_keys_count: Object.keys(exerciseMedia).length,
        exercises_lookup_by_key: exercisesWithKey,
        exercises_lookup_by_text: exercisesByText,
        meals_exact_count: mealsExact,
        meals_illustrative_count: mealsIllustrative,
        meals_none_count: mealsNone,
        exercises_exact_count: exercisesExact,
        exercises_fallback_count: exercisesFallback,
        exercises_none_count: exercisesNone,
        enrichment_cached: false,
        cache_hit: false,
      },
    };
    enrichmentCache.set(cacheKey, { payload, at: Date.now() });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[plan-enrichment] error:', err);
    return res.status(500).json({ error: 'Failed to enrich plan media' });
  }
}
