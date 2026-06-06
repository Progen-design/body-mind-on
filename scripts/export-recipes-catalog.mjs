#!/usr/bin/env node
/**
 * Export recipes_catalog z produkční Supabase do lokálních souborů.
 *
 *   node scripts/export-recipes-catalog.mjs
 *   node scripts/export-recipes-catalog.mjs --out data/recipes_catalog
 *
 * Vytvoří:
 *   recipes_catalog.json  – kompletní data
 *   recipes_catalog.csv     – přehled pro Excel
 *   manifest.json           – metadata exportu
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const outArgIdx = process.argv.indexOf('--out');
const outDir = resolve(process.cwd(), outArgIdx >= 0 ? process.argv[outArgIdx + 1] : 'data/recipes_catalog');

for (const name of ['.env.local', '.env']) {
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

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const SELECT_COLS =
  'id, source, source_id, name_cs, name_en, meal_type, kcal, protein_g, carbs_g, fat_g, diet_tags, servings, ingredients, instructions, spoonacular_url, image_url, active, created_at';

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchAllRows() {
  const pageSize = 500;
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('recipes_catalog')
      .select(SELECT_COLS)
      .order('meal_type', { ascending: true })
      .order('kcal', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const rows = await fetchAllRows();
  const exportedAt = new Date().toISOString();

  const jsonPath = join(outDir, 'recipes_catalog.json');
  writeFileSync(jsonPath, `${JSON.stringify({ exported_at: exportedAt, count: rows.length, rows }, null, 2)}\n`, 'utf8');

  const csvHeader = [
    'id',
    'source',
    'source_id',
    'name_cs',
    'name_en',
    'meal_type',
    'kcal',
    'protein_g',
    'carbs_g',
    'fat_g',
    'diet_tags',
    'servings',
    'spoonacular_url',
    'image_url',
    'active',
  ];
  const csvLines = [csvHeader.join(',')];
  for (const row of rows) {
    csvLines.push(
      [
        row.id,
        row.source,
        row.source_id,
        row.name_cs,
        row.name_en,
        row.meal_type,
        row.kcal,
        row.protein_g,
        row.carbs_g,
        row.fat_g,
        Array.isArray(row.diet_tags) ? row.diet_tags.join('|') : '',
        row.servings,
        row.spoonacular_url,
        row.image_url,
        row.active,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  const csvPath = join(outDir, 'recipes_catalog.csv');
  writeFileSync(csvPath, `${csvLines.join('\n')}\n`, 'utf8');

  const byType = rows.reduce((acc, r) => {
    const k = r.meal_type || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const manifest = {
    exported_at: exportedAt,
    total: rows.length,
    active: rows.filter((r) => r.active === true).length,
    by_meal_type: byType,
    files: {
      json: jsonPath,
      csv: csvPath,
    },
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Export hotov: ${rows.length} receptů → ${outDir}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
