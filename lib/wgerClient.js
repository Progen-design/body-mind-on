/**
 * lib/wgerClient.js
 * Přímé volání wger.de REST API (obrázky, exerciseinfo, search).
 * Doplňuje lib/services/wgerService.js – sdílené normalizace URL.
 * @see https://wger.de/api/v2/
 */
import { WGER_API_V2_BASE, WGER_PUBLIC_ORIGIN } from './wgerApiConstants';

const WGER_BASE = WGER_API_V2_BASE;
/** Stejné řády jako wgerService – serverless může být pomalejší než lokální dev. */
const API_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * @param {string|null|undefined} u
 * @returns {string|null}
 */
export function normalizeWgerMediaUrl(u) {
  if (!u || typeof u !== 'string') return null;
  const t = u.trim();
  if (!t) return null;
  if (t.startsWith('http')) return t;
  return `${WGER_PUBLIC_ORIGIN}${t.startsWith('/') ? '' : '/'}${t}`;
}

/**
 * Obrázky / GIF pro základní cvik (exercise base id – stejné jako wger_exercise_id v registry).
 * @param {number|string} wgerExerciseId
 * @returns {Promise<{ image: string|null, gif: string|null }>}
 */
export async function getWgerExerciseImages(wgerExerciseId) {
  const id = Number(wgerExerciseId);
  if (!Number.isFinite(id) || id <= 0) return { image: null, gif: null };

  try {
    const url = `${WGER_BASE}/exerciseimage/?exercise=${id}&limit=30`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { image: null, gif: null };
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const sorted = [...results].sort((a, b) => {
      const am = a?.is_main === true ? 1 : 0;
      const bm = b?.is_main === true ? 1 : 0;
      return bm - am;
    });
    let firstStatic = null;
    let gif = null;
    for (const row of sorted) {
      const raw = normalizeWgerMediaUrl(row?.image);
      if (!raw) continue;
      if (raw.toLowerCase().endsWith('.gif')) {
        gif = raw;
        break;
      }
      if (!firstStatic) firstStatic = raw;
    }
    return {
      image: firstStatic,
      gif: gif || null,
    };
  } catch {
    return { image: null, gif: null };
  }
}

/**
 * Kompletní exerciseinfo (překlady, svaly, vybavení).
 * @param {number|string} wgerExerciseId – základní ID cviku (exercise base)
 * @returns {Promise<object|null>}
 */
export async function getWgerExerciseById(wgerExerciseId) {
  const id = Number(wgerExerciseId);
  if (!Number.isFinite(id) || id <= 0) return null;

  try {
    const url = `${WGER_BASE}/exerciseinfo/${id}/?format=json`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return mapWgerExercise(data);
  } catch {
    return null;
  }
}

/**
 * Vyhledání podle anglického názvu (wger: /exerciseinfo/?name_search=, dříve /exercise/search/).
 * @param {string} nameEn
 * @returns {Promise<object|null>}
 */
export async function searchWgerExercise(nameEn) {
  if (!nameEn || typeof nameEn !== 'string' || !nameEn.trim()) return null;

  try {
    const q = nameEn.trim().slice(0, 80);
    const url = `${WGER_BASE}/exerciseinfo/?name_search=${encodeURIComponent(q)}&limit=10`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const first = Array.isArray(data?.results) ? data.results[0] : null;
    const baseId = first?.id;
    if (baseId == null || !Number.isFinite(Number(baseId))) return null;
    return getWgerExerciseById(baseId);
  } catch {
    return null;
  }
}

/**
 * @param {object} data – exerciseinfo JSON
 * @returns {object}
 */
export function mapWgerExercise(data) {
  if (!data || typeof data !== 'object') {
    return {
      wger_id: null,
      name_en: '',
      description: '',
      category: '',
      equipment: '',
      muscles: '',
      muscles_secondary: '',
      images: [],
      image_url: null,
    };
  }

  const translations = Array.isArray(data.translations) ? data.translations : [];
  const enTranslation = translations.find((t) => t.language === 2);
  const name =
    enTranslation?.name ||
    translations[0]?.name ||
    data.name ||
    '';

  const muscles = Array.isArray(data.muscles)
    ? data.muscles.map((m) => m.name_en || m.name || '').filter(Boolean).join(', ')
    : '';
  const musclesSecondary = Array.isArray(data.muscles_secondary)
    ? data.muscles_secondary.map((m) => m.name_en || m.name || '').filter(Boolean).join(', ')
    : '';
  const equipment = Array.isArray(data.equipment)
    ? data.equipment.map((e) => e.name || '').filter(Boolean).join(', ')
    : '';

  const rawImages = Array.isArray(data.images) ? data.images : [];
  const images = rawImages.map((i) => normalizeWgerMediaUrl(i?.image)).filter(Boolean);

  return {
    wger_id: data.id ?? null,
    name_en: name,
    description: enTranslation?.description || '',
    category: data.category?.name || '',
    equipment,
    muscles,
    muscles_secondary: musclesSecondary,
    images,
    image_url: images[0] || null,
  };
}
