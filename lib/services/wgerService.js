/**
 * lib/services/wgerService.js
 * wger.de API – cviky, obrázky, videa. Veřejné API, bez autentizace.
 * @see https://wger.de/api/v2/
 */
const WGER_BASE = 'https://wger.de/api/v2';
const API_TIMEOUT_MS = 8000;
const LANGUAGE_EN = 2;
const LANGUAGE_CS = 9;

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Vyhledá cvik podle názvu (EN nebo CS).
 * @param {string} searchTerm - např. "squat", "push up", "dřep"
 * @param {{ language?: number }} [opts] - language: 2=EN, 9=CS
 * @returns {Promise<{ id: number, name: string, language: number } | null>}
 */
export async function searchExercise(searchTerm, opts = {}) {
  if (!searchTerm || typeof searchTerm !== 'string') return null;
  const lang = opts.language ?? LANGUAGE_EN;
  const query = searchTerm.trim().slice(0, 80);
  if (!query) return null;

  try {
    const url = `${WGER_BASE}/exercise-translation/?search=${encodeURIComponent(query)}&language=${lang}&limit=5`;
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results;
    const first = Array.isArray(results) ? results[0] : null;
    if (!first || !first.exercise) return null;
    return {
      id: first.exercise,
      name: first.name || searchTerm,
      language: first.language,
    };
  } catch {
    return null;
  }
}

/**
 * Získá hlavní obrázek cviku.
 * @param {number} exerciseId - exercise base ID z wger
 * @returns {Promise<{ image_url: string, is_main: boolean } | null>}
 */
export async function getExerciseImage(exerciseId) {
  if (!exerciseId || !Number.isFinite(exerciseId)) return null;
  try {
    const url = `${WGER_BASE}/exerciseimage/?exercise=${exerciseId}&is_main=true&limit=1`;
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results;
    const first = Array.isArray(results) ? results[0] : null;
    if (!first?.image) return null;
    const img = first.image.startsWith('http') ? first.image : `https://wger.de${first.image}`;
    return { image_url: img, is_main: first.is_main ?? true };
  } catch {
    return null;
  }
}

/**
 * Získá video cviku (pokud existuje).
 * @param {number} exerciseId - exercise base ID
 * @returns {Promise<{ video_url: string, duration: number } | null>}
 */
export async function getExerciseVideo(exerciseId) {
  if (!exerciseId || !Number.isFinite(exerciseId)) return null;
  try {
    const url = `${WGER_BASE}/video/?exercise=${exerciseId}&limit=1`;
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results;
    const first = Array.isArray(results) ? results[0] : null;
    if (!first?.video) return null;
    const videoUrl = first.video.startsWith('http') ? first.video : `https://wger.de${first.video}`;
    return {
      video_url: videoUrl,
      duration: parseFloat(first.duration) || null,
    };
  } catch {
    return null;
  }
}

/**
 * Kompletní resolve: vyhledá cvik a vrátí obrázek + video.
 * @param {string} searchTerm - např. "push up", "squat"
 * @param {{ language?: number }} [opts]
 * @returns {Promise<{
 *   name: string,
 *   wger_exercise_id: number,
 *   image_url: string | null,
 *   video_url: string | null,
 *   source: 'wger'
 * } | null>}
 */
export async function resolveExercise(searchTerm, opts = {}) {
  const exercise = await searchExercise(searchTerm, opts);
  if (!exercise) return null;

  const [imgResult, videoResult] = await Promise.all([
    getExerciseImage(exercise.id),
    getExerciseVideo(exercise.id),
  ]);

  return {
    name: exercise.name,
    wger_exercise_id: exercise.id,
    image_url: imgResult?.image_url ?? null,
    video_url: videoResult?.video_url ?? null,
    source: 'wger',
  };
}
