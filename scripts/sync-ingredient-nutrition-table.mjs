#!/usr/bin/env node
/**
 * Regenerate lib/nutrition/ingredientNutritionTable.js BY_NORMALIZED block
 * from public.ingredients_nutrition (rows with name_cs).
 *
 *   node scripts/sync-ingredient-nutrition-table.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE credentials');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const { data, error } = await sb
  .from('ingredients_nutrition')
  .select('name_cs, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g')
  .not('name_cs', 'is', null)
  .order('name_cs');

if (error) {
  console.error(error.message);
  process.exit(1);
}

const entries = [];
const seen = new Set();
for (const row of data || []) {
  const key = norm(row.name_cs);
  if (!key || seen.has(key)) continue;
  seen.add(key);
  const kcal = Number(row.kcal_per_100g) || 0;
  const p = Number(row.protein_g_per_100g) || 0;
  const c = Number(row.carbs_g_per_100g) || 0;
  const f = Number(row.fat_g_per_100g) || 0;
  if (!(kcal > 0) && !(p > 0)) continue;
  const quoted = `'${key.replace(/'/g, "\\'")}'`;
  entries.push(
    `  ${quoted}: { kcal: ${kcal}, protein_g: ${p}, carbs_g: ${c}, fat_g: ${f} },`
  );
}

// Stable aliases used by START recipes
const aliases = [
  ["jogurt", 'bily jogurt'],
  ["protein", 'proteinovy prasek'],
  ["tunak", 'tunak (v konzerve)'],
  ["mandle", 'orechy'],
  ["celozrnne pecivo", 'celozrnny chleb'],
];
for (const [alias, target] of aliases) {
  const src = (data || []).find((r) => norm(r.name_cs) === target);
  if (!src || seen.has(alias)) continue;
  seen.add(alias);
  const quoted = `'${alias.replace(/'/g, "\\'")}'`;
  entries.push(
    `  ${quoted}: { kcal: ${Number(src.kcal_per_100g) || 0}, protein_g: ${Number(src.protein_g_per_100g) || 0}, carbs_g: ${Number(src.carbs_g_per_100g) || 0}, fat_g: ${Number(src.fat_g_per_100g) || 0} },`
  );
}

const targetPath = resolve(process.cwd(), 'lib/nutrition/ingredientNutritionTable.js');
const current = readFileSync(targetPath, 'utf8');
const start = current.indexOf('const BY_NORMALIZED = {');
const end = current.indexOf('};', start);
if (start < 0 || end < 0) {
  console.error('Could not find BY_NORMALIZED block');
  process.exit(1);
}
const next =
  current.slice(0, start)
  + 'const BY_NORMALIZED = {\n'
  + `${entries.join('\n')}\n`
  + current.slice(end);

writeFileSync(targetPath, next, 'utf8');
console.log(JSON.stringify({ ok: true, rows: entries.length, path: targetPath }, null, 2));
