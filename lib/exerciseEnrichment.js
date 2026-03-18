/**
 * lib/exerciseEnrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercise enrichment via canonical mapping → wger.de (obrázky, videa).
 * wger.de je veřejné API bez API klíče: https://wger.de/api/v2/
 *
 * FALLBACK ORDER:
 *   1. exercise_asset_registry (DB) → by canonical_key, trust_level=exact ONLY
 *   2. wger.de → trust_level: "exact" → stored to registry
 *   3. None → trust_level: "none"
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabaseServer } from './supabaseServer';
import {
  resolveToCanonicalKey,
  getCanonicalExercise,
} from './exerciseCanonicalMap';
import { resolveExercise as wgerResolve } from './services/wgerService';

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
        source: registered.source ?? 'wger',
        trust_level: registered.trust_level ?? 'exact',
      };
    }
  }

  // Step 3: wger.de (veřejné API, bez klíče) – exercisedb_name nebo název cviku
  const searchName = def?.exercisedb_name || exerciseName;
  const wgerResult = await wgerResolve(searchName);
  if (wgerResult && hasUsableMedia({ image_url: wgerResult.image_url, gif_url: wgerResult.video_url })) {
    const entry = {
      name: wgerResult.name,
      image_url: wgerResult.image_url ?? null,
      gif_url: wgerResult.video_url ?? null,
      body_part: def?.body_part ?? null,
      target: def?.target ?? null,
      equipment: def?.equipment ?? null,
      source: 'wger',
      trust_level: 'exact',
      canonical_key: canonicalKey,
    };
    if (canonicalKey) await setRegistryEntry(canonicalKey, entry);
    return {
      ...EMPTY_EXERCISE(exerciseName, canonicalKey),
      ...entry,
      name: def?.display_name_cs || wgerResult.name || exerciseName,
    };
  }

  // Step 4: Pro non-canonical cviky zkusit wger přímo
  if (!canonicalKey) {
    const freeResult = await wgerResolve(exerciseName);
    if (freeResult && hasUsableMedia({ image_url: freeResult.image_url, gif_url: freeResult.video_url })) {
      return {
        ...EMPTY_EXERCISE(exerciseName),
        name: freeResult.name || exerciseName,
        image_url: freeResult.image_url ?? null,
        gif_url: freeResult.video_url ?? null,
        source: 'wger',
        trust_level: 'exact',
      };
    }
  }

  // Nothing found
  return EMPTY_EXERCISE(exerciseName, canonicalKey);
}
