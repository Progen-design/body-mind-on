/**
 * docs/DALSI_KROK.md 9.9 — U CVIKU MÁ BÝT I POSTUP, NEJEN OBRÁZEK.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 185 z 230 cviků pochází z free-exercise-db a dataset má u každého pole
 * `instructions` — import ho zahazoval, protože nebylo kam ho uložit.
 * Postup se NIKDY negeneruje modelem (zdravotně citlivý text, vymyšlený
 * postup u dřepu je horší než žádný) — jen přebírá ze zdroje a překládá
 * TOUTÉŽ linkou jako recepty. Do UI jde výhradně čeština.
 *
 * `supabaseServer` je lazy proxy, takže čisté funkce jdou importovat přímo;
 * frontové dotazy a cron se testují tvarem zdrojáku (jako stripeSkipAlert).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { krokyZeZdroje, pripravRadek } from '../exerciseImportRun.js';
import { doplnSvalyDoPlanu, SLOUPCE_REGISTRU_PRO_SVALY } from '../profile/svalyDoPlanu.js';

const KOREN = join(import.meta.dirname, '..', '..');

const CVIK_ZE_ZDROJE = {
  id: 'Barbell_Squat',
  name: 'Barbell Squat',
  equipment: 'barbell',
  category: 'strength',
  level: 'beginner',
  primaryMuscles: ['quadriceps'],
  images: ['Barbell_Squat/0.jpg'],
  instructions: ['Stand with the barbell on your back.', '  Squat down.  ', ''],
};

test('krokyZeZdroje: ořeže a vyfiltruje prázdné kroky, bez kroků vrací null', () => {
  assert.deepEqual(
    krokyZeZdroje(CVIK_ZE_ZDROJE.instructions),
    ['Stand with the barbell on your back.', 'Squat down.']
  );
  // NULL je poctivější než [] — řádek bez postupu nemá co překládat ani ukazovat.
  assert.equal(krokyZeZdroje([]), null);
  assert.equal(krokyZeZdroje(['', '   ']), null);
  assert.equal(krokyZeZdroje(undefined), null);
  assert.equal(krokyZeZdroje('not-an-array'), null);
});

test('import ukládá instructions_en; cvik bez instrukcí dostane NULL, ne vymyšlený text', () => {
  const s = pripravRadek(CVIK_ZE_ZDROJE);
  assert.ok('radek' in s, `cvik měl projít, padl na: ${s.duvod}`);
  assert.deepEqual(s.radek.instructions_en, ['Stand with the barbell on your back.', 'Squat down.']);
  // Čeština se při importu NEVYPLŇUJE — vzniká až překladem.
  assert.equal('instructions_cs' in s.radek, false);

  const bez = pripravRadek({ ...CVIK_ZE_ZDROJE, instructions: [] });
  assert.ok('radek' in bez);
  assert.equal(bez.radek.instructions_en, null);
});

test('do UI jde jen čeština: profil čte instructions_cs a angličtinu vůbec nenačítá', () => {
  assert.match(SLOUPCE_REGISTRU_PRO_SVALY, /instructions_cs/);
  assert.doesNotMatch(SLOUPCE_REGISTRU_PRO_SVALY, /instructions_en/,
    'anglický otisk nesmí ani opustit server — UI ho nemá jak ukázat omylem');

  const plan = {
    structured_plan_json: {
      days: [{ workout: { exercises: [{ canonical_key: 'situp_test' }, { canonical_key: 'bez_zaznamu' }] } }],
    },
  };
  const [obohaceny] = doplnSvalyDoPlanu([plan], [
    { canonical_key: 'situp_test', primary_muscle: 'abs', instructions_cs: ['Lehni si.', 'Zvedni trup.'] },
    // Prázdný postup se nepropisuje — UI pak nekreslí nic.
    { canonical_key: 'bez_zaznamu', primary_muscle: 'chest', instructions_cs: [] },
  ]);
  const [sPostupem, bezPostupu] = obohaceny.structured_plan_json.days[0].workout.exercises;
  assert.deepEqual(sPostupem.instructions_cs, ['Lehni si.', 'Zvedni trup.']);
  assert.equal(bezPostupu.instructions_cs, null);
});

test('překlad jede stejnou linkou jako recepty a kroky drží 1:1', () => {
  const zdroj = readFileSync(join(KOREN, 'lib', 'prekladPostupuCviku.js'), 'utf8');

  // Fronta se řídí sloupci v DB, jako u receptů (`translated_at` tam, tady
  // dvojice instructions_en/instructions_cs).
  assert.match(zdroj, /\.not\('instructions_en', 'is', null\)/);
  assert.match(zdroj, /\.is\('instructions_cs', null\)/);

  // Stejné zásady jako catalogTranslate: deterministický překlad, ověřený
  // zápis, prompt verzovaný v gitu s otiskem.
  assert.match(zdroj, /temperature: 0/);
  assert.match(zdroj, /\.select\('id'\)/, 'zápis se ověřuje tím, co UPDATE vrátí');
  assert.match(zdroj, /PREKLAD_POSTUPU_PROMPT_SHA256/);

  // Tvrdá podmínka 1:1 — méně kroků = model něco zahodil, více = domyslel.
  assert.match(zdroj, /kroky\.length !== row\.instructions_en\.length/);

  // Zapisuje se VÝHRADNĚ instructions_cs — nic jiného překlad měnit nesmí.
  assert.match(zdroj, /\.update\(\{ instructions_cs: kroky \}\)/);
});

test('prompt překládá, negeneruje — a soubor je tam, odkud ho funkce čte', () => {
  const cesta = join(KOREN, 'prompts', 'exercise-instructions-translate.md');
  assert.ok(existsSync(cesta), 'prompt musí ležet v prompts/ (includeFiles ve vercel.json)');
  const prompt = readFileSync(cesta, 'utf8');

  assert.match(prompt, /Nikdy nedoplňuj, co ve zdroji není/);
  assert.match(prompt, /stejný počet kroků/i, 'model nesmí kroky přidávat ani zahazovat');
  assert.match(prompt, /zdravotně citliv/i, 'důvod tvrdosti pravidla patří i do promptu');
});

test('cron: fronty se STŘÍDAJÍ přes translateQueueOrchestrator, ne "recepty mají přednost"', () => {
  // Tenhle test dřív hlídal přesně opačnou věc — `if (result.translated === 0)`
  // jako podmínku pro cviky. To byla ta chyba: recepty nikdy nedojdou na
  // nulu (import je denně doplňuje), takže cviky nikdy nepřišly na řadu
  // (183 anglických postupů, 0 českých). Řešení a úvaha proč zrovna
  // kolotočové střídání přes perzistovaný ukazatel je v
  // lib/translateQueueOrchestrator.js.
  const cron = readFileSync(join(KOREN, 'api', 'cron', 'translate-recipes.js'), 'utf8');

  assert.doesNotMatch(
    cron, /if \(result\.translated === 0\)/,
    'starý hladový gate se nesmí vrátit — cviky by zase nikdy nepřišly na řadu'
  );

  assert.match(cron, /provedJedenTahPrekladu/, 'rozhodnutí + spuštění patří do orchestrátoru, ne inline do cronu');
  assert.match(cron, /countRemainingUntranslated/, 'fronta receptů se peekuje bez OpenAI volání, než se rozhodne, kdo běží');
  assert.match(cron, /zbyvaPrelozitPostupu/, 'fronta cviků se peekuje bez OpenAI volání, než se rozhodne, kdo běží');
  assert.match(cron, /nactiPosledniFrontu/, 'střídání potřebuje vědět, kdo byl na řadě naposled, napříč běhy');
  assert.match(cron, /ulozPosledniFrontu/, 'kdo doopravdy běžel se musí zapsat, jinak střídání neplatí pro příští běh');
});

test('doplňovací skript stahuje dataset jednou, ne 185×', () => {
  const skript = readFileSync(join(KOREN, 'scripts', 'doplneni-postupu-cviku.mjs'), 'utf8');
  const stazeni = [...skript.matchAll(/stahniZdroj\(\)/g)];
  assert.equal(stazeni.length, 1, 'jedno stažení pro celý běh');
  assert.match(skript, /external_source', 'free-exercise-db'/, 'doplňuje se jen zdroj, který instrukce má');
  assert.match(skript, /\.is\('instructions_en', null\)/, 'jen řádky, kterým kroky chybí');
  assert.match(skript, /--dry-run/, 'jde si nanečisto ověřit, co by se zapsalo');
});
