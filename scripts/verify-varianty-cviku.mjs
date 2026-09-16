#!/usr/bin/env node
/**
 * PROMPT_PRO_CODE.md bod B — ověření párů easier_key/harder_key v
 * exercise_asset_registry (tlačítka "lehčí/těžší varianta" u cviku).
 *
 * Analytická logika je v `lib/exerciseVariantAudit.js` (testovatelná bez
 * DB) — tenhle soubor je jen tenký orchestrátor: načte registr, zavolá
 * analýzu, vypíše výsledek na konzoli a volitelně zapíše Markdown report.
 *
 * CO JE HARD FAIL (skript skončí nenulově) a proč, viz hlavička
 * `lib/exerciseVariantAudit.js`. Ve stručnosti: neshoda `primary_muscle`
 * (nezávislý, čistý enum) a strukturální rozbití grafu (rozbitý odkaz,
 * self-reference, cyklus). Porušení `level` logiky a vzájemná (a)symetrie
 * jsou JEN report — level je samo o sobě nespolehlivý zdroj a symetrie
 * neplatí ani logicky.
 *
 * READ-ONLY: jen SELECT nad exercise_asset_registry, nic se nezapisuje.
 * Nenavrhuje nové páry ani nic v DB nemění — to je na ručním rozhodnutí
 * (viz PROMPT_PRO_CODE.md bod B, pravidlo 3).
 *
 * Použití:
 *   node scripts/verify-varianty-cviku.mjs                  — jen konzole + exit kód
 *   node scripts/verify-varianty-cviku.mjs --report <path>   — navíc zapíše
 *     podrobný Markdown report (pro ruční review) na <path>
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './audit-utils.mjs';
import { analyzujVarianty, popisCviku, FAN_IN_THRESHOLD } from '../lib/exerciseVariantAudit.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

function parseArgs(argv) {
  const idx = argv.indexOf('--report');
  return { reportPath: idx > -1 ? argv[idx + 1] : null };
}

async function main() {
  const { reportPath } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Chybí NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY (viz .env.local).');
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: rows, error } = await supabase
    .from('exercise_asset_registry')
    .select('canonical_key, display_name_cs, level, easier_key, harder_key, primary_muscle, equipment_class')
    .order('canonical_key');
  // `persistSession: false` samo o sobě neuklidí realtime/auth handle
  // klienta na Windows — `process.exit()` po dokončení pak umí spadnout na
  // "UV_HANDLE_CLOSING" assertu (libuv race). `removeAllChannels` handle
  // uklidí, aby proces mohl doběhnout přirozeně přes `process.exitCode`.
  await supabase.removeAllChannels();
  if (error) {
    console.error('Nepodařilo se načíst exercise_asset_registry:', error.message);
    process.exitCode = 1;
    return;
  }

  const {
    strukturalni, tvrdeParyMuscle, reportOnlyPary, celkemParu,
    levelPoruseni, levelPosouditelnych, asymetrickych, fanIn, fanInNapricPartiemi,
  } = analyzujVarianty(rows);

  console.log('--- strukturální integrita grafu (hard fail) ---');
  if (strukturalni.length === 0) console.log('OK žádný rozbitý odkaz, self-reference ani cyklus');
  else strukturalni.forEach((m) => console.log(`FAIL ${m}`));

  console.log('\n--- neshoda partie cvik vs. varianta (hard fail) ---');
  if (tvrdeParyMuscle.length === 0) console.log('OK žádná neshoda primary_muscle');
  else {
    console.log(`FAIL ${tvrdeParyMuscle.length} párů z ${celkemParu} má jinou primary_muscle u varianty`);
    for (const p of tvrdeParyMuscle) {
      console.log(`  FAIL ${popisCviku(p.row)} --${p.smer}--> ${popisCviku(p.cil)}`);
    }
  }

  console.log('\n--- report-only signály (nespadne skript, viz report pro detail) ---');
  console.log(`INFO level: ${levelPoruseni}/${levelPosouditelnych} posouditelných párů porušuje vlastní level logiku`);
  console.log(`INFO symetrie: ${asymetrickych}/${celkemParu} párů je vzájemně nekonzistentních (A.{easier|harder}=B, B.recipročně≠A)`);
  console.log(`INFO fan-in: ${fanIn.length} klíčů použito jako cíl >= ${FAN_IN_THRESHOLD}x, z toho ${fanInNapricPartiemi.length} napříč různými partiemi`);
  console.log(`INFO report-only párů k ruční revizi: ${reportOnlyPary.length}`);

  if (reportPath) {
    const md = sestavMarkdown({
      rows, celkemParu, strukturalni, tvrdeParyMuscle, reportOnlyPary,
      levelPoruseni, levelPosouditelnych, asymetrickych, fanIn, fanInNapricPartiemi,
    });
    fs.writeFileSync(path.resolve(reportPath), md, 'utf8');
    console.log(`\nReport zapsán do ${reportPath}`);
  }

  const failed = strukturalni.length + tvrdeParyMuscle.length;
  console.log(failed ? `\nRESULT: FAIL (${failed} tvrdých nálezů)` : '\nRESULT: OK (0 tvrdých nálezů — zbytek čeká na ruční review v reportu)');
  process.exitCode = failed ? 1 : 0;
}

function sestavMarkdown({
  rows, celkemParu, strukturalni, tvrdeParyMuscle, reportOnlyPary,
  levelPoruseni, levelPosouditelnych, asymetrickych, fanIn, fanInNapricPartiemi,
}) {
  const dnes = new Date().toISOString().slice(0, 10);
  const radek = (p) => `| ${popisCviku(p.row)} | ${p.smer} | ${popisCviku(p.cil)} | level: ${p.poruseniLevelu ? 'porušen' : (p.levelNelzePosoudit ? '—' : 'OK')}, symetrie: ${p.asymetricke ? `porušena (${p.reciprocniPole} u varianty je "${p.reciprocniSkutecnost}", ne "${p.row.canonical_key}")` : 'OK'} |`;

  return `# Audit párů lehčí/těžší varianta (exercise_asset_registry)

Vygenerováno ${dnes} skriptem \`scripts/verify-varianty-cviku.mjs --report\`.
Zdroj pravdy je živý stav tabulky \`exercise_asset_registry\` (${rows.length} cviků)
v momentě spuštění — při dalším spuštění se čísla mohou lišit, jak se katalog
mění. Nic v DB se tímto skriptem nemění a nenavrhuje se tu žádný nový pár —
rozhodnutí a migraci dělá člověk (viz PROMPT_PRO_CODE.md, bod B).

## Metodika — co je hard fail a co jen report

**Hard fail** (skript bez \`--report\` skončí nenulově):

1. Neshoda \`primary_muscle\` mezi cvikem a jeho variantou — čistý enum,
   100% pokrytí, nezávislý na nespolehlivém \`level\`. Neshoda u ~24 % párů
   je vzácná a silná, ne šum.
2. Strukturální rozbití grafu — odkaz na neexistující cvik, self-reference,
   stejný cíl pro easier i harder, nebo cyklus (\`A je lehčí než B, B je
   lehčí než A\`).

**Jen report** (nespadne skript, jen k ruční revizi):

- Porušení vlastní \`level\` logiky — porušuje ji ${levelPoruseni} z
  ${levelPosouditelnych} posouditelných párů. Brána, kterou neprojde
  většina dat, nic nehlídá, a navíc je to srovnání podle sloupce, o kterém
  víme, že je nekvalitní (\`barbell_squat\` = beginner, \`goblet_squat\` =
  intermediate). Bereme to jako důkaz, jak páry vznikly (bucketování podle
  levelu), ne jako cíl.
- Vzájemná (a)symetrie \`A.easier=B\`, ale \`B.harder≠A\` — ${asymetrickych}
  z ${celkemParu} párů. Neplatí to ani logicky: B může mít lepší harder
  variantu než A, aniž by to byla chyba.
- \`equipment_class\` se u progrese mění téměř vždy (dumbbell -> barbell je
  legitimní), takže se v tomhle reportu ukazuje jen jako kontext u
  \`primary_muscle\`, ne jako vlastní kritérium — proto se nikde níž
  nepočítá samostatně.
- "Fan-in" — klíč použitý jako cíl u >= ${FAN_IN_THRESHOLD} cviků. Sám o
  sobě nedokazuje chybu, ale fan-in napříč RŮZNÝMI partiemi je otisk
  bucketování, ne kurace.

## A. Hard fail — strukturální integrita (${strukturalni.length})

${strukturalni.length === 0
    ? '_Žádný nález — 0 rozbitých odkazů, self-referencí ani cyklů._'
    : strukturalni.map((m) => `- ${m}`).join('\n')}

## B. Hard fail — neshoda partie (${tvrdeParyMuscle.length} párů)

Seřazeno tak, aby nahoře byly páry, kde se sešlo víc signálů (level i
symetrie) — tam je jistota chyby nejvyšší.

| Cvik | Směr | Varianta | Další signály |
|---|---|---|---|
${tvrdeParyMuscle.map(radek).join('\n')}

## C. Report-only — level, symetrie (${reportOnlyPary.length} párů k ruční revizi)

Neshoda partie tu není (jinak by byly v sekci B) — jde jen o porušení
level logiky a/nebo vzájemné symetrie. Seřazeno stejně: víc sešlých signálů
nahoře.

| Cvik | Směr | Varianta | Signály |
|---|---|---|---|
${reportOnlyPary.map(radek).join('\n')}

## D. Report-only — fan-in (${fanIn.length} klíčů >= ${FAN_IN_THRESHOLD}x, z toho ${fanInNapricPartiemi.length} napříč partiemi)

Klíče použité jako cíl u podezřele mnoha cviků. Řádky s víc než jednou
partií ve zdrojích jsou nejpodezřelejší — legitimní univerzální varianta
by typicky sloužila jedné partii, ne několika různým.

| Cíl | Směr | Počet zdrojů | Partie zdrojů | Zdrojové cviky |
|---|---|---|---|---|
${fanIn.map((f) => `| ${popisCviku(f.cil)} | ${f.smer} | ${f.zdroje.length} | ${f.partie.join(', ') || '—'} | ${f.zdroje.map((z) => z.canonical_key).join(', ')} |`).join('\n')}
`;
}

main();
