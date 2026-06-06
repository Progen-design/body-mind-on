/**
 * Pomocné funkce pro URL médií cviků (wger / ExerciseDB).
 */
import {
  isUntrustedWgerStaticUrl,
  mergeWithTrustedRegistryMedia,
} from './exerciseRegistryMedia';

export { isUntrustedWgerStaticUrl, mergeWithTrustedRegistryMedia };

export function isVideoMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase().split('?')[0];
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u) || /\/video\//.test(u);
}

export function isGifMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.toLowerCase().split('?')[0].endsWith('.gif');
}

/**
 * Sběr a deduplikace zdrojů médií z různých polí plánu / registry.
 * @returns {{ imageUrl: string|null, gifUrl: string|null, videoUrl: string|null }}
 */
export function collectExerciseMediaSources(fields = {}) {
  const raw = [
    fields.gif_url,
    fields.gifUrl,
    fields.image_url,
    fields.imageUrl,
    fields.video_url,
    fields.videoUrl,
  ].filter((u) => u && String(u).trim());

  const seen = new Set();
  let imageUrl = null;
  let gifUrl = null;
  let videoUrl = null;

  for (const item of raw) {
    const url = String(item).trim();
    if (!url || seen.has(url)) continue;
    if (isUntrustedWgerStaticUrl(url)) continue;
    seen.add(url);

    if (isVideoMediaUrl(url)) {
      if (!videoUrl) videoUrl = url;
      continue;
    }
    if (isGifMediaUrl(url)) {
      if (!gifUrl) gifUrl = url;
      continue;
    }
    if (!imageUrl) imageUrl = url;
  }

  return { imageUrl, gifUrl, videoUrl };
}

export function hasDisplayableExerciseMedia(media = {}) {
  const { imageUrl, gifUrl, videoUrl } = media;
  return Boolean(imageUrl || gifUrl || videoUrl);
}
