/**
 * lib/services/wgerService.js
 * wger.de API – cviky, obrázky, videa. Veřejné API, bez autentizace.
 * @see https://wger.de/api/v2/
 */
import { getWgerExerciseImages, getWgerExerciseById } from '../wgerClient';
import { WGER_API_V2_BASE, WGER_PUBLIC_ORIGIN } from '../wgerApiConstants';

const WGER_BASE = WGER_API_V2_BASE;
const API_TIMEOUT_MS = 8000;
const LANGUAGE_EN = 2;
const LANGUAGE_CS = 9;

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Vyhledá cvik přes /exerciseinfo/?name_search= (wger od ~2025 zrušil /exercise/search/ → 404).
 * `results[].id` je základní ID cviku (stejné jako dřív base_id u návrhů).
 * @param {string} searchTerm
 * @returns {Promise<{ id: number, name: string, language: number } | null>}
 */
async function searchExerciseViaExerciseInfo(searchTerm) {
  const query = searchTerm.trim().slice(0, 80);
  if (!query) return null;
  try {
    const url = `${WGER_BASE}/exerciseinfo/?name_search=${encodeURIComponent(query)}&limit=10`;
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results;
    const first = Array.isArray(results) ? results[0] : null;
    const baseId = first?.id;
    if (baseId == null || !Number.isFinite(Number(baseId))) return null;
    const translations = Array.isArray(first?.translations) ? first.translations : [];
    const enTr = translations.find((t) => t.language === LANGUAGE_EN) || translations[0];
    return {
      id: Number(baseId),
      name: (enTr?.name || query).trim(),
      language: LANGUAGE_EN,
    };
  } catch {
    return null;
  }
}

/**
 * Fallback: exercise-translation — exercise musí být základní ID cviku.
 * @param {string} searchTerm
 * @param {{ language?: number }} [opts]
 * @returns {Promise<{ id: number, name: string, language: number } | null>}
 */
async function searchExerciseViaTranslation(searchTerm, opts = {}) {
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
    if (!first || first.exercise == null) return null;
    return {
      id: Number(first.exercise),
      name: first.name || searchTerm,
      language: first.language,
    };
  } catch {
    return null;
  }
}

/**
 * Vyhledá cvik podle názvu (EN nebo CS).
 * Primárně /exerciseinfo/?name_search=; pak exercise-translation.
 * @param {string} searchTerm - např. "squat", "push up", "dřep"
 * @param {{ language?: number }} [opts] - language: 2=EN, 9=CS
 * @returns {Promise<{ id: number, name: string, language: number } | null>}
 */
export async function searchExercise(searchTerm, opts = {}) {
  if (!searchTerm || typeof searchTerm !== 'string') return null;
  const query = searchTerm.trim().slice(0, 80);
  if (!query) return null;

  const primary = await searchExerciseViaExerciseInfo(query);
  if (primary) return primary;

  let r = await searchExerciseViaTranslation(query, { language: LANGUAGE_EN });
  if (r) return r;
  r = await searchExerciseViaTranslation(query, { language: LANGUAGE_CS });
  return r;
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
    const img = first.image.startsWith('http') ? first.image : `${WGER_PUBLIC_ORIGIN}${first.image}`;
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
    const videoUrl = first.video.startsWith('http') ? first.video : `${WGER_PUBLIC_ORIGIN}${first.video}`;
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

  let image_url = imgResult?.image_url ?? null;
  const video_url = videoResult?.video_url ?? null;
  if (!image_url) {
    const extra = await getWgerExerciseImages(exercise.id);
    image_url = extra.gif || extra.image || null;
  }

  return {
    name: exercise.name,
    wger_exercise_id: exercise.id,
    image_url,
    video_url,
    source: 'wger',
  };
}

/**
 * Přímý resolve podle základního ID cviku (stejné jako wger_exercise_id z pipeline / HTML).
 * @param {number|string} exerciseBaseId
 * @returns {Promise<{
 *   name: string,
 *   wger_exercise_id: number,
 *   image_url: string | null,
 *   video_url: string | null,
 *   source: 'wger'
 * } | null>}
 */
export async function resolveExerciseById(exerciseBaseId) {
  const id = Number(exerciseBaseId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const [imgResult, videoResult, info] = await Promise.all([
    getExerciseImage(id),
    getExerciseVideo(id),
    getWgerExerciseById(id),
  ]);
  let image_url = imgResult?.image_url ?? null;
  let video_url = videoResult?.video_url ?? null;
  if (!image_url && !video_url) {
    const extra = await getWgerExerciseImages(id);
    image_url = extra.image || null;
    video_url = extra.gif || null;
  }
  const hasMedia = Boolean(image_url || video_url);
  if (!hasMedia) return null;

  const nameFromInfo = info?.name_en && String(info.name_en).trim() ? String(info.name_en).trim() : null;

  return {
    name: nameFromInfo || `Exercise ${id}`,
    wger_exercise_id: id,
    image_url,
    video_url,
    source: 'wger',
  };
}
