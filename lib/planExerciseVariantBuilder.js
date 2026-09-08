/**
 * lib/planExerciseVariantBuilder.js
 * Čistá logika pro lib/planExerciseVariant.js swapWorkoutExerciseVariant() —
 * oddělená do vlastního souboru záměrně: ten hlavní soubor importuje (přes
 * lib/planWorkoutReplace.js) lib/services/exerciseProviderRegistry.js, které
 * importuje lib/openai.js — a `new OpenAI(...)` tam vyhazuje výjimku hned
 * při importu, když v env chybí OPENAI_API_KEY. Testy proto sahají sem, ne
 * do lib/planExerciseVariant.js.
 */
import { mergeWithTrustedRegistryMedia } from './exerciseRegistryMedia.js';
import { obtiznostAPostupProCvik } from './exerciseObtiznost.js';

/**
 * Sestaví nový objekt cviku z už načteného registry řádku cílové varianty.
 * Vrací null, když cílový řádek nemá vůbec co ukázat (chybí display_name_cs)
 * — volající to má hlásit jako NO_VARIANT, ne zapsat cvik bez jména.
 *
 * @param {{
 *   targetRow: object|null,
 *   nazevPodleKlice: Map<string, { display_name_cs?: string|null }>,
 *   previousTitle: string,
 *   current?: { sets?: number|null, reps?: unknown, duration_sec?: number|null },
 * }} args
 * @returns {object|null}
 */
export function sestavVariantuCviku({ targetRow, nazevPodleKlice, previousTitle, current }) {
  const cilovyNazev = (targetRow?.display_name_cs || '').trim();
  if (!targetRow?.canonical_key || !cilovyNazev) return null;

  const media = mergeWithTrustedRegistryMedia(targetRow.canonical_key, {
    gif_url: targetRow.gif_url ?? null,
    image_url: targetRow.image_url || targetRow.wger_exercise_image_url || null,
    source: 'registry',
  });

  return {
    name: cilovyNazev,
    name_cs: cilovyNazev,
    display_name_cs: cilovyNazev,
    canonical_key: targetRow.canonical_key,
    exercise_verified: true,
    // Série/opakování/délka se PŘEBÍRAJÍ z nahrazovaného cviku — uživatel
    // mění obtížnost pohybu, ne rozvrh tréninku.
    sets: current?.sets ?? 3,
    reps: current?.reps ?? null,
    duration_sec: current?.duration_sec ?? null,
    image_url: media.image_url ?? null,
    gif_url: media.gif_url ?? null,
    video_url: media.video_url ?? null,
    source: media.gif_url ? 'trusted_gif' : 'registry',
    wger_exercise_id: targetRow.wger_exercise_id ?? null,
    replaced_from: previousTitle,
    ...obtiznostAPostupProCvik(targetRow, nazevPodleKlice),
  };
}
