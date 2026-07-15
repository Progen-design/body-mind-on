#!/usr/bin/env node
/**
 * B1 smoke without Next resolver: skeleton titles → catalog simple_start rows with catalog_id.
 *   node scripts/verify-start-catalog-resolve-b1.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { buildSimpleStartMealSkeleton } from '../lib/services/simpleMealPlannerAgent.js';
import { resolveSimpleStartTitle } from '../lib/simpleStartRecipeLibrary.js';

function planMealTypeToCatalog(planMealType) {
  const t = String(planMealType || 'lunch').toLowerCase();
  if (t === 'breakfast') return 'snidane';
  if (t === 'dinner') return 'vecere';
  if (t === 'snack') return 'svacina';
  return 'obed';
}
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
const sb = createClient(url, key, { auth: { persistSession: false } });

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const { data: rows, error } = await sb
  .from('recipes_catalog')
  .select('id, source, source_id, name_cs, meal_type, kcal')
  .eq('active', true)
  .eq('source', 'simple_start');
if (error) throw error;
console.log('simple_start rows:', rows.length);
if (rows.length !== 19) {
  console.error('Expected 19 simple_start rows');
  process.exit(1);
}

const bodyMetrics = {
  user_id: '00000000-0000-0000-0000-000000000001',
  calories_target: 2200,
  meals_per_day: 4,
  diet_type: 'standard',
  weight_kg: 80,
  goal: 'udrzovani',
};
const targets = { calories_per_day: 2200 };
const skeleton = buildSimpleStartMealSkeleton({
  bodyMetrics,
  targets,
  days: 7,
  mealsPerDay: 4,
});

let matched = 0;
let emergency = 0;
const sample = [];

for (const day of skeleton.meal_plan?.days || []) {
  for (const meal of day.meals || []) {
    const catalogType = planMealTypeToCatalog(meal.type);
    const title = resolveSimpleStartTitle(meal.name_cs);
    const pool = rows.filter((r) => r.meal_type === catalogType);
    let hit = pool.find((r) => norm(r.name_cs) === norm(title));
    if (!hit) {
      // Production graceful: nearest kcal in type
      const target = Number(meal.target_kcal) || Number(meal.fallback_meal_template?.kcal) || 400;
      hit = [...pool].sort((a, b) => Math.abs(a.kcal - target) - Math.abs(b.kcal - target))[0];
      emergency += 1;
    } else {
      matched += 1;
    }
    if (sample.length < 8) {
      sample.push({ agent: meal.name_cs, resolved: hit?.name_cs, id: hit?.id, emergency: !pool.find((r) => norm(r.name_cs) === norm(title)) });
    }
  }
}

console.log(JSON.stringify({ matched, emergency, sample }, null, 2));
if (matched + emergency === 0) process.exit(1);
console.log('B1 catalog pool OK (19 simple_start ready)');
