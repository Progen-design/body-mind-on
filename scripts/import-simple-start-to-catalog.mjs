#!/usr/bin/env node
/**
 * Import SIMPLE_START_RECIPES → recipes_catalog (source=simple_start),
 * fill missing ingredients_nutrition / unit_conversions, compute nutrition.
 *
 *   node scripts/import-simple-start-to-catalog.mjs
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { SIMPLE_START_RECIPES } from '../lib/simpleStartRecipeLibrary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

for (const name of ['.env.local', '.env']) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const MEAL_TYPE_MAP = {
  breakfast: 'snidane',
  lunch: 'obed',
  dinner: 'vecere',
  snack: 'svacina',
};

/** Map library ingredient names → ingredients_nutrition.name_cs */
const NAME_MAP = {
  'celozrnné pečivo': 'celozrnný chléb',
  'celozrne pecivo': 'celozrnný chléb',
  jogurt: 'bílý jogurt',
  protein: 'proteinový prášek',
  'tuňák ve vlastní šťávě': 'tuňák (v konzervě)',
  tunak: 'tuňák (v konzervě)',
  'arašídové máslo': 'arašídové máslo',
  arasidove: 'arašídové máslo',
  mandle: 'ořechy',
  cottage: 'cottage',
  kefír: 'kefír',
  kefir: 'kefír',
  čočka: 'čočka',
  cocka: 'čočka',
  fazole: 'fazole',
  těstoviny: 'těstoviny',
  testoviny: 'těstoviny',
  šunka: 'šunka',
  sunka: 'šunka',
  sýr: 'sýr',
  syr: 'sýr',
  zelenina: 'zelenina',
};

/** Missing reference rows (per 100 g). */
const EXTRA_INGREDIENTS = [
  { name_cs: 'zelenina', name_en: 'mixed vegetables', kcal_per_100g: 35, protein_g_per_100g: 2, carbs_g_per_100g: 6, fat_g_per_100g: 0.3 },
  { name_cs: 'cottage', name_en: 'cottage cheese', kcal_per_100g: 98, protein_g_per_100g: 11, carbs_g_per_100g: 3.4, fat_g_per_100g: 4.3 },
  { name_cs: 'kefír', name_en: 'kefir', kcal_per_100g: 41, protein_g_per_100g: 3.3, carbs_g_per_100g: 4.5, fat_g_per_100g: 1 },
  { name_cs: 'čočka', name_en: 'lentils dry', kcal_per_100g: 352, protein_g_per_100g: 25, carbs_g_per_100g: 60, fat_g_per_100g: 1.1 },
  { name_cs: 'fazole', name_en: 'beans canned drained', kcal_per_100g: 90, protein_g_per_100g: 6.5, carbs_g_per_100g: 15, fat_g_per_100g: 0.5 },
  { name_cs: 'těstoviny', name_en: 'pasta dry', kcal_per_100g: 350, protein_g_per_100g: 12, carbs_g_per_100g: 72, fat_g_per_100g: 1.5 },
  { name_cs: 'šunka', name_en: 'ham', kcal_per_100g: 145, protein_g_per_100g: 18, carbs_g_per_100g: 1.5, fat_g_per_100g: 7 },
  { name_cs: 'sýr', name_en: 'cheese sliced', kcal_per_100g: 350, protein_g_per_100g: 25, carbs_g_per_100g: 1.5, fat_g_per_100g: 27 },
];

const EXTRA_UNITS = [
  { unit: 'ks', grams: 200, ingredient_match: 'okurka' },
  { unit: 'konzerva', grams: 150, ingredient_match: 'tuňák (v konzervě)' },
  { unit: 'konzerva', grams: 240, ingredient_match: 'fazole' },
  { unit: 'plátek', grams: 20, ingredient_match: 'sýr' },
  { unit: 'plátky', grams: 20, ingredient_match: 'sýr' },
  { unit: 'plátků', grams: 20, ingredient_match: 'sýr' },
];

