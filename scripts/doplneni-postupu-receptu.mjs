/**
 * Doplnění postupů receptů pod laťkou kvality (lib/plan/kvalitaPostupu.js).
 * Číslo „kolik receptů je pod laťkou" se v gitu dvakrát ukázalo jako
 * nadhodnocené vlastními chybami gatu, ne skutečným stavem katalogu — 420
 * bylo po prvním kole opraveno na 251, a i to na plném běhu (1000 receptů)
 * zamítalo 839, protože jedno pravidlo (rozkazovací sloveso enumerací)
 * bylo principiálně rozbité. Druhé kolo (9. 9. 2026, viz stejné datum
 * v kvalitaPostupu.js) rozdělilo pravidla na blokující a varovná — reálné
 * číslo teď zná až Honza z produkce, ne tenhle komentář.
 *
 * `coach_seed_v1` je zvláštní: recepty jsou ve skutečnosti METODY
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
 * DRUHÁ POJISTKA proti přesně té škodě, co se stala 8.–9. 9. 2026 (gate
 * měl chybu a přepsal 76 dobrých postupů kratšími): `rozhodniOZapisu()`
 * navíc odmítne zápis, i když gate nový postup schválí, pokud je nový
 * kratší než starý v OBOJÍM zároveň — v počtu kroků i ve znacích.
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
  smiPrepsatPostup,
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
 * @returns {{ok:boolean, duvody:string[], varovani:string[]}}
 */
function posudekProReceptu(r) {
  return posudPostup({ kroky: r.instructions_cs, suroviny: r.ingredients, nazev: r.name_cs });
}

/**
 * Rozhodne, jestli se nový postup smí zapsat — gate MUSÍ projít A ZÁROVEŇ
 * nesmí jít o zkrácení starého postupu v obojím (kroky i znaky). Druhá
 * podmínka platí, i když gate nový postup schválí — chrání přesně proti
 * škodě z 8.–9. 9. 2026, kdy gate měl vlastní chybu a přepsal dobré
 * postupy horšími, které mu přesto vyhověly.
 *
 * @param {{ok:boolean, duvody:string[], varovani?:string[]}} posudek
 * @param {unknown} stareKroky
 * @param {unknown} noveKroky
 * @returns {{ok:boolean, duvody:string[]}}
 */
function rozhodniOZapisu(posudek, stareKroky, noveKroky) {
  if (!posudek.ok) return posudek;
  if (!smiPrepsatPostup(stareKroky, noveKroky)) {
    const stare = Array.isArray(stareKroky) ? stareKroky.filter(Boolean) : [];
    const nove = Array.isArray(noveKroky) ? noveKroky.filter(Boolean) : [];
    return {
      ok: false,
      duvody: [
        `nový postup by zkrátil starý (${stare.length}→${nove.length} kroků, `
        + `${stare.join(' ').length}→${nove.join(' ').length} znaků) — zápis odmítnut`,
      ],
    };
  }
  return { ok: true, duvody: [] };
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

  // Posudek se počítá JEDNOU za recept a slouží dvěma různým výstupům:
  // `podLatkou` (blokující — tohle skript opravuje) a `receptuSVarovanim`
  // (informativní — recepty, které gate propustí, ale mají aspoň jedno
  // varování k ruční kontrole). Druhé kolo opravy laťky, 9. 9. 2026:
  // varování se NIKDY nezapočítávají do „pod laťkou" a nikdy nespouští
  // přepis — počítají se zvlášť, jen aby bylo vidět, kolik jich je.
  const posudky = vsechny.map((r) => ({ r, posudek: posudekProReceptu(r) }));
  const receptuSVarovanim = posudky.filter(({ posudek }) => posudek.varovani.length > 0).length;

  let podLatkou = posudky.filter(({ posudek }) => !posudek.ok).map(({ r }) => r);
  if (Number.isFinite(limit) && limit > 0) podLatkou = podLatkou.slice(0, limit);
  else podLatkou = podLatkou.slice(0, VYCHOZI_LIMIT);

  if (!podLatkou.length) {
    console.log(JSON.stringify({
      dry_run: dryRun, zdroj: zdrojFiltr, zpracovano: 0, zapsano: 0, preskoceno: 0,
      recepty_celkem: vsechny.length,
      receptu_s_varovanim: receptuSVarovanim,
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
      const rozhodnuti = rozhodniOZapisu(posudek, varianta.instructions_cs, kroky);
      if (rozhodnuti.ok) {
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
        const rozhodnuti = rozhodniOZapisu(posudek, varianta.instructions_cs, kroky);
        if (rozhodnuti.ok) {
          const zapis = await zapisPostup(varianta.id, kroky, ZDROJ_METODA);
          if (zapis.ok) zapsano += 1;
          else preskoceno.push({ id: varianta.id, name_cs: varianta.name_cs, duvody: [zapis.chyba] });
        } else {
          preskoceno.push({ id: varianta.id, name_cs: varianta.name_cs, duvody: rozhodnuti.duvody });
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
      const rozhodnuti = rozhodniOZapisu(posudek, recept.instructions_cs, kroky);
      if (rozhodnuti.ok) {
        const zapis = await zapisPostup(recept.id, kroky, ZDROJ_JEDNOTLIVY);
        if (zapis.ok) { zapsano += 1; zapsanoTenhle = true; }
        else posledniDuvody = [zapis.chyba];
      } else {
        posledniDuvody = rozhodnuti.duvody;
      }
    }
    if (!zapsanoTenhle) preskoceno.push({ id: recept.id, name_cs: recept.name_cs, duvody: posledniDuvody });
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    zdroj: zdrojFiltr,
    model: DOPLNENI_MODEL,
    recepty_celkem: vsechny.length,
    kandidatu_pod_latkou: podLatkou.length,
    // Informativní, NEŘÍDÍ zápis ani přepis — recepty, které gate propustil
    // (ok: true), ale mají aspoň jedno varování k ruční kontrole.
    receptu_s_varovanim: receptuSVarovanim,
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
