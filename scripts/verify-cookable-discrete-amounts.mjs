#!/usr/bin/env node
/**
 * CI: no discrete ingredient (ks/plátky/konzerva/stroužek/svazek) may have
 * a non-cookable amount (must be whole, or .5 for eggs/bread).
 *
 *   node scripts/verify-cookable-discrete-amounts.mjs
 *   node scripts/verify-cookable-discrete-amounts.mjs janprikopa@gmail.com
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { validateDiscreteIngredientAmount } from '../lib/nutrition/atomicPortionScale.js';

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

const email = (process.argv[2] || '').trim().toLowerCase();
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function collectFailuresFromMeal(meal, path) {
  const failures = [];
  const lists = [
    meal?.recipe?.ingredients,
    meal?.ingredients,
    meal?.shopping_ingredient_lines,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const v = validateDiscreteIngredientAmount(entry);
      if (!v.ok) {
        failures.push({
          path,
          meal: meal?.display_name_cs || meal?.name_cs,
          amount: v.amount,
          unit: v.unit,
          name: v.name,
          reason: v.reason,
          entry: typeof entry === 'string' ? entry : entry,
        });
      }
    }
  }
  return failures;
}

// Unit-level self-check (always)
{
  const mustFail = [
    { name: 'vejce', unit: 'ks', amount: 3.45 },
    { name: 'okurka', unit: 'ks', amount: 0.575 },
    { name: 'tuňák', unit: 'konzerva', amount: 1.15 },
    'vejce 3.45 ks',
    'celozrnný chléb 2.3 plátky',
  ];
  const mustPass = [
    { name: 'vejce', unit: 'ks', amount: 3.5 },
    { name: 'vejce', unit: 'ks', amount: 3 },
    { name: 'okurka', unit: 'ks', amount: 0.5 },
    { name: 'okurka', unit: 'ks', amount: 1 },
    { name: 'tuňák', unit: 'konzerva', amount: 1 },
    { name: 'chléb', unit: 'plátky', amount: 2.5 },
    { name: 'rýže', unit: 'g', amount: 92 },
    'okurka 1/2 ks',
  ];
  for (const e of mustFail) {
    const v = validateDiscreteIngredientAmount(e);
    if (v.ok) {
      console.error('SELF-FAIL expected reject', e);
      process.exit(1);
    }
  }
  for (const e of mustPass) {
    const v = validateDiscreteIngredientAmount(e);
    if (!v.ok) {
      console.error('SELF-FAIL expected accept', e, v);
      process.exit(1);
    }
  }
  console.log('OK self-check cookable discrete rules');
}

if (!email) {
  console.log('No email arg — unit self-check only. Pass email to audit active plan.');
  process.exit(0);
}

if (!url || !key) {
  console.error('Missing SUPABASE credentials');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: prof } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
if (!prof?.id) {
  console.error('User not found', email);
  process.exit(1);
}
const { data: plan } = await sb
  .from('ai_generated_plans')
  .select('id, structured_plan_json')
  .eq('user_id', prof.id)
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (!plan?.structured_plan_json) {
  console.error('No active plan');
  process.exit(1);
}

const failures = [];
let checked = 0;
for (const day of plan.structured_plan_json.days || []) {
  for (const meal of day.meals || []) {
    checked += 1;
    failures.push(...collectFailuresFromMeal(meal, `day ${day.day_index}`));
  }
}

if (failures.length) {
  console.error(JSON.stringify({ plan_id: plan.id, failures: failures.slice(0, 30), total: failures.length }, null, 2));
  console.error(`CI FAIL: ${failures.length} non-cookable discrete amounts`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, plan_id: plan.id, meals_checked: checked }, null, 2));
