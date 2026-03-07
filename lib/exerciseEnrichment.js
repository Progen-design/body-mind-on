/**
 * Exercise enrichment via ExerciseDB (GIF, body part, target, equipment).
 * Uses exercise_metadata_cache to reduce API calls and as fallback on timeout. Safe without API keys.
 */
import { supabaseServer } from './supabaseServer';

const EXERCISEDB_KEY = process.env.EXERCISEDB_API_KEY || '';
const EXERCISEDB_HOST = (process.env.EXERCISEDB_API_HOST || '').replace(/\/$/, '');
const API_TIMEOUT_MS = 5000;

const EMPTY_EXERCISE = (name) => ({
  name: name || 'Unknown',
  image_url: null,
  gif_url: null,
  body_part: null,
  target: null,
  equipment: null,
  source: 'none',
});

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Search ExerciseDB by exercise name; return best match. Uses cache first; saves to cache after. 5s timeout → fallback to cache or empty.
 */
export async function searchExerciseMetadata(exerciseName) {
  if (!exerciseName || typeof exerciseName !== 'string') return EMPTY_EXERCISE(exerciseName);
  const name = exerciseName.trim().slice(0, 80);
  if (!name) return EMPTY_EXERCISE(exerciseName);

  const cacheKey = name;

  try {
    const { data: cached } = await supabaseServer
      .from('exercise_metadata_cache')
      .select('exercise_name, image_url, gif_url, body_part, target, equipment, source')
      .eq('exercise_name', cacheKey)
      .maybeSingle();
    if (cached) {
      return {
        name: cached.exercise_name || exerciseName,
        image_url: cached.image_url ?? null,
        gif_url: cached.gif_url ?? null,
        body_part: cached.body_part ?? null,
        target: cached.target ?? null,
        equipment: cached.equipment ?? null,
        source: cached.source || 'cache',
      };
    }
  } catch (_) {}

  if (!EXERCISEDB_KEY || !EXERCISEDB_HOST) return EMPTY_EXERCISE(exerciseName);

  const encodedName = encodeURIComponent(name);
  const base = EXERCISEDB_HOST.startsWith('http') ? EXERCISEDB_HOST : `https://${EXERCISEDB_HOST}`;
  const url = `${base}/exercises/name/${encodedName}`;

  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': EXERCISEDB_KEY,
        'X-RapidAPI-Host': new URL(base).host || EXERCISEDB_HOST.replace(/^https?:\/\//, ''),
        Accept: 'application/json',
      },
    });
    if (!res.ok) return EMPTY_EXERCISE(exerciseName);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.data ? data.data : data && typeof data === 'object' && !Array.isArray(data) ? [data] : [];
    const ex = list[0];
    if (!ex || typeof ex !== 'object') return EMPTY_EXERCISE(exerciseName);

    const result = {
      name: ex.name || exerciseName,
      image_url: ex.thumbnail || ex.imageUrl || ex.image_url || null,
      gif_url: ex.gifUrl || ex.gif_url || null,
      body_part: ex.bodyPart || ex.body_part || null,
      target: ex.target || null,
      equipment: ex.equipment || null,
      source: 'exercisedb',
    };
    try {
      await supabaseServer.from('exercise_metadata_cache').upsert(
        {
          exercise_name: cacheKey,
          image_url: result.image_url,
          gif_url: result.gif_url,
          body_part: result.body_part,
          target: result.target,
          equipment: result.equipment,
          source: result.source,
        },
        { onConflict: 'exercise_name' }
      );
    } catch (_) {}
    return result;
  } catch (err) {
    try {
      const { data: cached } = await supabaseServer
        .from('exercise_metadata_cache')
        .select('exercise_name, image_url, gif_url, body_part, target, equipment, source')
        .eq('exercise_name', cacheKey)
        .maybeSingle();
      if (cached) {
        return {
          name: cached.exercise_name || exerciseName,
          image_url: cached.image_url ?? null,
          gif_url: cached.gif_url ?? null,
          body_part: cached.body_part ?? null,
          target: cached.target ?? null,
          equipment: cached.equipment ?? null,
          source: cached.source || 'cache',
        };
      }
    } catch (_) {}
    return EMPTY_EXERCISE(exerciseName);
  }
}

/**
 * Enrich a single exercise; return empty structure if no result.
 */
export async function enrichExercise(exerciseName) {
  const result = await searchExerciseMetadata(exerciseName);
  return result.source !== 'none' ? result : EMPTY_EXERCISE(exerciseName);
}