function parseAmount(raw) {
  const s = String(raw || '').trim().replace(',', '.');
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseIngredientLine(line) {
  const original = String(line || '').trim();
  // "name amount unit" — amount may be 1/2
  const m = original.match(/^(.+?)\s+(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s+(.+)$/u);
  if (!m) {
    return { name: original.toLowerCase(), amount: 1, unit: 'ks', original };
  }
  let name = m[1].trim().toLowerCase();
  const amount = parseAmount(m[2]);
  let unit = m[3].trim().toLowerCase();
  if (NAME_MAP[name]) name = NAME_MAP[name];
  // Normalize unit plurals already in DB
  if (unit === 'plátek') unit = 'plátky';
  return {
    name,
    amount,
    unit,
    original,
  };
}

async function ensureExtraNutrition() {
  for (const row of EXTRA_INGREDIENTS) {
    const { data: existing } = await supabase
      .from('ingredients_nutrition')
      .select('id')
      .eq('name_cs', row.name_cs)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('ingredients_nutrition').insert({
      name_en: row.name_en,
      name_cs: row.name_cs,
      name_normalized: row.name_cs
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
      kcal_per_100g: row.kcal_per_100g,
      protein_g_per_100g: row.protein_g_per_100g,
      carbs_g_per_100g: row.carbs_g_per_100g,
      fat_g_per_100g: row.fat_g_per_100g,
      sample_count: 1,
      source: 'reference_cs',
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('insert nutrition', row.name_cs, error.message);
    else console.log('+' + row.name_cs);
  }
}

async function ensureExtraUnits() {
  for (const row of EXTRA_UNITS) {
    const { data: existing } = await supabase
      .from('unit_conversions')
      .select('unit, ingredient_match, grams')
      .eq('unit', row.unit)
      .eq('ingredient_match', row.ingredient_match)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('unit_conversions').insert(row);
    if (error) {
      // unique may differ — try without exact match check via raw
      console.error('insert unit', row, error.message);
    } else {
      console.log('+unit', row.unit, row.ingredient_match);
    }
  }
}

async function upsertRecipe(recipe) {
  const ingredients = recipe.ingredients.map(parseIngredientLine);
  const mealType = MEAL_TYPE_MAP[recipe.meal_type] || 'obed';
  const payload = {
    source: 'simple_start',
    source_id: recipe.key,
    name_cs: recipe.title,
    name_en: recipe.title,
    meal_type: mealType,
    kcal: Math.round(Number(recipe.calories) || 0),
    protein_g: recipe.protein_g,
    carbs_g: recipe.carbs_g,
    fat_g: recipe.fat_g,
    diet_tags: [],
    servings: 1,
    ingredients,
    instructions: recipe.instructions,
    instructions_cs: recipe.instructions,
    active: true,
    kcal_original: Math.round(Number(recipe.calories) || 0),
    protein_g_original: recipe.protein_g,
    carbs_g_original: recipe.carbs_g,
    fat_g_original: recipe.fat_g,
    servings_original: 1,
    ingredients_original: ingredients,
  };

  const { data: existing } = await supabase
    .from('recipes_catalog')
    .select('id')
    .eq('source', 'simple_start')
    .eq('source_id', recipe.key)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from('recipes_catalog').update(payload).eq('id', existing.id);
    if (error) throw new Error(`update ${recipe.key}: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await supabase.from('recipes_catalog').insert(payload).select('id').single();
  if (error) throw new Error(`insert ${recipe.key}: ${error.message}`);
  return data.id;
}

async function computeAndApply(recipeId, key) {
  const { data, error } = await supabase.rpc('compute_recipe_nutrition', { p_recipe_id: recipeId });
  if (error) throw new Error(`compute ${key}: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`compute ${key}: empty`);
  if (!row.complete) {
    console.error('INCOMPLETE', key, row.ingredients_unmatched);
    return { ok: false, row };
  }
  const { error: updErr } = await supabase
    .from('recipes_catalog')
    .update({
      kcal: Math.round(Number(row.kcal)),
      protein_g: Number(row.protein_g),
      carbs_g: Number(row.carbs_g),
      fat_g: Number(row.fat_g),
      nutrition_source: 'computed_from_ingredients',
      nutrition_computed_at: new Date().toISOString(),
    })
    .eq('id', recipeId);
  if (updErr) throw new Error(`apply ${key}: ${updErr.message}`);
  return { ok: true, row };
}

async function main() {
  console.log('Ensuring extra nutrition + units…');
  await ensureExtraNutrition();
  await ensureExtraUnits();

  const snapshot = [];
  let ok = 0;
  let fail = 0;

  for (const recipe of SIMPLE_START_RECIPES) {
    const id = await upsertRecipe(recipe);
    const result = await computeAndApply(id, recipe.key);
    if (result.ok) {
      ok += 1;
      console.log(`OK ${recipe.key} id=${id} kcal=${result.row.kcal}`);
      snapshot.push({
        id,
        key: recipe.key,
        title: recipe.title,
        meal_type: recipe.meal_type,
        catalog_meal_type: MEAL_TYPE_MAP[recipe.meal_type],
        kcal: Math.round(Number(result.row.kcal)),
        protein_g: Number(result.row.protein_g),
        carbs_g: Number(result.row.carbs_g),
        fat_g: Number(result.row.fat_g),
      });
    } else {
      fail += 1;
    }
  }

  const genDir = resolve(root, 'lib/generated');
  mkdirSync(genDir, { recursive: true });
  const genPath = resolve(genDir, 'simpleStartCatalogSnapshot.js');
  writeFileSync(
    genPath,
    `/** Auto-generated by scripts/import-simple-start-to-catalog.mjs — do not edit by hand. */\n`
      + `export const SIMPLE_START_CATALOG_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};\n`,
    'utf8'
  );

  console.log(JSON.stringify({ ok, fail, total: SIMPLE_START_RECIPES.length, snapshot: genPath }, null, 2));
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
