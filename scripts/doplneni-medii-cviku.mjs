/**
 * Jednorázové doplnění média (statické fotky) u cviků v exercise_asset_registry,
 * kterým chybí úplně všechno — gif_url, image_url i wger_exercise_image_url.
 * Naměřeno v produkci: 13 řádků (2026-09-08).
 *
 * Dohledání jde stejnou cestou jako enrichExercise() (lib/exerciseEnrichment.js
 * krok 3): wger_search_name z lib/exerciseCanonicalMap.js, a když řádek v mapě
 * není (registry má i cviky navíc — lib/__tests__/exerciseRegistryCoverage.
 * test.mjs), padá se na exercisedb_name / display_name_cs / canonical_key
 * (lib/exerciseMediaBackfill.js wgerHledaciTermProRadek). Přes
 * lib/services/wgerService.js resolveExercise() — žádný jiný zdroj, žádné
 * generování. Co wger nenajde, se přeskočí a vypíše, nedomýšlí se.
 *
 * Zapisuje jen wger_exercise_image_url (+ wger_exercise_id) — nikdy gif_url
 * ani image_url (ty patří jinému zdroji/importu). Stejné pravidlo jako
 * lib/services/exerciseProviderRegistry.js persistWgerMedia(): prázdná
 * odpověď z wgeru se nezapisuje jako prázdný řetězec.
 *
 * Spuštění:  node scripts/doplneni-medii-cviku.mjs [--dry-run]
 */
import { supabaseServer } from '../lib/supabaseServer.js';
import { nactiVsechnyRadky } from '../lib/supabasePagination.js';
import { getCanonicalExercise } from '../lib/exerciseCanonicalMap.js';
import { resolveExercise as wgerResolve } from '../lib/services/wgerService.js';
import { vyberRadkyBezMedia, wgerHledaciTermProRadek, wgerObrazekZVysledku } from '../lib/exerciseMediaBackfill.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const vsechny = await nactiVsechnyRadky({
    client: supabaseServer,
    tabulka: 'exercise_asset_registry',
    sloupce: 'id, canonical_key, display_name_cs, exercisedb_name, gif_url, image_url, wger_exercise_image_url',
    poradi: { sloupec: 'id', ascending: true },
  });

  const radky = vyberRadkyBezMedia(vsechny);

  if (!radky.length) {
    console.log('Nic k doplnění — žádný cvik není úplně bez média.');
    return;
  }

  console.log(`Cviků úplně bez média: ${radky.length}.`);

  let doplneno = 0;
  const nenalezeno = [];
  const chyby = [];

  for (const radek of radky) {
    const term = wgerHledaciTermProRadek(radek, getCanonicalExercise);

    let wgerResult = null;
    try {
      wgerResult = await wgerResolve(term);
    } catch (err) {
      chyby.push(`${radek.canonical_key}: ${err?.message || err}`);
      continue;
    }

    const obrazek = wgerObrazekZVysledku(wgerResult);
    if (!wgerResult?.name || !obrazek) {
      nenalezeno.push(radek.canonical_key);
      continue;
    }

    if (dryRun) {
      doplneno += 1;
      continue;
    }

    const patch = { wger_exercise_image_url: obrazek };
    const wgerId = Number(wgerResult.wger_exercise_id);
    if (Number.isFinite(wgerId) && wgerId > 0) patch.wger_exercise_id = wgerId;

    const { data: zapsano, error } = await supabaseServer
      .from('exercise_asset_registry')
      .update(patch)
      .eq('id', radek.id)
      .select('id');
    if (error || !zapsano?.length) {
      chyby.push(`${radek.canonical_key}: ${error?.message || 'UPDATE nezapsal žádný řádek'}`);
      continue;
    }
    doplneno += 1;
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    kandidatu: radky.length,
    doplneno,
    wger_nenasel: nenalezeno.length,
    chyby: chyby.length,
  }, null, 2));
  if (nenalezeno.length) console.log('Wger nenašel:', nenalezeno.join(', '));
  for (const ch of chyby) console.error('CHYBA:', ch);
  if (chyby.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
