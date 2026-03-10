/**
 * lib/exerciseEnrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercise enrichment via canonical mapping → ExerciseDB (GIF, body part, target)
 * → Pexels (image fallback if no GIF available).
 *
 * TRUST MODEL:
 *   trust_level: "exact"    → from exercise_asset_registry or ExerciseDB after canonical lookup
 *   trust_level: "fallback" → from Pexels (fitness image, illustrative, not guaranteed exact)
 *   trust_level: "none"     → no visual available
 *
 * KEY DESIGN PRINCIPLE:
 *   Every supported exercise maps to one canonical_key (lib/exerciseCanonicalMap.js).
 *   The canonical_key is used as the lookup key in exercise_asset_registry (DB).
 *   Once resolved, the same exercise ALWAYS shows the same trusted asset.
 *   This guarantees visual consistency across plan renderings.
 *
 * FALLBACK ORDER:
 *   1. exercise_asset_registry (DB) → by canonical_key → trust_level: "exact"
 *   2. ExerciseDB (RapidAPI) → by canonical exercisedb_name → trust_level: "exact" → stored to registry
 *   3. exercisedb.dev (free) → trust_level: "exact" → stored to registry
 *   4. Pexels → trust_level: "fallback" → stored to registry (prevents repeated bad Pexels calls)
 *   5. None → trust_level: "none"
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabaseServer } from './supabaseServer';
import {
  resolveToCanonicalKey,
  getCanonicalExercise,
  CANONICAL_EXERCISES,
} from './exerciseCanonicalMap';

const EXERCISEDB_KEY = process.env.EXERCISEDB_API_KEY || process.env.RAPIDAPI_KEY || '';
const EXERCISEDB_HOST = (process.env.EXERCISEDB_API_HOST || '').replace(/\/$/, '');
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
const API_TIMEOUT_MS = 5000;

const BAD_EXERCISE_HINTS = [
  'beach', 'coast', 'cliff', 'mountain', 'landscape', 'nature', 'travel',
  'ocean', 'sea', 'island', 'sunset', 'skyline', 'waterfall', 'monument',
  'stone', 'tablet', 'ancient', 'archaeological', 'temple', 'building',
  'portrait', 'face', 'woman sitting', 'meditation',
];

const GOOD_EXERCISE_HINTS = [
  'exercise', 'fitness', 'workout', 'gym', 'training', 'sport',
  'squat', 'push-up', 'pull-up', 'deadlift', 'weight', 'dumbbell',
  'barbell', 'machine', 'muscle', 'strength', 'cardio',
  'plank', 'lunge', 'press', 'rep', 'repetition',
];

/**
 * Canonical empty shape for an exercise enrichment result.
 * canonical_key, trust_level, source support UI trust labels ("Ověřený cvik" / "Ilustrační foto").
 */
const EMPTY_EXERCISE = (name, canonicalKey = null) => ({
  name: name || 'Unknown',
  canonical_key: canonicalKey,   // UI: used to identify canonical exercise
  image_url: null,
  gif_url: null,
  body_part: null,
  target: null,
  equipment: null,
  source: 'none',
  trust_level: 'none',           // exact | fallback | none
});

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function hasUsableMedia(result) {
  return Boolean(result?.image_url || result?.gif_url);
}

// ─── exercise_asset_registry (DB) ──────────────────────────────────────────

