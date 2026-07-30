#!/usr/bin/env node
/**
 * Offline filter replay — zero API calls.
 *
 *   node scripts/replay-filter.mjs                    # spoonacular_raw_cache
 *   node scripts/replay-filter.mjs --from-catalog       # regression vs recipes_catalog
 *   node scripts/replay-filter.mjs --limit 100        # cache limit
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

for (const name of ['.env.local', '.env.production.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  break;
}

const fromCatalog = process.argv.includes('--from-catalog');
const limitFlag = process.argv.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : 5000;

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { filterRecipesForImport, mergeReasonCounts, evaluateRecipeForImport } = await import('../lib/spoonacular/importFilterPipeline.js');
const {
  countMainIngredients,
  setActivePantrySet,
  buildImportFiltersForMealType,
} = await import('../lib/spoonacular/catalogImportGate.js');
const { catalogRowToFilterInput } = await import('../lib/spoonacular/catalogFilterReplay.js');
const { extractInstructionStepsEn } = await import('../lib/spoonacular/instructionSteps.js');

/** Spoonacular search type → Czech catalog meal_type (cache mode). */
const SPOONACULAR_SEARCH_TYPE_TO_CATALOG = {
  breakfast: 'snidane',
  'main course': 'obed',
  salad: 'obed',
  soup: 'obed',
  snack: 'svacina',
  dessert: 'svacina',
};

const { data: pantryRows, error: pantryErr } = await supabase
  .from('pantry_ingredients')
  .select('name_normalized');
if (pantryErr) {
  console.error('pantry_ingredients load failed:', pantryErr.message);
  process.exit(1);
}
setActivePantrySet(new Set((pantryRows || []).map((r) => String(r.name_normalized || '').trim()).filter(Boolean)));

