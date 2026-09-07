/**
 * docs/DALSI_KROK.md 9.3 — SPOONACULAR NEBĚŽEL 18 DNÍ A NIKDO SE TO NEDOZVĚDĚL.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 7. 9. 2026: poslední běh importu 20. 8., všech 66 dotazů v rotaci vyřazených
 * (pool_empty/pool_exhausted). Cron běžel, nenašel co dělat, nezapsal o tom
 * záznam — a hlídka mlčela, protože `import_rotace_vycerpana` byla jen `info`
 * a `import_nebezel` se přes EXISTS vypínala přesně tehdy, když byl pool
 * prázdný.
 *
 * `supabaseServer` se nedá podvrhnout přes import (stejně jako v
 * stripeSkipAlert.test.mjs), takže se testuje tvar zdrojáku a migrace.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');
const rotace = readFileSync(join(KOREN, 'lib', 'spoonacular', 'importQueryRotation.js'), 'utf8');
const denniImport = readFileSync(join(KOREN, 'lib', 'spoonacular', 'catalogImport.js'), 'utf8');

test('(1) rotace se umí znovuotevřít: exhausted_at je dočasný stav, ne rozsudek', () => {
  const i = rotace.indexOf('export async function reopenExhaustedImportQueries');
  assert.ok(i > 0, 'reopenExhaustedImportQueries se nenašla');
  const telo = rotace.slice(i, i + 900);

  assert.match(telo, /exhausted_at:\s*null/, 'znovuotevření musí smazat exhausted_at');
  assert.match(telo, /retired_reason:\s*null/, 'a automatem zapsaný retired_reason');
  assert.match(telo, /\.lt\('exhausted_at'/, 'otvírá se jen po uplynutí lhůty, ne hned');
  assert.match(
    telo,
    /DOCASNE_DUVODY_VYRAZENI/,
    'smí zrušit jen dočasné důvody — trvale vyřazený dotaz se znovu neotvírá'
  );
});

test('(1) dočasné důvody jsou jen ty, které zapisuje automat', () => {
  assert.match(
    rotace,
    /DOCASNE_DUVODY_VYRAZENI\s*=\s*\['pool_empty',\s*'pool_exhausted'\]/,
    'pool_empty a pool_exhausted zapisuje advanceImportQueryAfterRun — cokoli jiného je ruční trvalé vyřazení'
  );
});

test('(1) výběr do rotace nebere trvale vyřazené dotazy', () => {
  const i = rotace.indexOf('export async function selectImportQueriesGlobal');
  assert.ok(i > 0);
  const telo = rotace.slice(i, i + 900);

  assert.match(telo, /\.is\('exhausted_at',\s*null\)/);
  assert.match(
    telo,
    /\.is\('retired_reason',\s*null\)/,
    'stejná definice „použitelný dotaz" jako ve větvích system_health_alerts_zaklad'
  );
});

test('(1+3) denní běh: nejdřív doplnit rotaci, pak vybírat, naprázdno zapsat běh', () => {
  const i = denniImport.indexOf('export async function runDailySpoonacularCatalogImport');
  assert.ok(i > 0);
  const telo = denniImport.slice(i);

  const reopen = telo.indexOf('reopenExhaustedImportQueries()');
  const vyber = telo.indexOf('selectImportQueriesGlobal(');
  assert.ok(reopen > 0, 'denní běh musí rotaci doplňovat');
  assert.ok(reopen < vyber, 'doplnění musí proběhnout PŘED výběrem dotazů, jinak se projeví až další den');

  // Krok 3: bez řádku v spoonacular_import_runs nejde rozlišit „cron neběžel"
  // od „běžel a neměl co dělat" — přesně to schovalo 18 dní stojící import.
  const skok = telo.indexOf('queries.length === 0');
  assert.ok(skok > 0, 'prázdný pool musí mít vlastní větev');
  const skokTelo = telo.slice(skok, skok + 1600);
  assert.match(skokTelo, /createImportRunLogger\(runId, 'none', 'preskoceno:pool_prazdny', 0\)/,
    'běh naprázdno se zapisuje s důvodem přeskočení');
  assert.match(skokTelo, /finish\(\{\}\)/,
    'a BEZ error — neprázdný error by spustil critical import_beh_chyba');
  assert.match(skokTelo, /stoppedReason = 'pool_prazdny'/,
    'důvod zastavení musí být vidět i v odpovědi cronu');
});

test('(2) hlídka: prázdný pool je warning a import_nebezel se už neumlčuje', () => {
  const migrace = readdirSync(join(KOREN, 'supabase', 'migrations'))
    .filter((f) => f.includes('prazdny_import_pool'));
  assert.equal(migrace.length, 1, 'čekána právě jedna migrace k 9.3');

  const sql = readFileSync(join(KOREN, 'supabase', 'migrations', migrace[0]), 'utf8');

  assert.match(sql, /''warning''\\1/, 'import_rotace_vycerpana se zvedá z info na warning');
  assert.match(sql, /import_pool_ma_pouzitelne_dotazy/, 'text hlášky import_nebezel se řídí stavem poolu');
  assert.match(sql, /pool dotazu je prazdny/, 'prázdný pool má vlastní znění hlášky');

  // Klíčové: view se NEPŘEPISUJE ručně (přes 20 větví), patchuje se aktuální
  // definice z pg_get_viewdef a security_invoker se obnovuje explicitně.
  assert.match(sql, /pg_get_viewdef/);
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /preskakuji/, 'migrace musí být idempotentní');
  assert.equal(
    /CREATE OR REPLACE VIEW public\.system_health_alerts_zaklad AS\s*\n\s*SELECT/.test(sql),
    false,
    'view se nesmí přepisovat ručně vypsanou definicí'
  );

  // NEDĚLAT z 9.3: rozpočtová větev zůstává netknutá a kontroluje se to.
  assert.match(sql, /budget_exhausted/, 'kontrola, že větev rozpočtu přežila patch');
});
