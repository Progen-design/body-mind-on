/**
 * lib/translateQueueTurn.js
 * Perzistuje, která fronta (recepty/cviky) v api/cron/translate-recipes.js
 * naposledy dostala svoje jedno velké OpenAI volání — viz
 * lib/translateQueueOrchestrator.js pro rozhodovací logiku.
 *
 * Tabulka je NÁVRH: supabase/migrations/20260908110000_translate_queue_turn.sql
 * (soubor existuje, NENÍ aplikovaná — žádné `supabase db push`).
 *
 * Klient se předává jako parametr (ne import supabaseServer tady), stejně
 * jako lib/exerciseMediaBackfill.js persistWgerMedia — testovatelné bez DB
 * a bez vedlejšího efektu importu lib/openai.js.
 */

export const TRANSLATE_QUEUE_TURN_TABULKA = 'translate_queue_turn';
const RADEK_ID = 1;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<'recipes'|'exercises'|null>}
 */
export async function nactiPosledniFrontu(client) {
  const { data, error } = await client
    .from(TRANSLATE_QUEUE_TURN_TABULKA)
    .select('last_queue')
    .eq('id', RADEK_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const hodnota = data?.last_queue;
  return hodnota === 'recipes' || hodnota === 'exercises' ? hodnota : null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {'recipes'|'exercises'} fronta
 */
export async function ulozPosledniFrontu(client, fronta) {
  if (fronta !== 'recipes' && fronta !== 'exercises') return;
  const { error } = await client
    .from(TRANSLATE_QUEUE_TURN_TABULKA)
    .upsert({ id: RADEK_ID, last_queue: fronta, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
