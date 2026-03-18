/**
 * lib/services/exerciseProviderRegistry.js
 * Volitelná rozšiřitelná vrstva pro secondary exercise providers.
 *
 * Primární provider: wger (lib/services/wgerService.js)
 * Secondary: exercisedb.dev, Pexels – pouze když useSecondary=true.
 *
 * Poznámka k licencím a stabilitě:
 * - wger: CC-BY-SA 4.0, veřejné API, bez rate limitů, stabilní
 * - exercisedb.dev: vlastní licence, free tier, může mít limity
 * - Pexels: Pexels License, ilustrační obrázky, ne vždy přesné
 *
 * Pro production preferovat pouze wger. Secondary použít jen při
 * EXERCISE_USE_SECONDARY_PROVIDERS=true nebo explicitní opts.
 */
import { resolveExercise as wgerResolve } from './wgerService';

let secondaryProvider = null;

/**
 * Registruje secondary provider (funkce async (searchTerm) => Promise<{name, image_url, video_url, source} | null>).
 * @param {Function} fn
 */
export function registerSecondaryProvider(fn) {
  secondaryProvider = typeof fn === 'function' ? fn : null;
}

/**
 * Resolve cviku: primárně wger, volitelně secondary.
 * @param {string} searchTerm
 * @param {{ useSecondary?: boolean }} [opts]
 * @returns {Promise<{ name: string, image_url: string|null, video_url: string|null, source: string, wger_exercise_id?: number } | null>}
 */
export async function resolveExercise(searchTerm, opts = {}) {
  const useSecondary = opts.useSecondary ?? process.env.EXERCISE_USE_SECONDARY_PROVIDERS === 'true';

  const wgerResult = await wgerResolve(searchTerm);
  if (wgerResult?.image_url || wgerResult?.video_url) {
    return wgerResult;
  }

  if (useSecondary && secondaryProvider) {
    try {
      const sec = await secondaryProvider(searchTerm);
      if (sec?.image_url || sec?.video_url) {
        return {
          name: sec.name || searchTerm,
          image_url: sec.image_url ?? null,
          video_url: sec.video_url ?? null,
          source: sec.source || 'secondary',
          wger_exercise_id: null,
        };
      }
    } catch {
      // ignore
    }
  }

  return wgerResult || {
    name: searchTerm,
    image_url: null,
    video_url: null,
    source: 'none',
    wger_exercise_id: null,
  };
}
