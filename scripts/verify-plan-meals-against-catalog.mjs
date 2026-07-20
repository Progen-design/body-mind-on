#!/usr/bin/env node
/**
 * Ověří jídla v aktivním plánu uživatele proti recipes_catalog nebo simple_start knihovně.
 *   node scripts/verify-plan-meals-against-catalog.mjs janprikopa@gmail.com
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  ALLOWED_SIMPLE_START_CATALOG_SOURCES,
  isAllowedSimpleStartCatalogSource,
} from '../lib/startSimpleMealFilter.js';

const email = (process.argv[2] || 'janprikopa@gmail.com').trim().toLowerCase();

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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MEAL_TYPE_MAP = { breakfast: 'snidane', lunch: 'obed', dinner: 'vecere', snack: 'svacina' };
const LIBRARY_SOURCES = new Set([
  ...ALLOWED_SIMPLE_START_CATALOG_SOURCES,
  'start_safe_fallback',
]);

function numClose(a, b, tol = 2) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  return Math.abs(x - y) <= tol;
}

function mealName(meal) {
  return meal.display_name_cs || meal.name_cs || meal.recipe?.title_cs || '';
}

function hasRecipeDetail(meal) {
  const steps = Array.isArray(meal.simple_instructions_cs) ? meal.simple_instructions_cs.length : 0;
  const recipeSteps = Array.isArray(meal.recipe?.instructions_cs) ? meal.recipe.instructions_cs.length : 0;
  const recipeText = typeof meal.recipe?.instructions === 'string' ? meal.recipe.instructions.trim().length : 0;
  return steps >= 3 || recipeSteps >= 3 || recipeText >= 20;
}

function isLibraryMeal(meal) {
  const source = meal.catalog_source || meal.recipe?.source || meal.verification_source || '';
  if (LIBRARY_SOURCES.has(String(source).trim())) return true;
  if (isAllowedSimpleStartCatalogSource(source)) return true;
  const catalogId = Number(meal.catalog_id);
  return !Number.isFinite(catalogId) || catalogId <= 0;
}

function validateLibraryMeal(meal) {
  const issues = [];
  const warnings = [];
  const name = mealName(meal);
  const source = meal.catalog_source || meal.recipe?.source || meal.verification_source || 'unknown';

  if (!meal.recipe_verified) {
    if (source === 'simple_start_fallback' || source === 'start_safe_fallback') {
      warnings.push('recipe_verified=false (fallback)');
    } else {
      issues.push('neověřeno');
    }
  }
  if (!name || /jídlo\s*\(neověřeno\)/i.test(name)) issues.push('placeholder název');
  if (!Number.isFinite(Number(meal.kcal)) || Number(meal.kcal) <= 0) issues.push('chybí kcal');
  const protein = meal.protein_g ?? meal.recipe?.protein_g;
  const carbs = meal.carbs_g ?? meal.recipe?.carbs_g;
  const fat = meal.fat_g ?? meal.recipe?.fat_g;
  if (!Number.isFinite(Number(protein))) issues.push('chybí protein');
  if (!Number.isFinite(Number(carbs))) issues.push('chybí carbs');
  if (!Number.isFinite(Number(fat))) issues.push('chybí fat');
  if (!hasRecipeDetail(meal)) issues.push('chybí recipe detail');
  if (!isAllowedSimpleStartCatalogSource(source) && !LIBRARY_SOURCES.has(String(source).trim())) {
    issues.push(`nepodporovaný catalog_source ${source}`);
  }

  return { issues, warnings, source };
}

async function findUserId(targetEmail) {
  const { data: prof } = await supabase.from('profiles').select('id').eq('email', targetEmail).maybeSingle();
  if (prof?.id) return prof.id;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users || []).find((u) => (u.email || '').toLowerCase() === targetEmail);
    if (hit?.id) return hit.id;
    if ((data?.users || []).length < 200) break;
  }
  return null;
}

async function main() {
  const userId = await findUserId(email);
  if (!userId) {
    console.error('Uživatel nenalezen:', email);
    process.exit(1);
  }

  const { data: plan } = await supabase
    .from('ai_generated_plans')
    .select('id, valid_from, valid_until, structured_plan_json')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan?.structured_plan_json?.days) {
    console.error('Aktivní plán bez structured_plan_json');
    process.exit(1);
  }

  const catalogIds = new Set();
  for (const day of plan.structured_plan_json.days) {
    for (const meal of day.meals || []) {
      const catalogId = Number(meal.catalog_id);
      if (Number.isFinite(catalogId) && catalogId > 0) catalogIds.add(catalogId);
    }
  }

  const catalogById = {};
  if (catalogIds.size > 0) {
    const { data: catalogRows } = await supabase
      .from('recipes_catalog')
      .select('id, name_cs, meal_type, kcal, protein_g, carbs_g, fat_g')
      .in('id', [...catalogIds]);
    for (const row of catalogRows || []) catalogById[row.id] = row;
  }

  let ok = 0;
  let warn = 0;
  let fail = 0;
  let library = 0;
  let catalog = 0;

  console.log('Plán:', plan.id, plan.valid_from, '→', plan.valid_until, '\n');

  for (const day of plan.structured_plan_json.days) {
    console.log(`=== ${day.day_name} (${day.date}) ===`);
    for (const meal of day.meals || []) {
      const name = mealName(meal) || '?';
      const catalogId = Number(meal.catalog_id);
      const issues = [];

      if (isLibraryMeal(meal)) {
        library += 1;
        const lib = validateLibraryMeal(meal);
        issues.push(...lib.issues);
        const status = issues.length === 0
          ? (lib.warnings.length ? 'WARN' : 'OK')
          : issues.some((i) => i.includes('placeholder') || i.includes('chybí') || i === 'neověřeno') ? 'FAIL' : 'WARN';
        if (status === 'OK') ok += 1;
        else if (status === 'WARN') warn += 1;
        else fail += 1;
        console.log(`  [${status}] ${meal.type}: ${name} (${meal.kcal} kcal, source ${lib.source})`);
        const notes = [...issues, ...lib.warnings];
        if (notes.length) console.log(`         → ${notes.join('; ')}`);
        continue;
      }

      catalog += 1;
      const cat = catalogById[catalogId];
      if (!meal.recipe_verified) issues.push('neověřeno');
      if (!cat) issues.push(`catalog_id ${catalogId} nenalezen`);
      else {
        const expectedType = MEAL_TYPE_MAP[meal.type] || meal.type;
        if (cat.meal_type !== expectedType) issues.push(`typ ${expectedType} vs catalog ${cat.meal_type}`);
        if (!numClose(meal.kcal, cat.kcal, 3)) issues.push(`kcal plán ${meal.kcal} vs catalog ${cat.kcal}`);
        const r = meal.recipe || {};
        if (!numClose(r.protein_g, cat.protein_g, 2)) issues.push(`protein ${r.protein_g} vs ${cat.protein_g}`);
        if (!numClose(r.carbs_g, cat.carbs_g, 2)) issues.push(`carbs ${r.carbs_g} vs ${cat.carbs_g}`);
        if (!numClose(r.fat_g, cat.fat_g, 2)) issues.push(`fat ${r.fat_g} vs ${cat.fat_g}`);
        // Strict invariant: display label must equal catalog.name_cs (no fuzzy match).
        const display = String(meal.display_name_cs || meal.display_name || meal.name_cs || '').trim();
        if (display !== String(cat.name_cs || '').trim()) {
          issues.push(`název plán „${display || name}“ vs catalog „${cat.name_cs}“`);
        }
      }

      const status = issues.length === 0
        ? 'OK'
        : issues.some((i) => i.includes('nenalezen') || i.startsWith('kcal') || i.startsWith('název'))
          ? 'FAIL'
          : 'WARN';
      if (status === 'OK') ok += 1;
      else if (status === 'WARN') warn += 1;
      else fail += 1;

      console.log(`  [${status}] ${meal.type}: ${name} (${meal.kcal} kcal, catalog #${catalogId})`);
      if (issues.length) console.log(`         → ${issues.join('; ')}`);
    }
    console.log('');
  }

  console.log(`Souhrn: OK=${ok}, WARN=${warn}, FAIL=${fail} (library=${library}, catalog=${catalog})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
