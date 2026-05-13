#!/usr/bin/env node
/**
 * Audit posledních plánů v ai_generated_plans (kalorie, 7 dní, shoda názvu vs. recept).
 *
 * Usage (načti env jako při next build — např. z .env.local):
 *   node scripts/audit-plan-integrity.mjs
 *
 * Vyžaduje: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

const LIMIT = Number(process.argv[2]) || 10;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key);

function dayKcalSum(day) {
  let s = 0;
  let n = 0;
  for (const meal of day?.meals || []) {
    const k = Number(meal?.kcal ?? meal?.recipe?.calories);
    if (Number.isFinite(k) && k > 0) {
      s += k;
      n += 1;
    }
  }
  return n ? s : null;
}

function mealNameTokens(cs) {
  return String(cs || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-záčďéěíňóřšťúůýž]+/)
    .filter((t) => t.length > 3);
}

function recipeMatchScore(meal) {
  const nameCs = (meal.display_name_cs || meal.name_cs || meal.name || '').toLowerCase();
  const titleEn = (meal.recipe?.title || '').toLowerCase();
  if (!nameCs || !titleEn || !meal.recipe?.id) return 1;
  const tokens = mealNameTokens(nameCs);
  if (!tokens.length) return 1;
  const cross = [
    ['vejce', 'egg'],
    ['michan', 'scrambl'],
    ['kure', 'chicken'],
    ['losos', 'salmon'],
    ['tunak', 'tuna'],
    ['tofu', 'tofu'],
  ];
  if (tokens.some((t) => titleEn.includes(t))) return 1;
  for (const [a, b] of cross) {
    if (nameCs.includes(a) && titleEn.includes(b)) return 1;
  }
  return 0;
}

function workoutPlaceholders(day) {
  let n = 0;
  for (const ex of day?.workout?.exercises || []) {
    const r = ex?.reps;
    const d = ex?.duration_sec ?? ex?.duration_seconds;
    const repsBad = r == null || String(r).trim() === '' || String(r) === '—';
    const durBad = !Number.isFinite(Number(d)) || Number(d) <= 0;
    if (repsBad && durBad) n += 1;
  }
  return n;
}

async function main() {
  const { data: plans, error } = await supabase
    .from('ai_generated_plans')
    .select('id, user_id, created_at, valid_from, structured_plan_json')
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const audit = {
    plans: plans?.length ?? 0,
    has7Days: 0,
    dayRatios: [],
    matchScores: [],
    workoutBad: 0,
  };

  for (const plan of plans || []) {
    const json = plan.structured_plan_json;
    const days = json?.days;
    const target = Number(json?.targets?.calories_per_day ?? json?.targets?.kcal_target_daily ?? 0) || null;
    if (Array.isArray(days) && days.length === 7) audit.has7Days += 1;

    let planMatch = 0;
    let planMeals = 0;
    for (const day of days || []) {
      const dk = dayKcalSum(day);
      if (target && dk != null) audit.dayRatios.push(dk / target);
      for (const meal of day?.meals || []) {
        planMeals += 1;
        planMatch += recipeMatchScore(meal);
      }
      audit.workoutBad += workoutPlaceholders(day);
    }
    if (planMeals) audit.matchScores.push(planMatch / planMeals);
  }

  const avgMatch =
    audit.matchScores.length > 0
      ? audit.matchScores.reduce((a, b) => a + b, 0) / audit.matchScores.length
      : 0;
  const inRange = audit.dayRatios.filter((r) => r >= 0.85 && r <= 1.15).length;
  const under72 = audit.dayRatios.filter((r) => r < 0.72).length;
  const under85 = audit.dayRatios.filter((r) => r < 0.85).length;

  console.log('=== BMON PLAN INTEGRITY AUDIT ===');
  console.log(`Plans analyzed: ${audit.plans} (limit ${LIMIT})`);
  console.log(`Plans with 7 days: ${audit.has7Days}/${audit.plans}`);
  console.log(`Recipe match score (heuristic avg): ${(avgMatch * 100).toFixed(0)}%`);
  console.log(`Day×kcal ratios: total ${audit.dayRatios.length}, in 85–115%: ${inRange}, under 85%: ${under85}, under 72%: ${under72}`);
  console.log(`Workout placeholder slots (no reps/duration): ${audit.workoutBad}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
