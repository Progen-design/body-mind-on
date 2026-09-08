/**
 * Doplnění postupů receptů pod laťkou kvality (lib/plan/kvalitaPostupu.js) —
 * 420 z 1104 receptů v katalogu (měřeno 8. 9. 2026).
 *
 * `coach_seed_v1` je zvláštní: 153 receptů je ve skutečnosti 65 METOD
 * s porčními variantami (" — porce 200/300" apod., stejný postup, jiná
 * gramáž) — model se tam volá jednou na SKUPINU a gramáž se do vygenerované
 * metody dosadí čistou funkcí `vlozGramaze()`. Ostatní zdroje (spoonacular,
 * llm_generated, meal_cache, simple_start) dostávají postup po jednom.
 *
 * Vygenerovaný postup se VŽDY prožene zpátky přes `posudPostup()`. Neprojde-li,
 * zkusí se to jednou znovu (nová metoda/nový postup); pokud neprojde ani
 * podruhé, recept/varianta se PŘESKOČÍ a zaloguje — nikdy se nezapíše
 * postup, který sám neprojde laťkou.
 *
 * Idempotentní a přerušitelný: recept, který laťku splňuje (ať už od dřívějška,
 * nebo protože ho už tenhle skript opravil), se znovu nezpracovává — jednoduše
 * se pro něj `posudPostup()` vrátí `ok: true` a filtr ho vynechá.
 *
 * Spuštění:
 *   node scripts/doplneni-postupu-receptu.mjs --dry-run
 *   node scripts/doplneni-postupu-receptu.mjs --zdroj=coach_seed_v1 --limit=10
 *
 * NESPOUŠTĚT proti produkci bez výslovného svolení — ani s --dry-run.
 */
import OpenAI from 'openai';
import { supabaseServer } from '../lib/supabaseServer.js';
import { posudPostup } from '../lib/plan/kvalitaPostupu.js';
import {
  SKUPINOVY_ZDROJ,
  ZDROJ_METODA,
  ZDROJ_JEDNOTLIVY,
  nazevSkupiny,
  seskupPodleNazvu,
  vlozGramaze,
  sestavVstupProMetodu,
  sestavVstupProRecept,
  zavolejModel,
  odhadniVstupniTokeny,
  DOPLNENI_MODEL,
} from '../lib/plan/doplneniPostupuReceptu.js';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const zdrojArg = argv.find((a) => a.startsWith('--zdroj='));
const zdrojFiltr = zdrojArg ? zdrojArg.slice('--zdroj='.length).trim() : null;
const limitArg = argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number.parseInt(limitArg.slice('--limit='.length), 10) : null;

/** Kolik receptů (variant i jednotlivých) smí jeden běh nejvýš zpracovat. */
const VYCHOZI_LIMIT = 200;

async function nactiKandidaty() {
  let dotaz = supabaseServer
    .from('recipes_catalog')
    .select('id, name_cs, ingredients, instructions_cs, source')
    .order('id', { ascending: true });
  if (zdrojFiltr) dotaz = dotaz.eq('source', zdrojFiltr);

  const { data, error } = await dotaz;
  if (error) throw new Error(`recipes_catalog: ${error.message}`);
  return data || [];
}

/**
 * @param {{id:number, name_cs:string, ingredients:unknown, instructions_cs:unknown}} r
 * @returns {boolean}
 */
function jePodLatkou(r) {
  return !posudPostup({ kroky: r.instructions_cs, suroviny: r.ingredients, nazev: r.name_cs }).ok;
}

