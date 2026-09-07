/**
 * Jednorázové doplnění `instructions_en` pro už naimportované cviky —
 * docs/DALSI_KROK.md 9.9 krok 2.
 *
 * Import z free-exercise-db kroky provedení zahazoval, protože nebylo kam
 * je uložit (sloupec vznikl až migrací 20260907160000). Tenhle skript projde
 * řádky `external_source = 'free-exercise-db'` s prázdným `instructions_en`,
 * dohledá je v datasetu podle `external_id` a kroky doplní.
 *
 * Dataset se stahuje JEDNOU pro celý běh, ne 185×. Překlad do
 * `instructions_cs` odsud nevzniká — ten dělá průběžně tatáž linka jako
 * u receptů (lib/prekladPostupuCviku.js přes cron translate-recipes).
 *
 * Spuštění:  node scripts/doplneni-postupu-cviku.mjs [--dry-run]
 */
import { supabaseServer } from '../lib/supabaseServer.js';
import { stahniZdroj, krokyZeZdroje } from '../lib/exerciseImportRun.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { data: radky, error: chybaCteni } = await supabaseServer
    .from('exercise_asset_registry')
    .select('id, canonical_key, external_id')
    .eq('external_source', 'free-exercise-db')
    .is('instructions_en', null)
    .order('id', { ascending: true });
  if (chybaCteni) throw new Error(`exercise_asset_registry: ${chybaCteni.message}`);

  if (!radky?.length) {
    console.log('Nic k doplnění — všechny free-exercise-db cviky už instructions_en mají.');
    return;
  }

  console.log(`Cviků bez instructions_en: ${radky.length}. Stahuji dataset (jednou)…`);
  const zdroj = await stahniZdroj();
  /** @type {Map<string, string[]|null>} external_id -> kroky */
  const krokyPodleId = new Map(zdroj.map((cvik) => [String(cvik?.id ?? ''), krokyZeZdroje(cvik?.instructions)]));

  let doplneno = 0;
  const bezShody = [];
  const bezKroku = [];
  const chyby = [];

  for (const radek of radky) {
    const kroky = krokyPodleId.get(String(radek.external_id ?? ''));
    if (kroky === undefined) {
      // Cvik už ve zdroji není (dataset se vyvíjí). Nechává se NULL — žádný
      // náhradní text, NULL je poctivější než vymyšlený postup.
      bezShody.push(radek.canonical_key);
      continue;
    }
    if (kroky === null) {
      bezKroku.push(radek.canonical_key);
      continue;
    }

    if (dryRun) {
      doplneno += 1;
      continue;
    }

    const { data: zapsano, error } = await supabaseServer
      .from('exercise_asset_registry')
      .update({ instructions_en: kroky })
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
    bez_shody_ve_zdroji: bezShody.length,
    zdroj_bez_kroku: bezKroku.length,
    chyby: chyby.length,
  }, null, 2));
  if (bezShody.length) console.log('Bez shody ve zdroji:', bezShody.join(', '));
  if (bezKroku.length) console.log('Zdroj bez kroků:', bezKroku.join(', '));
  for (const ch of chyby) console.error('CHYBA:', ch);
  if (chyby.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
