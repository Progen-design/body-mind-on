/**
 * Fronta objednávek na doplnění katalogu cviků.
 *
 * Stejná stavba jako lib/recipeGenerationQueue.js a ze stejného důvodu:
 * signál 'demand' vzniká pokaždé, když skladači dojde nabídka, takže deset
 * uživatelů se stejnou dírou by jinak založilo deset stejných objednávek.
 * Duplicitu řeší unikátní index v DB (exercise_import_queue_unikat), ne kód —
 * funkce níž ji jen tiše spolknou a nahlásí `duplicate: true`.
 */
import { supabaseServer } from './supabaseServer.js';

/** Priority: nižší číslo jde dřív. */
export const PRIORITA = Object.freeze({
  NENI_NAHRADA: 10,   // skladač neměl čím nahradit — uživatel dostal stejný cvik dvakrát
  SEED: 20,
  TENKA_NABIDKA: 50,  // předstih: partie má míň cviků, než kolik jich týden spotřebuje
  DOPLNENI: 80,       // denní kontrola minimálních počtů
});

/** Slovník, na kterém se shodne DB (CHECK) i plánovač. */
export const TRIDY_VYBAVENI = Object.freeze([
  'body_weight', 'dumbbell', 'barbell', 'cable', 'machine', 'kettlebell', 'band',
]);

function jeDuplicita(error) {
  return /duplicate key|unique constraint|exercise_import_queue_unikat/i.test(error?.message || '');
}

/**
 * Založí objednávku. Duplicitní otevřená specifikace se NEZALOŽÍ a není to chyba.
 *
 * @param {{ equipment_class: string, primary_muscle: string,
 *           pozadovano: number, priorita: number, zdroj: 'seed'|'demand' }} spec
 */
