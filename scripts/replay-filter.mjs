#!/usr/bin/env node
/**
 * Offline filter replay over spoonacular_raw_cache — zero API calls.
 *
 *   node scripts/replay-filter.mjs
 *   node scripts/replay-filter.mjs --limit=100
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

const limitFlag = process.argv.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : 5000;

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { filterRecipesForImport, mergeReasonCounts } = await import('../lib/spoonacular/importFilterPipeline.js');
const {
  getMealSimplicityRules,
  setActivePantrySet,
} = await import('../lib/spoonacular/catalogImportGate.js');

/** Spoonacular search type → Czech catalog meal_type (mirror catalogImport.js). */
const SPOONACULAR_SEARCH_TYPE_TO_CATALOG = {
  breakfast: 'snidane',
  'main course': 'obed',
  salad: 'obed',
  soup: 'obed',
  snack: 'svacina',
  dessert: 'svacina',
};

const DEFAULT_CATALOG_IMPORT_FILTERS = { minProtein: 5, maxSugar: 30 };

function buildImportFiltersForMealType(catalogMealType) {
  const rules = getMealSimplicityRules(catalogMealType);
  return { ...DEFAULT_CATALOG_IMPORT_FILTERS, maxReadyTime: rules.maxReadyTime };
}

const { data: pantryRows, error: pantryErr } = await supabase
  .from('pantry_ingredients')
  .select('name_normalized');
if (pantryErr) {
  console.error('pantry_ingredients load failed:', pantryErr.message);
  process.exit(1);
}
setActivePantrySet(new Set((pantryRows || []).map((r) => String(r.name_normalized || '').trim()).filter(Boolean)));

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
console.log('--- replay-filter (offline) ---');
console.log(`cached recipes: ${rows.length}`);

if (!rows.length) {
  console.log('\nCache je prázdná — žádné API volání.');
  console.log('42 receptů z běhů 09:07 UTC nejsou v cache (tabulka neexistovala).');
  console.log('Po příštím importu se payloady uloží a replay ukáže důvody per reason.');
  console.log('\nOdhad důvodů 100% reject (1c50b61 JE na produkci):');
  console.log('  - too_complex: americké recepty 8–15 surovin vs limit 3–6');
  console.log('  - requires_cooking: snack/dessert → svacina (noCooking=true)');
  console.log('  - min_protein/max_sugar: API už prefiltrovalo, zbytek stejně neprojde gate');
  process.exit(0);
}

/** @type {Record<string, number>} */
let totalReasons = {};
let total = 0;
let passed = 0;

/** @type {Array<{ source_id: string, title: string, reason: string, meal_type: string }>} */
const samples = [];

for (const row of rows) {
  const payload = row.payload;
  if (!payload || typeof payload !== 'object') continue;

  const spoonType = String(row.query_meal_type || payload.type || 'main course');
  const catalogMealType = SPOONACULAR_SEARCH_TYPE_TO_CATALOG[spoonType] || 'obed';
  const filters = buildImportFiltersForMealType(catalogMealType);
  const result = filterRecipesForImport([payload], catalogMealType, { filters });

  total += 1;
  if (result.kept.length > 0) {
    passed += 1;
  } else {
    const reason = result.skipped[0]?.reason || 'unknown';
    if (samples.length < 15) {
      samples.push({
        source_id: row.source_id,
        title: String(payload.title || ''),
        reason,
        meal_type: catalogMealType,
      });
    }
  }
  totalReasons = mergeReasonCounts(totalReasons, result.reasonCounts);
}

const passRate = total > 0 ? (passed / total) : 0;

console.log('\nResults:');
console.log(`  total:      ${total}`);
console.log(`  passed:     ${passed}`);
console.log(`  rejected:   ${total - passed}`);
console.log(`  pass rate:  ${(passRate * 100).toFixed(1)}%`);

console.log('\nRejection reasons:');
for (const [reason, count] of Object.entries(totalReasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason.padEnd(24)} ${count}`);
}

if (samples.length) {
  console.log('\nSample rejections:');
  for (const s of samples) {
    console.log(`  [${s.meal_type}] ${s.reason} — ${s.title.slice(0, 60)} (${s.source_id})`);
  }
}

if (passRate >= 0.25) {
  console.log('\nRESULT: PASS (pass rate >= 25%)');
  process.exit(0);
}

console.log('\nRESULT: FAIL (pass rate < 25%)');
process.exit(1);
