#!/usr/bin/env node
/**
 * CI hard fail: every START_MEAL_TEMPLATES entry must resolve to ≥1 active catalog row
 * (exact name match OR allowed_catalog_match_terms hit). Never invent macros in production —
 * this test keeps the template list aligned so production graceful path stays rare.
 *
 *   node scripts/verify-start-templates-catalog.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { START_MEAL_TEMPLATES } from '../lib/services/simpleMealPlannerAgent.js';

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

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function planMealTypeToCatalog(planMealType) {
  const t = String(planMealType || 'lunch').toLowerCase();
  if (t === 'breakfast') return 'snidane';
  if (t === 'dinner') return 'vecere';
  if (t === 'snack') return 'svacina';
  return 'obed';
}

const { data: rows, error } = await sb
  .from('recipes_catalog')
  .select('id, name_cs, meal_type, source, diet_tags, kcal')
  .eq('active', true);
if (error) throw error;

const HARD_BLOCKS = [/burrito/i, /ramen/i, /frittata/i, /lasagn/i, /quinoa/i, /kokos/i, /kari/i, /salsa/i, /pesto/i];

function isBlocked(name) {
  return HARD_BLOCKS.some((re) => re.test(String(name || '')));
}

const catalog = (rows || []).filter((r) => !isBlocked(r.name_cs));
let failed = 0;
const misses = [];

for (const [diet, byType] of Object.entries(START_MEAL_TEMPLATES)) {
  for (const [mealType, templates] of Object.entries(byType)) {
    const catalogType = planMealTypeToCatalog(mealType);
    const pool = catalog.filter((r) => r.meal_type === catalogType);
    for (const tpl of templates) {
      const titleN = norm(tpl.name_cs);
      const terms = (tpl.allowed_catalog_match_terms || []).map(norm).filter(Boolean);
      const hit = pool.find((r) => {
        const n = norm(r.name_cs);
        if (n === titleN) return true;
        return terms.some((t) => t.length >= 3 && n.includes(t));
      });
      if (!hit) {
        failed += 1;
        misses.push({ diet, mealType, name_cs: tpl.name_cs, pool: pool.length });
      }
    }
  }
}

if (failed) {
  console.error(JSON.stringify({ failed, misses }, null, 2));
  console.error('CI FAIL: templates without catalog match — fix templates or add catalog rows');
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  catalog_active: catalog.length,
  templates_checked: Object.values(START_MEAL_TEMPLATES).reduce(
    (n, byType) => n + Object.values(byType).reduce((m, arr) => m + arr.length, 0),
    0
  ),
}, null, 2));
