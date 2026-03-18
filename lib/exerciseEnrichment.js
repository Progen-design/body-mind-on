/**
 * lib/exerciseEnrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercise enrichment via canonical mapping → ExerciseDB (GIF, body part, target).
 *
 * TRUST MODEL:
 *   trust_level: "exact" → from exercise_asset_registry or ExerciseDB after canonical lookup
 *   trust_level: "none"  → no visual available
 *
 * FALLBACK ORDER:
 *   1. exercise_asset_registry (DB) → by canonical_key, trust_level=exact ONLY
 *   2. ExerciseDB (RapidAPI) → by canonical exercisedb_name → trust_level: "exact" → stored to registry
 *   3. exercisedb.dev (free) → trust_level: "exact" → stored to registry
 *   4. None → trust_level: "none"
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
const EXERCISEDB_USE_DEV_ONLY =
  process.env.EXERCISEDB_USE_DEV_ONLY === 'true' || process.env.EXERCISEDB_USE_DEV_ONLY === '1';
const API_TIMEOUT_MS = 5000;

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

/**
 * Fetch a registry entry ONLY if it has trust_level="exact".
 */
async function getRegistryEntry(canonicalKey) {
  if (!canonicalKey) return null;
  try {
    const { data } = await supabaseServer
      .from('exercise_asset_registry')
      .select('canonical_key, display_name_cs, gif_url, image_url, body_part, target, equipment, source, trust_level')
      .eq('canonical_key', canonicalKey)
      .eq('trust_level', 'exact') // Only serve verified exact assets from registry
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist an entry to exercise_asset_registry ONLY if trust_level="exact".
 * Pexels fallback assets (trust_level="fallback") must never be stored as
 * canonical truth — doing so would permanently cement a potentially wrong image.
 */
async function setRegistryEntry(canonicalKey, entry) {
  if (!canonicalKey || !entry) return;
  // Guard: only persist exact-trust assets to the canonical registry
  if (entry.trust_level !== 'exact') return;
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
          trust_level: 'exact', // Always store as exact (guard above ensures this)
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
  if (EXERCISEDB_USE_DEV_ONLY || !EXERCISEDB_KEY || !EXERCISEDB_HOST || !searchName) return null;

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

  // Step 4: exercisedb.dev free fallback (try English name first, then Czech display name)
  let devResult = await tryExerciseDbDev(searchName);
  if (!devResult && canonicalKey && def?.display_name_cs) {
    devResult = await tryExerciseDbDev(def.display_name_cs);
  }
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

  // Nothing found
  return EMPTY_EXERCISE(exerciseName, canonicalKey);
}
