/**
 * lib/exerciseMediaBackfill.js
 * Čistá logika pro scripts/doplneni-medii-cviku.mjs — oddělená od síťových
 * volání (wger) a Supabase, ať se dá testovat bez obojího.
 */

/**
 * Řádek exercise_asset_registry má médium, pokud má aspoň jedno ze tří polí
 * vyplněné neprázdným řetězcem. "Prázdné" = NULL, undefined i whitespace.
 * @param {{ gif_url?: string|null, image_url?: string|null, wger_exercise_image_url?: string|null }} radek
 * @returns {boolean}
 */
export function maMedium(radek) {
  return Boolean(
    String(radek?.gif_url ?? '').trim()
    || String(radek?.image_url ?? '').trim()
    || String(radek?.wger_exercise_image_url ?? '').trim()
  );
}

/**
 * Z pole řádků vybere jen ty úplně bez média (gif_url i image_url
 * i wger_exercise_image_url prázdné) — kandidáty na doplnění.
 * @param {Array<object>} radky
 * @returns {Array<object>}
 */
export function vyberRadkyBezMedia(radky) {
  return (Array.isArray(radky) ? radky : []).filter((radek) => !maMedium(radek));
}

/**
 * Vyhledávací termín pro wger — stejná cesta jako enrichExercise()
 * (lib/exerciseEnrichment.js krok 3: `def?.wger_search_name || exerciseName`).
 * Řádky navíc v registry (mimo exerciseCanonicalMap.js — viz
 * lib/__tests__/exerciseRegistryCoverage.test.mjs) nemají `def`, proto se
 * padá na anglický název uložený už dřív v `exercisedb_name`
 * (docs/AUDIT_RAPIDAPI_REMOVAL.md: sloupec zůstal schválně jako search term
 * pro wger), pak na český název, a nakonec na canonical_key samotný.
 * @param {{ canonical_key: string, display_name_cs?: string|null, exercisedb_name?: string|null }} radek
 * @param {(canonicalKey: string) => { wger_search_name?: string }|null} getCanonicalExercise
 * @returns {string}
 */
export function wgerHledaciTermProRadek(radek, getCanonicalExercise) {
  const def = radek?.canonical_key ? getCanonicalExercise(radek.canonical_key) : null;
  const zDefu = def?.wger_search_name && String(def.wger_search_name).trim();
  if (zDefu) return zDefu;

  const zExercisedbName = radek?.exercisedb_name && String(radek.exercisedb_name).trim();
  if (zExercisedbName) return zExercisedbName;

  const zDisplayCs = radek?.display_name_cs && String(radek.display_name_cs).trim();
  if (zDisplayCs) return zDisplayCs;

  return String(radek?.canonical_key || '').replace(/_/g, ' ').trim();
}

/**
 * Z výsledku wger vytáhne URL, kterou má smysl uložit — statická fotka
 * (wger animace neposkytuje, viz docs/AUDIT_RAPIDAPI_REMOVAL.md). Prázdný
 * řetězec se nikdy nevrací, jen skutečná hodnota nebo null.
 * @param {{ image_url?: string|null, gif_url?: string|null }|null} wgerResult
 * @returns {string|null}
 */
export function wgerObrazekZVysledku(wgerResult) {
  const url = String(wgerResult?.image_url || wgerResult?.gif_url || '').trim();
  return url || null;
}

/**
 * Zapíše živé wger médium zpátky do exercise_asset_registry
 * (wger_exercise_image_url, wger_exercise_id) — doplněk, ne náhrada:
 *   - NIKDY nesahá na image_url ani gif_url (ani je nečte, ani je nepíše —
 *     UPDATE obsahuje jen tato dvě pole, takže existující hodnoty jsou mimo
 *     dosah bez ohledu na to, co v nich je)
 *   - prázdná odpověď z wgeru (žádné image_url ani gif_url) se nezapíše
 *     jako prázdný řetězec — funkce se v tom případě vůbec nezavolá do DB
 *   - selhání zápisu je jen zalogováno, nikdy nepropadne volajícímu —
 *     médium je ozdoba, sestavení plánu je produkt a nesmí kvůli tomu spadnout
 *
 * Bez zápisu se to samé wger médium stahovalo znovu při každém sestavení
 * plánu, protože resolveFromRegistry (lib/services/exerciseProviderRegistry.js)
 * vrací řádek z DB, jakmile existuje — bez ohledu na to, jestli má vyplněné
 * médium. Volá ji lib/services/exerciseProviderRegistry.js resolveExercise()
 * i scripts/doplneni-medii-cviku.mjs.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string|null} canonicalKey
 * @param {{ image_url?: string|null, gif_url?: string|null, wger_exercise_id?: number|string|null }|null} wgerResult
 * @returns {Promise<void>}
 */
export async function persistWgerMedia(client, canonicalKey, wgerResult) {
  if (!canonicalKey || !wgerResult) return;

  const imageUrl = wgerObrazekZVysledku(wgerResult);
  if (!imageUrl) return;

  const idRaw = wgerResult.wger_exercise_id;
  const wgerId = idRaw != null && idRaw !== '' && Number.isFinite(Number(idRaw)) ? Number(idRaw) : null;

  const patch = { wger_exercise_image_url: imageUrl };
  if (wgerId != null) patch.wger_exercise_id = wgerId;

  // DVA různé způsoby, jak zápis selže, a každý se hlásí jinak:
  //  1. Supabase klient NEVYHAZUJE výjimku, když UPDATE odmítne databáze
  //     (RLS, chybný sloupec, constraint) — vrátí { error }. Samotný
  //     try/catch by takové selhání spolkl úplně beze stopy.
  //  2. Výjimku hodí jen přenos (síť, DNS, timeout) — na to je catch.
  // Obojí se loguje, ani jedno nepropadne volajícímu: médium je ozdoba,
  // sestavení plánu je produkt a nesmí kvůli němu spadnout.
  try {
    const { error } = await client
      .from('exercise_asset_registry')
      .update(patch)
      .eq('canonical_key', canonicalKey);
    if (error) {
      console.error(`[exerciseMediaBackfill] zápis wger média odmítnut (${canonicalKey}):`, error.message || error);
    }
  } catch (err) {
    console.error(`[exerciseMediaBackfill] zápis wger média selhal (${canonicalKey}):`, err?.message || err);
  }
}
