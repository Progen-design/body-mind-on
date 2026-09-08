/**
 * lib/exerciseObtiznost.js
 * Mapa DB hodnoty `level` (exercise_asset_registry) na český popisek
 * obtížnosti, který jde do structured_plan_json a odtud do UI.
 */

/** @type {Record<'beginner'|'intermediate'|'expert', 'lehké'|'střední'|'těžké'>} */
export const OBTIZNOST_PODLE_UROVNE = Object.freeze({
  beginner: 'lehké',
  intermediate: 'střední',
  expert: 'těžké',
});

/**
 * @param {string|null|undefined} level
 * @returns {'lehké'|'střední'|'těžké'|undefined} undefined pro NULL/neznámou
 *   hodnotu — plán pak pole obtiznost vynechá, nikdy nevyplní placeholder.
 */
export function obtiznostZeUrovne(level) {
  return OBTIZNOST_PODLE_UROVNE[level] ?? undefined;
}

/**
 * Varianta (easier_key/harder_key) se do plánu propíše, jen když ji zná
 * registry (řádek existuje) A má český název — jinak by tlačítko ve Části C
 * ukazovalo klíč bez popisku, nebo mířilo na cvik, který se nedá zobrazit.
 * @param {string|null|undefined} key
 * @param {Map<string, {display_name_cs?: string|null}>} nazevPodleKlice
 * @returns {{ key: string, nazev: string } | null}
 */
function variantaPokudExistuje(key, nazevPodleKlice) {
  const k = (key || '').trim();
  if (!k) return null;
  const nazev = (nazevPodleKlice?.get(k)?.display_name_cs || '').trim();
  if (!nazev) return null;
  return { key: k, nazev };
}

/**
 * Sestaví obtížnost + postup + varianty pro JEDEN cvik z už načtených
 * registry řádků (batch, ne N+1 dotaz na cvik) — volá
 * lib/services/planOrchestratorResolve.js resolveWorkouts().
 *
 * Vrací jen pole, která mají data — chybějící se nevrací vůbec (undefined
 * klíč), aby JSON.stringify (structured_plan_json je JSONB) automaticky
 * vynechal placeholder, který by jinak musel psát volající zvlášť.
 *
 * @param {{ level?: string|null, instructions_cs?: string[]|null, easier_key?: string|null, harder_key?: string|null }|null} registryRow
 *   řádek pro TENTO cvik z první dávky (canonical_key cviků v plánu).
 * @param {Map<string, { display_name_cs?: string|null }>} nazevPodleKlice
 *   canonical_key -> řádek s display_name_cs. Musí obsahovat i varianty
 *   (easier_key/harder_key), které samy nejsou mezi cviky v plánu — druhá
 *   dávka v resolveWorkouts() je do stejné mapy domerguje.
 * @returns {{
 *   level?: string,
 *   obtiznost?: 'lehké'|'střední'|'těžké',
 *   instructions_cs?: string[],
 *   easier_key?: string,
 *   easier_display_name_cs?: string,
 *   harder_key?: string,
 *   harder_display_name_cs?: string,
 * }}
 */
export function obtiznostAPostupProCvik(registryRow, nazevPodleKlice) {
  /** @type {ReturnType<typeof obtiznostAPostupProCvik>} */
  const out = {};

  const level = registryRow?.level;
  if (level) out.level = level;

  const obtiznost = obtiznostZeUrovne(level);
  if (obtiznost) out.obtiznost = obtiznost;

  const kroky = registryRow?.instructions_cs;
  if (Array.isArray(kroky) && kroky.length) out.instructions_cs = kroky;

  const easier = variantaPokudExistuje(registryRow?.easier_key, nazevPodleKlice);
  if (easier) {
    out.easier_key = easier.key;
    out.easier_display_name_cs = easier.nazev;
  }

  const harder = variantaPokudExistuje(registryRow?.harder_key, nazevPodleKlice);
  if (harder) {
    out.harder_key = harder.key;
    out.harder_display_name_cs = harder.nazev;
  }

  return out;
}
