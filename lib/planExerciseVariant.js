/**
 * lib/planExerciseVariant.js
 * Záměna JEDNOHO cviku v aktivním structured plánu za jeho lehčí/těžší
 * variantu (easier_key/harder_key z exercise_asset_registry) — na rozdíl od
 * lib/planWorkoutReplace.js (náhodná alternativa ze šablon + wger) je tohle
 * cílená, deterministická záměna na konkrétní sousední cvik.
 *
 * CÍLOVÝ KLÍČ SE VŽDY DOČÍTÁ ZE SERVERU, NE Z KLIENTA. Volající pošle jen
 * canonical_key aktuálního cviku a směr ('lehci'/'tezsi') — teprve server
 * zjistí, na co accurate easier_key/harder_key ukazuje. I kdyby to plán
 * (structured_plan_json) měl už uložené z generování, čte se to tu znovu
 * čerstvě z registru, aby fungovala i záměna u plánů vygenerovaných PŘED
 * touto funkcí (kdy uložený JSON žádné easier_key/harder_key nenese).
 *
 * sestavVariantuCviku() (čistá funkce, žádná DB) žije v
 * lib/planExerciseVariantBuilder.js — schválně mimo tento soubor, viz
 * komentář tam. swapWorkoutExerciseVariant() níž zůstává netestovaná
 * jednotkově, stejně jako sesterská lib/planWorkoutReplace.js
 * replaceWorkoutExerciseInStructuredPlan() — obě jsou jen tenký orchestrátor
 * nad DB čtením.
 */
import { supabaseServer } from './supabaseServer.js';
import { renderPlanHtmlFromStructured } from './planRenderer.js';
import { stripPlanMediaAttrsFromHtml } from './emailTemplates.js';
import { findPlanDay, normKey, exerciseDisplayName } from './planWorkoutReplace.js';
import { sestavVariantuCviku } from './planExerciseVariantBuilder.js';

export { sestavVariantuCviku };

const REGISTRY_SLOUPCE =
  'canonical_key, display_name_cs, gif_url, image_url, wger_exercise_image_url, wger_exercise_id, level, mechanic, instructions_cs, easier_key, harder_key, primary_muscle, equipment_class';

/**
 * @param {string} canonicalKey
 * @returns {Promise<object|null>}
 */
async function nactiRegistryRadek(canonicalKey) {
  const { data, error } = await supabaseServer
    .from('exercise_asset_registry')
    .select(REGISTRY_SLOUPCE)
    .eq('canonical_key', canonicalKey)
    .maybeSingle();
  if (error) throw new Error(`REGISTRY_READ_FAILED: ${error.message}`);
  return data || null;
}

/**
 * @param {string[]} canonicalKeys
 * @returns {Promise<Map<string, { display_name_cs?: string|null }>>}
 */
async function nactiJmenaProKlice(canonicalKeys) {
  const klice = [...new Set(canonicalKeys.filter(Boolean))];
  const mapa = new Map();
  if (!klice.length) return mapa;
  const { data, error } = await supabaseServer
    .from('exercise_asset_registry')
    .select('canonical_key, display_name_cs')
    .in('canonical_key', klice);
  if (error) throw new Error(`REGISTRY_READ_FAILED: ${error.message}`);
  for (const row of data || []) {
    if (row?.canonical_key) mapa.set(row.canonical_key, row);
  }
  return mapa;
}

/**
 * Zamění cvik v `structuredPlan.days[dayIndex].workout.exercises[]`, jehož
 * canonical_key odpovídá `canonicalKey`, za jeho lehčí/těžší variantu.
 *
 * @param {object} structuredPlan
 * @param {{ dayIndex: number, canonicalKey: string, smer: 'lehci'|'tezsi' }} params
 * @param {object} [bodyMetrics] pro renderPlanHtmlFromStructured
 * @returns {Promise<{
 *   structuredPlan: object,
 *   planHtml: string,
 *   exercise: object,
 *   previous_title: string,
 *   new_title: string,
 * }>}
 * @throws {Error} STRUCTURED_PLAN_MISSING | WORKOUT_NOT_FOUND | EXERCISE_NOT_FOUND
 *   | INVALID_SMER | NO_VARIANT | REGISTRY_READ_FAILED
 */
export async function swapWorkoutExerciseVariant(structuredPlan, { dayIndex, canonicalKey, smer }, bodyMetrics = {}) {
  if (smer !== 'lehci' && smer !== 'tezsi') throw new Error('INVALID_SMER');
  if (!structuredPlan?.days?.length) throw new Error('STRUCTURED_PLAN_MISSING');

  const day = findPlanDay(structuredPlan, dayIndex);
  if (!day?.workout?.exercises?.length) throw new Error('WORKOUT_NOT_FOUND');

  const hledanyKlic = String(canonicalKey || '').trim().toLowerCase();
  const exerciseIndex = day.workout.exercises.findIndex((ex) => normKey(ex) === hledanyKlic);
  if (exerciseIndex < 0) throw new Error('EXERCISE_NOT_FOUND');

  const current = day.workout.exercises[exerciseIndex];
  const previousTitle = exerciseDisplayName(current);

  // Cílový klíč se dočítá čerstvě z registru (viz komentář nahoře), ne
  // z toho, co má cvik už uložené v structured_plan_json.
  const currentRow = await nactiRegistryRadek(hledanyKlic);
  const targetKey = smer === 'lehci' ? currentRow?.easier_key : currentRow?.harder_key;
  if (!targetKey) throw new Error('NO_VARIANT');

  const targetRow = await nactiRegistryRadek(targetKey);
  const nazevPodleKlice = await nactiJmenaProKlice([targetRow?.easier_key, targetRow?.harder_key]);

  const nextExercise = sestavVariantuCviku({ targetRow, nazevPodleKlice, previousTitle, current });
  if (!nextExercise) throw new Error('NO_VARIANT');

  day.workout.exercises[exerciseIndex] = nextExercise;

  const planHtml = stripPlanMediaAttrsFromHtml(renderPlanHtmlFromStructured(structuredPlan, bodyMetrics));

  return {
    structuredPlan,
    planHtml,
    exercise: nextExercise,
    previous_title: previousTitle,
    new_title: nextExercise.display_name_cs,
  };
}
