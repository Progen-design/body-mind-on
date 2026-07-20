#!/usr/bin/env node
/**
 * CI / ops: every active plan meal with catalog_id must have
 * display_name === recipes_catalog.name_cs.
 *
 *   node scripts/verify-active-plans-catalog-names.mjs
 *   node scripts/verify-active-plans-catalog-names.mjs --email=janprikopa@gmail.com
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { assertPlanMealsMatchCatalogNames } from '../lib/planDataIntegrity.js';

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const emailArg = (process.argv.find((a) => a.startsWith('--email=')) || '').slice('--email='.length)
  .trim()
  .toLowerCase();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE credentials');
  process.exit(1);
}

const supabase = createClient(url, key);

let query = supabase
  .from('ai_generated_plans')
  .select('id, email, structured_plan_json, meal_plan')
  .eq('is_active', true);

if (emailArg) query = query.ilike('email', emailArg);

const { data: plans, error } = await query;
if (error) {
  console.error(error.message);
  process.exit(1);
}

const catalogIds = new Set();
for (const plan of plans || []) {
  const days = plan.structured_plan_json?.days || plan.meal_plan?.days || [];
  for (const day of days) {
    for (const meal of day.meals || []) {
      if (meal?.catalog_id != null) catalogIds.add(meal.catalog_id);
    }
  }
}

const catalogById = {};
if (catalogIds.size) {
  const ids = [...catalogIds];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: rows, error: cErr } = await supabase
      .from('recipes_catalog')
      .select('id, name_cs')
      .in('id', chunk);
    if (cErr) {
      console.error(cErr.message);
      process.exit(1);
    }
    for (const row of rows || []) catalogById[row.id] = row;
  }
}

let sedi = 0;
let nesedi = 0;
const badPlans = [];

for (const plan of plans || []) {
  const structured = {
    days: plan.structured_plan_json?.days || plan.meal_plan?.days || [],
  };
  const result = assertPlanMealsMatchCatalogNames(structured, catalogById);
  for (const day of structured.days) {
    for (const meal of day.meals || []) {
      if (meal?.catalog_id == null) continue;
      const row = catalogById[meal.catalog_id];
      if (!row) continue;
      const display = String(meal.display_name_cs || meal.display_name || meal.name_cs || '').trim();
      if (display === String(row.name_cs || '').trim()) sedi += 1;
      else nesedi += 1;
    }
  }
  if (!result.ok) {
    badPlans.push({
      email: plan.email,
      plan_id: plan.id,
      mismatches: result.mismatches.slice(0, 5),
      mismatch_count: result.mismatches.length,
    });
  }
}

console.log(JSON.stringify({ sedi, nesedi, plans: (plans || []).length, bad_plans: badPlans.length }, null, 2));
if (badPlans.length) {
  console.error('Sample mismatches:', JSON.stringify(badPlans.slice(0, 3), null, 2));
}
process.exit(nesedi === 0 ? 0 : 1);
