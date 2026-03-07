/**
 * Exercise enrichment via ExerciseDB (GIF, body part, target, equipment).
 * Safe fallbacks when API keys are missing or requests fail.
 */

const EXERCISEDB_KEY = process.env.EXERCISEDB_API_KEY || '';
const EXERCISEDB_HOST = (process.env.EXERCISEDB_API_HOST || '').replace(/\/$/, '');

const EMPTY_EXERCISE = (name) => ({
  name: name || 'Unknown',
  image_url: null,
  gif_url: null,
  body_part: null,
  target: null,
  equipment: null,
  source: 'none',
});

/**
 * Search ExerciseDB by exercise name; return best match.
 * @param {string} exerciseName
 * @returns {Promise<{ name: string, image_url: string | null, gif_url: string | null, body_part: string | null, target: string | null, equipment: string | null, source: string }>}
 */
export async function searchExerciseMetadata(exerciseName) {
  if (!exerciseName || typeof exerciseName !== 'string') return EMPTY_EXERCISE(exerciseName);
  const name = exerciseName.trim().slice(0, 80);
  if (!name || !EXERCISEDB_KEY || !EXERCISEDB_HOST) return EMPTY_EXERCISE(exerciseName);

  try {
    const base = EXERCISEDB_HOST.startsWith('http') ? EXERCISEDB_HOST : `https://${EXERCISEDB_HOST}`;
    const url = `${base}/exercises/name/${encodeURIComponent(name)}`;
    const res = await fetch(url, {
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

    return {
      name: ex.name || exerciseName,
      image_url: ex.thumbnail || ex.imageUrl || ex.image_url || null,
      gif_url: ex.gifUrl || ex.gif_url || null,
      body_part: ex.bodyPart || ex.body_part || null,
      target: ex.target || null,
      equipment: ex.equipment || null,
      source: 'exercisedb',
    };
  } catch (err) {
    return EMPTY_EXERCISE(exerciseName);
  }
}

/**
 * Enrich a single exercise; return empty structure if no result.
 * @param {string} exerciseName
 * @returns {Promise<{ name: string, image_url: string | null, gif_url: string | null, body_part: string | null, target: string | null, equipment: string | null, source: string }>}
 */
export async function enrichExercise(exerciseName) {
  const result = await searchExerciseMetadata(exerciseName);
  return result.source !== 'none' ? result : EMPTY_EXERCISE(exerciseName);
}
