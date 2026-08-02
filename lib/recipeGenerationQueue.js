/**
 * Fronta objednávek na generované recepty.
 *
 * Duplicity řeší unikátní index v DB (recipe_gen_queue_unikat), ne tenhle kód —
 * signál 'demand' vzniká při každém selhaném skládání plánu, takže deset
 * uživatelů se stejnou dírou by jinak založilo deset stejných objednávek.
 * Funkce níž proto duplicitu jen tiše spolknou a nahlásí `duplicate: true`.
 */
import { supabaseServer } from './supabaseServer.js';

/** Priority: nižší číslo jde dřív. */
export const PRIORITA = Object.freeze({
  SLOT_NEVYRESEN: 10,   // plán se nedoručil — tvrdá díra
  MALO_KANDIDATU: 50,   // předstih před tvrdou dírou
  SEED: 20,
  DOPLNENI: 80,         // denní kontrola minimálních počtů
});

function jeDuplicita(error) {
  return /duplicate key|unique constraint|recipe_gen_queue_unikat/i.test(error?.message || '');
}

/**
 * Založí objednávku. Duplicitní otevřená specifikace se NEZALOŽÍ a není to chyba.
 *
 * @param {{ meal_type: string, diet_tags?: string[], kcal_min: number, kcal_max: number,
 *           max_active_min?: number|null, pozadovano: number, priorita: number, zdroj: 'seed'|'demand' }} spec
 */
export async function objednejRecepty(spec, client = supabaseServer) {
  const radek = {
    meal_type: spec.meal_type,
    diet_tags: spec.diet_tags ?? [],
    kcal_min: spec.kcal_min,
    kcal_max: spec.kcal_max,
    max_active_min: spec.max_active_min ?? null,
    pozadovano: spec.pozadovano,
    priorita: spec.priorita,
    zdroj: spec.zdroj,
  };

  const { data, error } = await client
    .from('recipe_generation_queue')
    .insert(radek)
    .select('id')
    .maybeSingle();

  if (error) {
    if (jeDuplicita(error)) return { created: false, duplicate: true, id: null };
    return { created: false, duplicate: false, id: null, error: error.message };
  }
  return { created: true, duplicate: false, id: data?.id ?? null };
}

/**
 * Díra, kvůli které se plán NEDORUČIL (CATALOG_SLOT_UNRESOLVED).
 *
 * Kalorické pásmo se odvozuje z cíle slotu přes rozsah škálování porcí
 * (0,5–2,0×) — objednáváme základní kcal receptu, ne cíl slotu.
 *
 * @param {{ mealType: string, dietTags?: string[], slotTargetKcal?: number|null }} kontext
 */
export async function objednejZNevyresenehoSlotu(kontext, client = supabaseServer) {
  const cil = Number(kontext?.slotTargetKcal);
  const maCil = Number.isFinite(cil) && cil > 0;
  return objednejRecepty({
    meal_type: kontext.mealType,
    diet_tags: kontext.dietTags ?? [],
    kcal_min: maCil ? Math.round(cil / 2) : 200,
    kcal_max: maCil ? Math.round(cil * 2) : 900,
    pozadovano: 7,
    priorita: PRIORITA.SLOT_NEVYRESEN,
    zdroj: 'demand',
  }, client);
}

/**
 * Kandidátů je míň, než slot potřebuje — plán ještě prošel (diverzita se uvolní),
 * ale nabídka došla. Předstih před tvrdou dírou.
 *
 * Pásmo se sem předává hotové: volající už kcal rozsah pro dotaz do katalogu má,
 * takže ho není z čeho odvozovat znovu.
 *
 * @param {{ mealType: string, dietTags?: string[], kcalMin: number, kcalMax: number, chybi?: number }} kontext
 */
export async function objednejZNizkeNabidky(kontext, client = supabaseServer) {
  return objednejRecepty({
    meal_type: kontext.mealType,
    diet_tags: kontext.dietTags ?? [],
    kcal_min: Math.round(Number(kontext.kcalMin) || 200),
    kcal_max: Math.round(Number(kontext.kcalMax) || 900),
    pozadovano: Math.max(3, Number(kontext?.chybi) || 5),
    priorita: PRIORITA.MALO_KANDIDATU,
    zdroj: 'demand',
  }, client);
}

/**
 * Nejbližší otevřené objednávky podle priority.
 *
 * `queueId` zúží běh na jedinou objednávku. Existuje kvůli postupnému
 * spouštění: fronta je seřazená podle priority, takže bez toho by první běh
 * začal u vegan položek — a ty čekají na doplnění slovníku (chybí cizrna,
 * rostlinná mléka). Bez cílení by se buď generovalo naprázdno, nebo by se
 * musely objednávky dočasně rušit, což je horší.
 *
 * @param {number} limit
 * @param {{ queueId?: number|null }} [opts]
 */
export async function nactiFrontu(limit = 10, client = supabaseServer, opts = {}) {
  let q = client
    .from('recipe_generation_queue')
    .select('*')
    .eq('stav', 'pending');

  if (opts.queueId != null) q = q.eq('id', opts.queueId);

  const { data, error } = await q
    .order('priorita', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`recipe_generation_queue: ${error.message}`);
  return data || [];
}
