/**
 * lib/services/exerciseProviderRegistry.js
 * Resolve cviků – primárně wger.de (veřejné API, bez klíče).
 *
 * Provider: wger (lib/services/wgerService.js)
 * Žádný RapidAPI, ExerciseDB ani další externí zdroje.
 */
import { resolveExercise as wgerResolve } from './wgerService';

/**
 * Resolve cviku – pouze wger.de.
 * @param {string} searchTerm
 * @returns {Promise<{ name: string, image_url: string|null, video_url: string|null, source: string, wger_exercise_id?: number } | null>}
 */
export async function resolveExercise(searchTerm) {
  const wgerResult = await wgerResolve(searchTerm);
  if (wgerResult?.image_url || wgerResult?.video_url) {
    return wgerResult;
  }

  return wgerResult || {
    name: searchTerm,
    image_url: null,
    video_url: null,
    source: 'none',
    wger_exercise_id: null,
  };
}