async function getRegistryEntry(canonicalKey) {
  if (!canonicalKey) return null;
  try {
    const { data } = await supabaseServer
      .from('exercise_asset_registry')
      .select('canonical_key, display_name_cs, gif_url, image_url, body_part, target, equipment, source, trust_level')
      .eq('canonical_key', canonicalKey)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

async function setRegistryEntry(canonicalKey, entry) {
  if (!canonicalKey || !entry) return;
  try {
    const def = getCanonicalExercise(canonicalKey);
    await supabaseServer
      .from('exercise_asset_registry')
      .upsert(
        {
          canonical_key: canonicalKey,
          display_name_cs: def?.display_name_cs ?? entry.name ?? null,
          exercisedb_name: def?.exercisedb_name ?? null,
          gif_url: entry.gif_url ?? null,
          image_url: entry.image_url ?? null,
          body_part: entry.body_part ?? def?.body_part ?? null,
          target: entry.target ?? def?.target ?? null,
          equipment: entry.equipment ?? def?.equipment ?? null,
          source: entry.source ?? 'none',
          trust_level: entry.trust_level ?? 'none',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'canonical_key' }
      );
  } catch {
    // Registry write failure is non-fatal
  }
}

// ─── ExerciseDB (RapidAPI) ──────────────────────────────────────────────────

async function searchExerciseDbByName(searchName) {
  if (!EXERCISEDB_KEY || !EXERCISEDB_HOST || !searchName) return null;

  const base = EXERCISEDB_HOST.startsWith('http') ? EXERCISEDB_HOST : `https://${EXERCISEDB_HOST}`;
  const host = new URL(base).host;
  const headers = {
    'X-RapidAPI-Key': EXERCISEDB_KEY,
    'X-RapidAPI-Host': host,
    Accept: 'application/json',
  };

  try {
    const url = `${base}/exercises/name/${encodeURIComponent(searchName)}`;
    const res = await fetchWithTimeout(url, { method: 'GET', headers });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.data ? data.data : [];
    const ex = list[0];
    if (!ex || typeof ex !== 'object') return null;

    const gif_url = ex.gifUrl || ex.gif_url || null;
    const image_url = ex.thumbnail || ex.imageUrl || ex.image_url || null;
    if (!gif_url && !image_url) return null;

    return {
      name: ex.name || searchName,
      gif_url,
      image_url,
      body_part: ex.bodyPart || ex.body_part || null,
      target: ex.target || null,
      equipment: ex.equipment || null,
      source: 'exercisedb',
      trust_level: 'exact',
    };
  } catch {
    return null;
  }
}

async function tryExerciseDbDev(searchName) {
  if (!searchName || searchName.length < 2) return null;
  try {
    const url = `https://www.exercisedb.dev/api/v1/exercises/search?q=${encodeURIComponent(searchName)}&limit=5`;
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const list = data?.data;
    const ex = Array.isArray(list) ? list[0] : null;
    if (!ex?.gifUrl) return null;
    return {
      name: ex.name || searchName,
      gif_url: ex.gifUrl,
      image_url: null,
      body_part: ex.bodyParts?.[0] ?? null,
      target: ex.targetMuscles?.[0] ?? null,
      equipment: ex.equipments?.[0] ?? null,
      source: 'exercisedb',
      trust_level: 'exact',
    };
  } catch {
    return null;
  }
}

// ─── Pexels (fitness fallback) ──────────────────────────────────────────────

async function searchExerciseImageFallback(canonicalKey, searchName) {
  if (!PEXELS_KEY) return null;
  const def = canonicalKey ? getCanonicalExercise(canonicalKey) : null;
  const primaryTerm = def?.exercisedb_name || searchName || '';
  if (!primaryTerm) return null;

  const query = `${primaryTerm} fitness exercise workout`;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: PEXELS_KEY, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const photos = Array.isArray(data?.photos) ? data.photos : [];

    const queryTokens = primaryTerm
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const scorePhoto = (photo) => {
      const alt = String(photo?.alt || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      if (!alt) return -10;
      let score = 0;
      for (const bad of BAD_EXERCISE_HINTS) if (alt.includes(bad)) score -= 10;
      for (const good of GOOD_EXERCISE_HINTS) if (alt.includes(good)) score += 4;
      for (const token of queryTokens) if (alt.includes(token)) score += 3;
      return score;
    };

    const ranked = photos
      .map((photo) => ({ photo, score: scorePhoto(photo) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score < 2) return null;

    const image_url = best.photo?.src?.large || best.photo?.src?.medium || best.photo?.src?.original || null;
    if (!image_url) return null;

    return {
      name: searchName,
      gif_url: null,
      image_url,
      body_part: def?.body_part ?? null,
      target: def?.target ?? null,
      equipment: def?.equipment ?? null,
      source: 'pexels',
      // Pexels images are always "fallback" – never exact truth for exercise identity
      trust_level: 'fallback',
    };
  } catch {
    return null;
  }
}

// ─── Old-style search for non-canonical exercises ───────────────────────────

/**
 * Legacy free-text search for exercises that don't map to a canonical key.
 * Returns null if nothing found.
 */
async function searchExerciseByFreeText(exerciseName) {
  if (!exerciseName) return null;

  const normalized = exerciseName
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Try RapidAPI ExerciseDB
  const rapidResult = await searchExerciseDbByName(normalized);
  if (rapidResult && hasUsableMedia(rapidResult)) return rapidResult;

  // Try exercisedb.dev
  const devResult = await tryExerciseDbDev(normalized);
  if (devResult && hasUsableMedia(devResult)) return devResult;

  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * @deprecated Use enrichExercise() instead. Kept for backward compatibility.
 */
export async function searchExerciseMetadata(exerciseName) {
  return enrichExercise(exerciseName);
}

/**
 * Enrich a single exercise with the trust-aware canonical pipeline.
 *
 * @param {string} exerciseName  Raw exercise name from plan HTML (may include sets/reps).
 * @returns {Promise<{
 *   name: string,
 *   canonical_key: string|null,
 *   image_url: string|null,
 *   gif_url: string|null,
 *   body_part: string|null,
 *   target: string|null,
 *   equipment: string|null,
 *   source: string,
 *   trust_level: "exact"|"fallback"|"none"
 * }>}
 */
export async function enrichExercise(exerciseName) {
  if (!exerciseName || typeof exerciseName !== 'string') return EMPTY_EXERCISE(exerciseName);

  // Step 1: Resolve to canonical key
  const canonicalKey = resolveToCanonicalKey(exerciseName);
  const def = canonicalKey ? getCanonicalExercise(canonicalKey) : null;

  // Step 2: Check exercise_asset_registry (guarantees same asset for same exercise)
  if (canonicalKey) {
    const registered = await getRegistryEntry(canonicalKey);
    if (registered && hasUsableMedia(registered)) {
      return {
        name: registered.display_name_cs || def?.display_name_cs || exerciseName,
        canonical_key: canonicalKey,
        image_url: registered.image_url ?? null,
        gif_url: registered.gif_url ?? null,
        body_part: registered.body_part ?? def?.body_part ?? null,
        target: registered.target ?? def?.target ?? null,
        equipment: registered.equipment ?? def?.equipment ?? null,
        source: registered.source ?? 'exercisedb',
        trust_level: registered.trust_level ?? 'exact',
      };
    }
  }

  // Step 3: ExerciseDB via canonical exercisedb_name (most reliable search)
  const searchName = def?.exercisedb_name || exerciseName;
  const dbResult = await searchExerciseDbByName(searchName);
  if (dbResult && hasUsableMedia(dbResult)) {
    const entry = { ...dbResult, canonical_key: canonicalKey };
    if (canonicalKey) await setRegistryEntry(canonicalKey, entry);
    return {
      ...EMPTY_EXERCISE(exerciseName, canonicalKey),
      ...entry,
      name: def?.display_name_cs || dbResult.name || exerciseName,
    };
  }

  // Step 4: exercisedb.dev free fallback
  const devResult = await tryExerciseDbDev(searchName);
  if (devResult && hasUsableMedia(devResult)) {
    const entry = { ...devResult, canonical_key: canonicalKey };
    if (canonicalKey) await setRegistryEntry(canonicalKey, entry);
    return {
      ...EMPTY_EXERCISE(exerciseName, canonicalKey),
      ...entry,
      name: def?.display_name_cs || devResult.name || exerciseName,
    };
  }

  // Step 5: Free-text search for non-canonical exercises
  if (!canonicalKey) {
    const freeResult = await searchExerciseByFreeText(exerciseName);
    if (freeResult && hasUsableMedia(freeResult)) {
      return { ...EMPTY_EXERCISE(exerciseName), ...freeResult };
    }
  }

  // Step 6: Pexels as final fallback (illustrative only)
  const pexelsResult = await searchExerciseImageFallback(canonicalKey, searchName);
  if (pexelsResult) {
    if (canonicalKey) await setRegistryEntry(canonicalKey, pexelsResult);
    return {
      ...EMPTY_EXERCISE(exerciseName, canonicalKey),
      ...pexelsResult,
      name: def?.display_name_cs || exerciseName,
    };
  }

  // Nothing found
  return EMPTY_EXERCISE(exerciseName, canonicalKey);
}