export async function objednejCviky(spec, client = supabaseServer) {
  if (!TRIDY_VYBAVENI.includes(spec?.equipment_class)) {
    return { created: false, duplicate: false, id: null, error: `neznámá třída vybavení: ${spec?.equipment_class}` };
  }
  const sval = String(spec?.primary_muscle || '').trim();
  if (!sval) {
    return { created: false, duplicate: false, id: null, error: 'chybí primary_muscle' };
  }

  const { data, error } = await client
    .from('exercise_import_queue')
    .insert({
      equipment_class: spec.equipment_class,
      primary_muscle: sval,
      pozadovano: Math.max(1, Number(spec.pozadovano) || 5),
      priorita: spec.priorita,
      zdroj: spec.zdroj,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (jeDuplicita(error)) return { created: false, duplicate: true, id: null };
    return { created: false, duplicate: false, id: null, error: error.message };
  }
  return { created: true, duplicate: false, id: data?.id ?? null };
}

/**
 * Skladač neměl čím nahradit opakující se cvik — uživatel dostal ten samý
 * cvik v týdnu podruhé. Tvrdá díra, jde na začátek fronty.
 *
 * @param {Array<{ equipment_class: string, primary_muscle: string }>} nedostatek
 */
export async function objednejZChybejiciNahrady(nedostatek, client = supabaseServer) {
  const vysledky = [];
  const videno = new Set();
  for (const polozka of nedostatek || []) {
    const klic = `${polozka?.equipment_class}|${polozka?.primary_muscle}`;
    if (videno.has(klic)) continue;
    videno.add(klic);
    vysledky.push(await objednejCviky({
      equipment_class: polozka.equipment_class,
      primary_muscle: polozka.primary_muscle,
      pozadovano: 5,
      priorita: PRIORITA.NENI_NAHRADA,
      zdroj: 'demand',
    }, client));
  }
  return vysledky;
}

/**
 * Nejbližší otevřené objednávky podle priority.
 *
 * @param {number} limit
 * @param {{ queueId?: number|null }} [opts]
 */
export async function nactiFrontu(limit = 10, client = supabaseServer, opts = {}) {
  let q = client.from('exercise_import_queue').select('*').eq('stav', 'pending');
  if (opts.queueId != null) q = q.eq('id', opts.queueId);

  const { data, error } = await q
    .order('priorita', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`exercise_import_queue: ${error.message}`);
  return data || [];
}

/**
 * Kolik cviků má katalog mít na každou dvojici (vybavení, partie), aby týden
 * nesahal dvakrát po tomtéž.
 *
 * Číslo vychází z měření: uživatel se čtyřmi tréninky týdně spotřebuje kolem
 * 15–20 slotů. Když se má každá partie potkat 2–3× a pokaždé jinak, potřebuje
 * katalog na dvojici aspoň pět cviků. Pod tím se opakování nedá vyhnout.
 */
export const MIN_CVIKU_NA_DVOJICI = 5;

/**
 * Partie, které chceme pokrýt. Záměrně nejsou všechny, které zdroj zná —
 * krk, předloktí a přitahovače se v týdenním plánu samostatně neobjevují
 * a objednávat je znamená plnit katalog něčím, co nikdo nedostane.
 */
export const SVALY_PRO_POKRYTI = Object.freeze([
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'abs', 'glutes', 'quads', 'hamstrings', 'calves',
]);

/**
 * Denní kontrola pokrytí: objedná to, čeho je v katalogu míň než minimum.
 *
 * Existuje kvůli předstihu. Signál 'demand' přijde až ve chvíli, kdy uživatel
 * díru pocítil — tohle ji zavře dřív, než na ni někdo narazí.
 *
 * @param {{ tridy?: string[], svaly?: string[], priorita?: number, zdroj?: 'seed'|'demand' }} [rozsah]
 */
export async function objednejChybejiciPokryti(rozsah = {}, client = supabaseServer) {
  const { data, error } = await client.from('exercise_catalog_coverage').select('*');
  if (error) throw new Error(`exercise_catalog_coverage: ${error.message}`);

  const mame = new Map();
  for (const r of data || []) mame.set(`${r.equipment_class}|${r.primary_muscle}`, Number(r.cviku) || 0);

  const tridy = rozsah.tridy ?? TRIDY_VYBAVENI;
  const svaly = rozsah.svaly ?? SVALY_PRO_POKRYTI;

  // Dvojice, které zdroj nedávno nedokázal naplnit.
  //
  // Unikátní index hlídá jen OTEVŘENÉ objednávky, takže jakmile import uzavře
  // nesplnitelnou položku, nic nebrání založit ji zítra znovu. Naměřeno: zdroj
  // nedokáže pokrýt 41 ze 70 dvojic (bicepsy s vlastní vahou prostě neexistují)
  // a bez téhle brzdy by fronta rostla o 41 mrtvých řádků denně.
  const hranice = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: nedavnoNesplnene } = await client
    .from('exercise_import_queue')
    .select('equipment_class, primary_muscle, pozadovano, vyrobeno')
    .eq('stav', 'done')
    .gte('updated_at', hranice);

  const nezkousetZnovu = new Set(
    (nedavnoNesplnene || [])
      .filter((r) => (Number(r.vyrobeno) || 0) < (Number(r.pozadovano) || 0))
      .map((r) => `${r.equipment_class}|${r.primary_muscle}`)
  );

  const objednano = [];
  for (const trida of tridy) {
    for (const sval of svaly) {
      const kolik = mame.get(`${trida}|${sval}`) ?? 0;
      if (kolik >= MIN_CVIKU_NA_DVOJICI) continue;
      if (nezkousetZnovu.has(`${trida}|${sval}`)) continue;
      const r = await objednejCviky({
        equipment_class: trida,
        primary_muscle: sval,
        pozadovano: MIN_CVIKU_NA_DVOJICI - kolik,
        priorita: rozsah.priorita ?? PRIORITA.DOPLNENI,
        zdroj: rozsah.zdroj ?? 'seed',
      }, client);
      if (r.created) objednano.push({ equipment_class: trida, primary_muscle: sval, chybi: MIN_CVIKU_NA_DVOJICI - kolik });
    }
  }
  return objednano;
}
