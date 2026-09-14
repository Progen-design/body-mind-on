/**
 * lib/exerciseRegistryMedia.js
 * Ověřená média cviků – jediný zdroj pravdy pro GIFy v exercise_asset_registry.
 *
 * Do 14. 9. 2026 tu byly dva natvrdo zapsané slovníky (TRUSTED_EXERCISE_GIF_BY_KEY,
 * TRUSTED_EXTENDED_GIF_BY_KEY) s URL na static.exercisedb.dev (Gym Visual, bez
 * licence pro placený SaaS). FÁZE 3 (docs/DALSI_KROK.md 9.12) smazala tyhle
 * odkazy z registru v DB, ale 11 klíčů (overhead_press, tricep_extension,
 * plank_side, warmup, cooldown, rest, burpee, glute_bridge, hammer_curl,
 * cable_row, hip_thrust) zůstalo ve slovnících tady — mergeWithTrustedRegistryMedia()
 * jim gif_url při každé cestě ke klientovi i do zápisu potichu vracelo zpátky
 * na Gym Visual. V DB bylo 0 odkazů, uživatel jich ale pořád viděl 11.
 *
 * Slovníky jsou od 14. 9. 2026 prázdné natrvalo, ne dočasně. Cvik bez vlastní
 * Storage animace zůstává bez média — to je přijatelný stav, usable_in_plan
 * ho nevyžaduje (trigger enforce_exercise_registry_rules, migrace
 * 20260909001500). Nedoplňovat sem novou fallback URL na cizí CDN.
 */

function isVideoMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase().split('?')[0];
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u) || /\/video\//.test(u);
}

/**
 * Natvrdo zapsané fallbacky na static.exercisedb.dev — záměrně prázdné,
 * viz komentář nahoře souboru. Zůstávají exportované (ne smazané), protože
 * na ně pořád ukazují verify skripty a testy, co počítají s tvarem
 * Record<canonical_key, string>, ne s tím, že klíč existuje.
 */
export const TRUSTED_EXERCISE_GIF_BY_KEY = Object.freeze({});
export const TRUSTED_EXTENDED_GIF_BY_KEY = Object.freeze({});

/** Legacy wger static PNG cesty – v praxi vždy 404, nikdy je neukládat ani nezobrazovat. */
export function isUntrustedWgerStaticUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /wger\.de\/static\/images\/exercises\//i.test(url.trim());
}

const VLASTNI_STORAGE_ANIMACE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/exercise-media\/cviky\/[a-z0-9_]+\.webp$/i;

/**
 * Jediný povolený tvar "ověřeného" média cviku: vlastní WebP animace
 * v Supabase Storage (bucket exercise-media, docs/DALSI_KROK.md 9.12,
 * FÁZE 1–3). Do 14. 9. 2026 sem patřil i static.exercisedb.dev — vyřazeno,
 * protože to byla přesně ta díra, co držela Gym Visual odkazy naživu
 * i po smazání z DB (viz komentář nahoře souboru). Bývalé jméno
 * isTrustedExercisedbGifUrl už neodpovídalo tomu, co funkce dělá.
 */
export function isTrustedExerciseMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return VLASTNI_STORAGE_ANIMACE.test(url.trim());
}

/**
 * Normalizuje pole médií – odstraní mrtvé wger static URL, MP4 z gif_url přesune do video_url.
 */
export function sanitizeExerciseMediaFields(fields = {}) {
  let gif = fields.gif_url && String(fields.gif_url).trim() ? String(fields.gif_url).trim() : null;
  let img = fields.image_url && String(fields.image_url).trim() ? String(fields.image_url).trim() : null;
  let vid = fields.video_url && String(fields.video_url).trim() ? String(fields.video_url).trim() : null;

  if (isUntrustedWgerStaticUrl(gif)) gif = null;
  if (isUntrustedWgerStaticUrl(img)) img = null;

  if (gif && isVideoMediaUrl(gif)) {
    vid = vid || gif;
    gif = null;
  }
  if (img && isVideoMediaUrl(img)) {
    vid = vid || img;
    img = null;
  }

  return {
    ...fields,
    gif_url: gif,
    image_url: img,
    video_url: vid,
  };
}

export function resolveTrustedGifForCanonicalKey(canonicalKey) {
  if (!canonicalKey || typeof canonicalKey !== 'string') return null;
  const key = canonicalKey.trim().toLowerCase();
  return (
    TRUSTED_EXERCISE_GIF_BY_KEY[key] ||
    TRUSTED_EXTENDED_GIF_BY_KEY[key] ||
    null
  );
}

/**
 * Sloučí řádek z DB s ověřeným GIFem a sanitizací – vždy před vrácením klientovi / uložením.
 */
export function mergeWithTrustedRegistryMedia(canonicalKey, row = {}) {
  const key = (canonicalKey || row?.canonical_key || '').trim().toLowerCase();
  const sanitized = sanitizeExerciseMediaFields(row);
  const trustedGif = resolveTrustedGifForCanonicalKey(key);

  if (trustedGif) {
    sanitized.gif_url = trustedGif;
    sanitized.source = sanitized.source === 'none' ? 'exercisedb' : sanitized.source;
  }

  if (isUntrustedWgerStaticUrl(sanitized.image_url)) sanitized.image_url = null;
  if (isUntrustedWgerStaticUrl(sanitized.wger_exercise_image_url)) sanitized.wger_exercise_image_url = null;

  return sanitized;
}

export function assertRegistryRowHasDisplayableMedia(canonicalKey, row) {
  const merged = mergeWithTrustedRegistryMedia(canonicalKey, row);
  const hasGif = Boolean(merged.gif_url && isTrustedExerciseMediaUrl(merged.gif_url));
  const hasVideo = Boolean(merged.video_url);
  const hasOkImage = Boolean(merged.image_url && !isUntrustedWgerStaticUrl(merged.image_url));
  return hasGif || hasVideo || hasOkImage;
}