async function zapisPostup(id, kroky, zdrojPostupu) {
  const { data, error } = await supabaseServer
    .from('recipes_catalog')
    .update({
      instructions_cs: kroky,
      instructions_source: zdrojPostupu,
      instructions_generated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');
  if (error || !data?.length) {
    return { ok: false, chyba: error?.message || 'UPDATE nezapsal žádný řádek' };
  }
  return { ok: true };
}

async function main() {
  const vsechny = await nactiKandidaty();
  let podLatkou = vsechny.filter(jePodLatkou);
  if (Number.isFinite(limit) && limit > 0) podLatkou = podLatkou.slice(0, limit);
  else podLatkou = podLatkou.slice(0, VYCHOZI_LIMIT);

  if (!podLatkou.length) {
    console.log(JSON.stringify({
      dry_run: dryRun, zdroj: zdrojFiltr, zpracovano: 0, zapsano: 0, preskoceno: 0,
      duvod: 'nic pod laťkou nenalezeno',
    }, null, 2));
    return;
  }

  const skupinove = podLatkou.filter((r) => r.source === SKUPINOVY_ZDROJ);
  const jednotlive = podLatkou.filter((r) => r.source !== SKUPINOVY_ZDROJ);
  const skupiny = seskupPodleNazvu(skupinove);

  const openai = dryRun ? null : new OpenAI({ apiKey: String(process.env.OPENAI_API_KEY || '').trim() });

  let zapsano = 0;
  let odhadovanychTokenu = 0;
  let volaniModelu = 0;
  /** @type {Array<{id:number, name_cs:string, duvody:string[]}>} */
  const preskoceno = [];

  // --- coach_seed_v1: jedna metoda na skupinu, gramáž dosazená per variantu ---
  for (const [nazevSkup, varianty] of skupiny) {
    const zakladniSuroviny = varianty[0]?.ingredients;
    const vstupMetoda = sestavVstupProMetodu({ nazev: nazevSkup, suroviny: zakladniSuroviny });

    if (dryRun) {
      odhadovanychTokenu += odhadniVstupniTokeny(vstupMetoda);
      volaniModelu += 1;
      continue;
    }

    let metoda = (await zavolejModel(openai, vstupMetoda)).kroky;
    volaniModelu += 1;

    /** @type {Array<{id:number, name_cs:string, ingredients:unknown}>} */
    let potrebujiRetry = [];
    for (const varianta of varianty) {
      const kroky = vlozGramaze(metoda, varianta.ingredients);
      const posudek = posudPostup({ kroky, suroviny: varianta.ingredients, nazev: varianta.name_cs });
      if (posudek.ok) {
        const zapis = await zapisPostup(varianta.id, kroky, ZDROJ_METODA);
        if (zapis.ok) zapsano += 1;
        else preskoceno.push({ id: varianta.id, name_cs: varianta.name_cs, duvody: [zapis.chyba] });
      } else {
        potrebujiRetry.push(varianta);
      }
    }

    if (potrebujiRetry.length) {
      metoda = (await zavolejModel(openai, vstupMetoda)).kroky;
      volaniModelu += 1;
      for (const varianta of potrebujiRetry) {
        const kroky = vlozGramaze(metoda, varianta.ingredients);
        const posudek = posudPostup({ kroky, suroviny: varianta.ingredients, nazev: varianta.name_cs });
        if (posudek.ok) {
          const zapis = await zapisPostup(varianta.id, kroky, ZDROJ_METODA);
          if (zapis.ok) zapsano += 1;
          else preskoceno.push({ id: varianta.id, name_cs: varianta.name_cs, duvody: [zapis.chyba] });
        } else {
          preskoceno.push({ id: varianta.id, name_cs: varianta.name_cs, duvody: posudek.duvody });
        }
      }
    }
  }

  // --- ostatní zdroje: postup po jednom, s gramáží rovnou v zadání ---
  for (const recept of jednotlive) {
    const vstup = sestavVstupProRecept({ nazev: recept.name_cs, suroviny: recept.ingredients });

    if (dryRun) {
      odhadovanychTokenu += odhadniVstupniTokeny(vstup);
      volaniModelu += 1;
      continue;
    }

    let posledniDuvody = [];
    let zapsanoTenhle = false;
    for (let pokus = 1; pokus <= 2 && !zapsanoTenhle; pokus += 1) {
      const { kroky } = await zavolejModel(openai, vstup);
      volaniModelu += 1;
      const posudek = posudPostup({ kroky, suroviny: recept.ingredients, nazev: recept.name_cs });
      if (posudek.ok) {
        const zapis = await zapisPostup(recept.id, kroky, ZDROJ_JEDNOTLIVY);
        if (zapis.ok) { zapsano += 1; zapsanoTenhle = true; }
        else posledniDuvody = [zapis.chyba];
      } else {
        posledniDuvody = posudek.duvody;
      }
    }
    if (!zapsanoTenhle) preskoceno.push({ id: recept.id, name_cs: recept.name_cs, duvody: posledniDuvody });
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    zdroj: zdrojFiltr,
    model: DOPLNENI_MODEL,
    kandidatu_pod_latkou: podLatkou.length,
    skupin_coach_seed_v1: skupiny.size,
    jednotlivych_receptu: jednotlive.length,
    volani_modelu: volaniModelu,
    zapsano,
    preskoceno: preskoceno.length,
    ...(dryRun ? { odhad_vstupnich_tokenu: odhadovanychTokenu } : {}),
  }, null, 2));

  if (preskoceno.length) {
    console.log('Přeskočeno (nesplnilo laťku ani napodruhé, nebo selhal zápis):');
    for (const p of preskoceno) {
      console.log(`  #${p.id} ${p.name_cs}: ${p.duvody.join('; ')}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
