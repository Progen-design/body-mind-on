/**
 * Fronta objednávek na generované recepty.
 *
 * Duplicity řeší unikátní index v DB (recipe_gen_queue_unikat), ne tenhle kód —
 * signál 'demand' vzniká při každém selhaném skládání plánu, takže deset
 * uživatelů se stejnou dírou by jinak založilo deset stejných objednávek.
 * Funkce níž proto duplicitu jen tiše spolknou a nahlásí `duplicate: true`.
 */
import { supabaseServer } from './supabaseServer.js';
import { srovnejPasmo } from './recipeGenerationBands.js';
import { serializujHint } from './plan/proteinHint.js';
import { MIN_RECEPTU_NA_SLOT } from './dietOptions.js';

/** Priority: nižší číslo jde dřív. */
export const PRIORITA = Object.freeze({
  SLOT_NEVYRESEN: 10,   // plán se nedoručil — tvrdá díra
  MALO_KANDIDATU: 50,   // předstih před tvrdou dírou
  SEED: 20,
  DOPLNENI: 80,         // denní kontrola minimálních počtů
  SLOT_MINUL_BILKOVINY: 40, // slot se vyřešil, ale pod cílem bílkovin
});

/**
 * O kolik se priorita posune podle toho, jak moc slot minul cíl bílkovin.
 *
 * Bez tohohle mají všechny objednávky na jednom stupni totéž číslo a fronta
 * je řadí jen podle stáří — nejhorší díra tak čeká za deseti mírnějšími.
 * Posun je záporný (nižší = dřív) a stropovaný, aby objednávka z mírnějšího
 * stupně nikdy nepředběhla tvrdou díru: krok 50 se posune nejvýš na 41.
 *
 * @param {number} zaklad výchozí priorita stupně
 * @param {number|null} minuti o kolik podíl bílkovin chybí (0..1)
 * @returns {number}
 */
export function prioritaPodleMinuti(zaklad, minuti) {
  const m = Number(minuti);
  if (!Number.isFinite(m) || m <= 0) return zaklad;

  // 10 p. b. minutí = posun o 3, 30 a víc = plný posun o 9.
  const posun = Math.min(9, Math.round((m / 0.30) * 9));
  return Math.max(zaklad - 9, zaklad - posun);
}

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
  /* PÁSMO SE SROVNÁ PODLE TOHO, CO GENERÁTOR UMÍ.
     Seed objednávky snídaní s pásmem 350–550 a 400–550 skončily bez jediného
     receptu (0 z 6 položek) — medián toho, co model u snídaně vyrobí, je
     392 kcal, takže dávka pěti receptů v pásmu od 400 výš je loterie.
     Zaplatili jsme za generování a nedostali nic. Validace kcal v zapisRecept()
     zůstává tvrdá; mění se ZADÁNÍ, ne kontrola. Viz lib/recipeGenerationBands.js. */
  const pasmo = srovnejPasmo(spec);
  if (pasmo.zmeneno) {
    console.log(JSON.stringify({
      source: 'recipe-queue',
      event: 'pasmo_srovnano',
      meal_type: spec.meal_type,
      puvodni: `${spec.kcal_min}-${spec.kcal_max}`,
      nove: `${pasmo.kcal_min}-${pasmo.kcal_max}`,
      duvod: pasmo.duvod,
    }));
  }

  const radek = {
    meal_type: spec.meal_type,
    diet_tags: spec.diet_tags ?? [],
    kcal_min: pasmo.kcal_min || spec.kcal_min,
    kcal_max: pasmo.kcal_max || spec.kcal_max,
    max_active_min: spec.max_active_min ?? null,
    pozadovano: spec.pozadovano,
    priorita: spec.priorita,
    zdroj: spec.zdroj,
    // Serializuje jedině proteinHint.js — pořadí klíčů je součást formátu,
    // jinak by unikát fronty považoval tutéž objednávku za dvě.
    protein_hint: serializujHint({
      zdroj: spec.protein_zdroj ?? null,
      podil: spec.min_podil_bilkovin ?? null,
    }),
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
    // Sedm = kolik slot potřebuje, aby se týden neopakoval. Sdílené
    // s watchdogem, viz MIN_RECEPTU_NA_SLOT.
    pozadovano: MIN_RECEPTU_NA_SLOT,
    priorita: PRIORITA.SLOT_NEVYRESEN,
    zdroj: 'demand',
    // Díra se objednává i s tím, jaký podíl bílkovin slot potřeboval. Bez toho
    // model vyrobí další recept, který se do slotu vejde kaloricky a mine ho
    // stejně jako ten, co tam nebyl.
    min_podil_bilkovin: kontext.minPodilBilkovin ?? null,
  }, client);
}

/**
 * Slot se VYŘEŠIL, ale vybraný recept mine cíl bílkovin o víc, než je únosné.
 *
 * PROČ TAHLE VĚTEV VŮBEC JE. Objednávalo se jen při tvrdé díře a při nízké
 * nabídce — tedy když katalog nedal nic nebo skoro nic. Slot, na který se
 * kandidát najde, se tvářil jako vyřešený, i když plán díky němu netrefil
 * bílkoviny. Katalog se tak nikdy nedozvěděl, že jeho nejlepší nabídka
 * nestačí; jediné, co ten stav dnes hlásí, je `_diag.protein_trefa` po
 * sestavení celého plánu, a z toho se objednávka nedělá.
 *
 * Změřeno 23. 8. 2026: trefa do bílkovin 89 % (cíl 185 g, plán dává 166 g).
 * Zbytek drží snídaně a svačiny — 37 ze 163, respektive 36 ze 161 aktivních
 * receptů má podíl bílkovin aspoň 25 %.
 *
 * @param {{ mealType: string, dietTags?: string[], slotTargetKcal?: number|null,
 *           minPodilBilkovin: number, minuti: number }} kontext
 */
export async function objednejZeSlotuPodCilem(kontext, client = supabaseServer) {
  const cil = Number(kontext?.slotTargetKcal);
  const maCil = Number.isFinite(cil) && cil > 0;
  return objednejRecepty({
    meal_type: kontext.mealType,
    diet_tags: kontext.dietTags ?? [],
    kcal_min: maCil ? Math.round(cil / 2) : 200,
    kcal_max: maCil ? Math.round(cil * 2) : 900,
    pozadovano: 5,
    priorita: prioritaPodleMinuti(PRIORITA.SLOT_MINUL_BILKOVINY, kontext.minuti),
    zdroj: 'demand',
    min_podil_bilkovin: kontext.minPodilBilkovin ?? null,
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