if (fromCatalog) {
  console.log('--- replay-filter --from-catalog (0 API bodů) ---');

  const { data: catalogRows, error: catErr } = await supabase
    .from('recipes_catalog')
    .select('id, source_id, name_cs, name_en, meal_type, active, prep_type, servings, kcal, protein_g, carbs_g, fat_g, ingredients, instructions')
    .eq('source', 'spoonacular')
    .order('id', { ascending: true });

  if (catErr) {
    console.error('recipes_catalog load failed:', catErr.message);
    process.exit(1);
  }

  const rows = catalogRows || [];
  console.log(`spoonacular korpus: ${rows.length} řádků`);
  console.log(`  active=true:  ${rows.filter((r) => r.active).length}`);
  console.log(`  active=false: ${rows.filter((r) => !r.active).length}`);

  let TP = 0;
  let FN = 0;
  let FP = 0;
  let TN = 0;
  let FP7Plus = 0;
  /** @type {Record<string, number>} */
  const fnReasons = {};
  /** @type {Record<string, number>} */
  const fpReasons = {};
  /** @type {Record<string, number>} */
  const allRejectReasons = {};
  /** @type {Array<{ id: number, name_cs: string, meal_type: string, mainCount: number, stepCount: number, reason: string, mappingIssues: string[] }>} */
  const falseNegatives = [];
  /** @type {Record<string, number>} */
  const mappingIssueCounts = {};

  for (const row of rows) {
    const { recipe, issues, stepCount } = catalogRowToFilterInput(row);
    for (const iss of issues) {
      mappingIssueCounts[iss] = (mappingIssueCounts[iss] || 0) + 1;
    }

    const mealType = String(row.meal_type || 'obed');
    const filters = buildImportFiltersForMealType(mealType);
    const evaluation = evaluateRecipeForImport(recipe, mealType, { filters });
    const filterPass = evaluation.pass;
    const reason = evaluation.reason || 'unknown';
    const mainCount = countMainIngredients(recipe);

    if (!filterPass) {
      allRejectReasons[reason] = (allRejectReasons[reason] || 0) + 1;
    }

    if (row.active && filterPass) TP += 1;
    else if (row.active && !filterPass) {
      FN += 1;
      fnReasons[reason] = (fnReasons[reason] || 0) + 1;
      falseNegatives.push({
        id: row.id,
        name_cs: String(row.name_cs || row.name_en || ''),
        meal_type: mealType,
        mainCount,
        stepCount,
        reason,
        mappingIssues: issues.filter((i) => i !== 'missing_ready_in_minutes'),
      });
    } else if (!row.active && filterPass) {
      FP += 1;
      if (mainCount >= 7) FP7Plus += 1;
      fpReasons[reason] = (fpReasons[reason] || 0) + 1;
    } else TN += 1;
  }

  const activeTotal = TP + FN;
  const tpRate = activeTotal > 0 ? TP / activeTotal : 0;

  console.log('\nKonfuzní matice (active = historický stav katalogu):');
  console.log('                 | filtr PASS | filtr REJECT |');
  console.log('  active=true    |    TP      |     FN       |');
  console.log(`                 |   ${String(TP).padStart(4)}     |    ${String(FN).padStart(4)}       |`);
  console.log('  active=false   |    FP      |     TN       |');
  console.log(`                 |   ${String(FP).padStart(4)}     |    ${String(TN).padStart(4)}       |`);
  console.log(`\nFP s 7+ hlavními surovinami: ${FP7Plus} (očekáváno ~0)`);

  console.log(`\nTP rate (active): ${TP}/${activeTotal} = ${(tpRate * 100).toFixed(1)}% (požadováno ≥ ${(85 / 91 * 100).toFixed(1)}%, TP ≥ 85)`);

  console.log('\nVšechny důvody reject (298 korpus):');
  for (const [r, c] of Object.entries(allRejectReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r.padEnd(24)} ${c}`);
  }

  if (Object.keys(fnReasons).length) {
    console.log('\nFN důvody (active=true, filtr REJECT):');
    for (const [r, c] of Object.entries(fnReasons).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${r.padEnd(24)} ${c}`);
    }
  }

  if (Object.keys(fpReasons).length) {
    console.log('\nFP (active=false, filtr PASS) — ukázka max 10:');
    let fpShown = 0;
    for (const row of rows) {
      if (row.active) continue;
      const { recipe } = catalogRowToFilterInput(row);
      const mealType = String(row.meal_type || 'obed');
      const ev = evaluateRecipeForImport(recipe, mealType, { filters: buildImportFiltersForMealType(mealType) });
      if (ev.pass) {
        console.log(`  id=${row.id} [${mealType}] mains=${countMainIngredients(recipe)} — ${row.name_cs}`);
        fpShown += 1;
        if (fpShown >= 10) break;
      }
    }
  }

  console.log('\nMapování katalog → filter input (explicitní mezery):');
  for (const [iss, c] of Object.entries(mappingIssueCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${iss.padEnd(32)} ${c}`);
  }

  // Podezřelí 1: no_instructions
  const noInstrFn = falseNegatives.filter((f) => f.reason === 'no_instructions');
  console.log(`\nPodezřelí — no_instructions FN: ${noInstrFn.length}`);
  for (const f of noInstrFn.slice(0, 5)) {
    console.log(`  id=${f.id} steps=${f.stepCount} mapping=${f.mappingIssues.join(',') || '—'} — ${f.name_cs}`);
  }

  // Podezřelí 2: requires_cooking u svacina
  const cookFn = falseNegatives.filter((f) => f.reason === 'requires_cooking' && f.meal_type === 'svacina');
  console.log(`\nPodezřelí — requires_cooking FN u svacina: ${cookFn.length}`);
  for (const f of cookFn) {
    console.log(`  id=${f.id} mains=${f.mainCount} steps=${f.stepCount} — ${f.name_cs}`);
  }

  if (falseNegatives.length) {
    console.log('\n=== FALSE NEGATIVES (všechny) ===');
    for (const f of falseNegatives) {
      console.log(
        `  id=${f.id} [${f.meal_type}] reason=${f.reason} mains=${f.mainCount} steps=${f.stepCount}`
        + ` — ${f.name_cs.slice(0, 70)}`,
      );
    }
  }

  const passThreshold = TP >= 85;
  console.log(`\nRESULT: ${passThreshold ? 'PASS' : 'FAIL'} (TP=${TP}, need ≥85)`);
  process.exit(passThreshold ? 0 : 1);
}

// --- raw cache mode ---
const { data: cacheRows, error: cacheErr } = await supabase
  .from('spoonacular_raw_cache')
  .select('source_id, payload, query_meal_type, query_signature, fetched_at')
  .order('fetched_at', { ascending: false })
  .limit(Math.max(1, Math.floor(limit)));

if (cacheErr) {
  console.error('spoonacular_raw_cache load failed:', cacheErr.message);
  process.exit(1);
}

const rows = cacheRows || [];
console.log('--- replay-filter (raw cache) ---');
console.log(`cached recipes: ${rows.length}`);

if (!rows.length) {
  console.log('\nCache prázdná. Pro regresi použij: node scripts/replay-filter.mjs --from-catalog');
  process.exit(0);
}

/** @type {Record<string, number>} */
let totalReasons = {};
let total = 0;
let passed = 0;

for (const row of rows) {
  const payload = row.payload;
  if (!payload || typeof payload !== 'object') continue;

  const spoonType = String(row.query_meal_type || payload.type || 'main course');
  const catalogMealType = SPOONACULAR_SEARCH_TYPE_TO_CATALOG[spoonType] || 'obed';
  const filters = buildImportFiltersForMealType(catalogMealType);
  const result = filterRecipesForImport([payload], catalogMealType, { filters });

  total += 1;
  if (result.kept.length > 0) passed += 1;
  totalReasons = mergeReasonCounts(totalReasons, result.reasonCounts);
}

const passRate = total > 0 ? passed / total : 0;
console.log(`\npass rate: ${(passRate * 100).toFixed(1)}% (${passed}/${total})`);
for (const [reason, count] of Object.entries(totalReasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason.padEnd(24)} ${count}`);
}
process.exit(passRate >= 0.25 ? 0 : 1);
