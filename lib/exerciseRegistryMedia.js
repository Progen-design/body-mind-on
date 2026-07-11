/**
 * lib/exerciseRegistryMedia.js
 * Ověřená média cviků – jediný zdroj pravdy pro GIFy v exercise_asset_registry.
 * Všechny URL ověřeny HEAD requestem proti static.exercisedb.dev (2026-05).
 */

function isVideoMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase().split('?')[0];
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u) || /\/video\//.test(u);
}

const EXERCISEDB_BASE = 'https://static.exercisedb.dev/media';

/** @param {string} id ExerciseDB exerciseId */
export function exercisedbGifUrl(id) {
  return `${EXERCISEDB_BASE}/${id}.gif`;
}

/**
 * Povinné GIFy pro canonical_key z lib/exerciseCanonicalMap.js (CANONICAL_EXERCISES).
 * Plány vždy používají tyto klíče – bez funkčního GIFu nesmí jít do registry.
 */
export const TRUSTED_EXERCISE_GIF_BY_KEY = Object.freeze({
  squat: exercisedbGifUrl('gUjqdei'),
  pushup: exercisedbGifUrl('I4hDWkc'),
  pull_up: exercisedbGifUrl('lBDjFxJ'),
  bent_over_row: exercisedbGifUrl('eZyBC3j'),
  deadlift: exercisedbGifUrl('nUwVh7b'),
  romanian_deadlift: exercisedbGifUrl('wQ2c4XD'),
  bench_press: exercisedbGifUrl('EIeI8Vf'),
  overhead_press: exercisedbGifUrl('A6wtbuL'),
  plank: exercisedbGifUrl('VBAWRPG'),
  lunges: exercisedbGifUrl('kMzUs9Y'),
  lateral_raise: exercisedbGifUrl('DsgkuIt'),
  bicep_curl: exercisedbGifUrl('uSkDMYl'),
  tricep_extension: exercisedbGifUrl('ZujAdR9'),
  leg_press: exercisedbGifUrl('7zdxRTl'),
  warmup: exercisedbGifUrl('uOV3Itw'),
  cooldown: exercisedbGifUrl('uOV3Itw'),
  plank_side: exercisedbGifUrl('5VXmnV5'),
  mountain_climber: exercisedbGifUrl('RJgzwny'),
  superman: exercisedbGifUrl('4GqRrAk'),
  rest: exercisedbGifUrl('IZVHb27'),
});

/** Doplňkové cviky v exercise_asset_registry mimo CANONICAL_EXERCISES. */
export const TRUSTED_EXTENDED_GIF_BY_KEY = Object.freeze({
  burpee: exercisedbGifUrl('dK9394r'),
  russian_twist: exercisedbGifUrl('XVDdcoj'),
  glute_bridge: exercisedbGifUrl('GibBPPg'),
  hammer_curl: exercisedbGifUrl('2NpxjC1'),
  calf_raise: exercisedbGifUrl('6MfS53i'),
  lat_pulldown: exercisedbGifUrl('4c9BhzB'),
  cable_row: exercisedbGifUrl('4IKbhHV'),
  hip_thrust: exercisedbGifUrl('Pjbc0Kt'),
  chest_press: exercisedbGifUrl('EIeI8Vf'),
  goblet_squat: exercisedbGifUrl('yn8yg1r'),
  hamstring_curl: exercisedbGifUrl('Zg3XY7P'),
  dead_bug: exercisedbGifUrl('iny3m5y'),
  farmer_carry: exercisedbGifUrl('qPEzJjA'),
});

/** Legacy wger static PNG cesty – v praxi vždy 404, nikdy je neukládat ani nezobrazovat. */
export function isUntrustedWgerStaticUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /wger\.de\/static\/images\/exercises\//i.test(url.trim());
}

export function isTrustedExercisedbGifUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https:\/\/static\.exercisedb\.dev\/media\/[A-Za-z0-9]+\.gif$/i.test(url.trim());
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

export function getRequiredCanonicalKeys() {
  return Object.keys(TRUSTED_EXERCISE_GIF_BY_KEY);
}

export function assertRegistryRowHasDisplayableMedia(canonicalKey, row) {
  const merged = mergeWithTrustedRegistryMedia(canonicalKey, row);
  const hasGif = Boolean(merged.gif_url && isTrustedExercisedbGifUrl(merged.gif_url));
  const hasVideo = Boolean(merged.video_url);
  const hasOkImage = Boolean(merged.image_url && !isUntrustedWgerStaticUrl(merged.image_url));
  return hasGif || hasVideo || hasOkImage;
}
