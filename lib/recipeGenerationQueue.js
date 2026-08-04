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
 * Zápis poptávky po slotu do `catalog_slot_demand`.
 *
 * PROČ SE LOGUJE I ÚSPĚŠNÉ ŘEŠENÍ. Objednávky výš vznikají jen když nabídka
 * nedostačuje limitu. Slot, který má 2 kandidáty a limit 2, projde jako úspěch —
 * a to je právě ta třída problému, která se nikdy neprojeví jako chyba: všichni
 * uživatelé dostanou totéž jídlo. Bez čísla kandidátů se díra pozná až když je
 * úplná.
 *
 * Druhý důvod je priorita. Objednávková cesta má prioritu pevnou (10 / 50) a
 * kvůli unikátnímu indexu ve frontě zahodí druhý signál na tutéž díru, takže
 * neví, že na jednu kombinaci naráží deset plánů a na jinou jeden. Agregovaný
 * log to ví a `fill_recipe_queue_from_demand` z toho staví prioritu.
 *
 * ŽÁDNÉ OSOBNÍ ÚDAJE. Posílá se specifikace slotu, ne kdo si o něj řekl.
 *
 * @param {{mealType:string, dietTags?:string[], kcalMin:number, kcalMax:number,
 *          kandidatu:number, limit?:number, nevyreseno?:boolean}} z
 */
export async function zalogujPoptavkuSlotu(z, client = supabaseServer) {
  const { error } = await client.rpc('log_catalog_slot_demand', {
    p_meal_type: z.mealType,
    p_diet_tags: z.dietTags ?? [],
    p_kcal_min: Math.round(Number(z.kcalMin) || 0),
    p_kcal_max: Math.round(Number(z.kcalMax) || 0),
    p_kandidatu: Math.max(0, Number(z.kandidatu) || 0),
    p_limit: Math.max(0, Number(z.limit) || 0),
    p_nevyreseno: Boolean(z.nevyreseno),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
