#!/usr/bin/env node
/**
 * Ověří jídla v aktivním plánu uživatele proti recipes_catalog (název, kcal, makra).
 *   node scripts/verify-plan-meals-against-catalog.mjs janprikopa@gmail.com
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

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

function numClose(a, b, tol = 2) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  return Math.abs(x - y) <= tol;
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
      if (meal?.catalog_id) catalogIds.add(Number(meal.catalog_id));
    }
  }

  const { data: catalogRows } = await supabase
    .from('recipes_catalog')
    .select('id, name_cs, meal_type, kcal, protein_g, carbs_g, fat_g')
    .in('id', [...catalogIds]);

  const catalogById = Object.fromEntries((catalogRows || []).map((r) => [r.id, r]));

  let ok = 0;
  let warn = 0;
  let fail = 0;

  console.log('Plán:', plan.id, plan.valid_from, '→', plan.valid_until, '\n');

  for (const day of plan.structured_plan_json.days) {
    console.log(`=== ${day.day_name} (${day.date}) ===`);
    for (const meal of day.meals || []) {
      const name = meal.display_name_cs || meal.name_cs || meal.recipe?.title_cs || '?';
      const catalogId = Number(meal.catalog_id);
      const cat = catalogById[catalogId];
      const issues = [];

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
        if (cat.name_cs !== name && !name.includes(cat.name_cs.slice(0, 12))) {
          issues.push(`název plán „${name}“ vs catalog „${cat.name_cs}“`);
        }
      }

      const status = issues.length === 0 ? 'OK' : issues.some((i) => i.includes('nenalezen') || i.startsWith('kcal')) ? 'FAIL' : 'WARN';
      if (status === 'OK') ok += 1;
      else if (status === 'WARN') warn += 1;
      else fail += 1;

      console.log(`  [${status}] ${meal.type}: ${name} (${meal.kcal} kcal, catalog #${catalogId})`);
      if (issues.length) console.log(`         → ${issues.join('; ')}`);
    }
    console.log('');
  }

  console.log(`Souhrn: OK=${ok}, WARN=${warn}, FAIL=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
