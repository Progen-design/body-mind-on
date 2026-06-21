#!/usr/bin/env node
/**
 * E2E: registrace → initial_plan (recipes_catalog, SPOONACULAR_MODE=off).
 * Spustit: SPOONACULAR_MODE=off node scripts/e2e-catalog-registration.mjs
 * Vyžaduje běžící lokální dev server (npm run dev).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

/** @see .cursor/rules/10-user-preferences.mdc – testovací maily vždy na tento účet */
const TEST_EMAIL = (process.env.E2E_EMAIL || 'janprikopa@gmail.com').trim().toLowerCase();
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT_DIR = resolve(process.cwd(), 'scripts', 'e2e-output');
const KCAL_MIN = Number(process.env.E2E_KCAL_MIN || 2100);
const KCAL_MAX = Number(process.env.E2E_KCAL_MAX || 2400);

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    break;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

function nextMondayIsoPrague(ref = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const iso = fmt.format(ref);
  const utcNoon = new Date(`${iso}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', weekday: 'short' }).format(utcNoon);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = map[wd] ?? 1;
  if (dow === 1) return iso;
  const daysUntilMon = dow === 0 ? 1 : 8 - dow;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysUntilMon);
  return fmt.format(d);
}

function mealKcal(meal) {
  const k = Number(meal?.kcal);
  if (Number.isFinite(k) && k > 0) return k;
  const rc = Number(meal?.recipe?.calories);
  if (Number.isFinite(rc) && rc > 0) return rc;
  return 0;
}

function looksEnglish(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[áčďéěíňóřšťúůýž]/i.test(t)) return false;
  return /[a-z]/i.test(t);
}

function looksCzech(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[áčďéěíňóřšťúůýž]/i.test(t)) return true;
  const csWords = /^(ovesná|kuřec|grilovan|salát|vejce|jogurt|polévka|těstovin|ryb|losos|tunák|brambor|zelenin)/i;
  return csWords.test(t);
}

async function assertApiUp() {
  const healthUrl = `${BASE_URL}/api/integrations-status`;
  let res;
  try {
    res = await fetchWithTimeout(healthUrl, { method: 'GET' }, FETCH_TIMEOUT.HEALTH);
  } catch (err) {
    throw new Error(formatFetchError(err, healthUrl));
  }
  if (!res.ok) throw new Error(`API health HTTP ${res.status}: ${healthUrl}`);
}

async function runRegistration() {
  const payload = {
    email: TEST_EMAIL,
    name: 'Catalog2 E2E',
    password: 'CatalogTest2026!',
    gender: 'male',
    age: 32,
    height: 180,
    weight: 85,
    activity: 'moderate',
    stress: 'medium',
    worktype: 'sedentary',
    goal: 'udrzovani',
    frequency: '3x tydne',
    program: 'START',
    workout_days: [1, 3, 5],
    diet_type: 'standard',
  };

  const regUrl = `${BASE_URL}/api/body-metrics`;
  console.log('POST', regUrl, '→', TEST_EMAIL);
  let res;
  try {
    res = await fetchWithTimeout(
      regUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      FETCH_TIMEOUT.BODY_METRICS
    );
  } catch (err) {
    throw new Error(formatFetchError(err, regUrl));
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

async function loadPlanArtifacts() {
  const { data: bm } = await supabase
    .from('body_metrics')
    .select('user_id, email, calories_target, created_at')
    .eq('email', TEST_EMAIL)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: plan } = await supabase
    .from('ai_generated_plans')
    .select('id, valid_from, valid_until, structured_plan_json, plan_html, email_sent, created_at')
    .eq('email', TEST_EMAIL)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: task } = await supabase
    .from('ai_tasks')
    .select('id, status, result, task_type, created_at, user_id')
    .eq('task_type', 'initial_plan')
    .order('created_at', { ascending: false })
    .limit(10);

  const userTask =
    task?.find((t) => t.result?.plan_id === plan?.id) ||
    task?.find((t) => t.user_id === bm?.user_id) ||
    task?.[0];

  return { bm, plan, task: userTask };
}

async function verifyCatalogNames(planJson) {
  const checks = [];
  for (const day of planJson?.days || []) {
    for (const meal of day.meals || []) {
      const cid = meal.catalog_id;
      if (!cid) {
        checks.push({ ok: false, reason: 'missing catalog_id', meal: meal.display_name_cs });
        continue;
      }
      const { data: row } = await supabase
        .from('recipes_catalog')
        .select('name_cs, name_en, source, spoonacular_url')
        .eq('id', cid)
        .maybeSingle();
      const planName = String(meal.display_name_cs || '').trim();
      const catalogCs = String(row?.name_cs || '').trim();
      const match = row && planName === catalogCs;
      checks.push({
        ok: match,
        catalog_id: cid,
        source: row?.source,
        plan_name: planName,
        catalog_name_cs: catalogCs,
        catalog_name_en: row?.name_en,
        name_is_czech: looksCzech(planName),
        name_is_english: looksEnglish(planName),
        has_spoonacular_url: !!row?.spoonacular_url,
        recipe_link_expected: !!row?.spoonacular_url,
      });
    }
  }
  return checks;
}

async function buildEmailPreview(plan, bm) {
  try {
    const mod = await import('../lib/weeklyPlanEmailV8.js');
    return mod.buildWeeklyPlanEmailV8Document({
      structuredPlanJson: plan.structured_plan_json,
      bodyMetrics: bm,
      firstName: 'Catalog',
      loginBlock: '',
      planChangeContext: false,
      appBaseUrl: 'https://app.bodyandmindon.cz',
      validFrom: plan.valid_from,
    });
  } catch (e) {
    return `<!-- email build failed: ${e.message} -->`;
  }
}

function extractEmailMealTitles(html) {
  const titles = [];
  const re = /meal-name-mobile[^>]*>([^<]+)</g;
  let m;
  while ((m = re.exec(html))) {
    titles.push(m[1].trim());
  }
  return titles;
}

function spotCheckTranslation(checks) {
  const spoonacular = checks.filter((c) => c.source === 'spoonacular' && c.catalog_name_en && c.catalog_name_cs);
  const picks = [];
  const indices = [0, Math.floor(spoonacular.length / 3), Math.floor((2 * spoonacular.length) / 3), spoonacular.length - 1];
  for (const i of indices) {
    const c = spoonacular[i];
    if (c && !picks.some((p) => p.catalog_id === c.catalog_id)) picks.push(c);
  }
  return picks.slice(0, 4).map((c) => ({
    catalog_id: c.catalog_id,
    name_en: c.catalog_name_en,
    name_cs: c.catalog_name_cs,
    in_plan_as: c.plan_name,
    faithful_hint:
      c.name_en && c.name_cs && c.name_cs !== c.name_en && !looksEnglish(c.name_cs)
        ? 'cs differs from en (translated)'
        : 'needs review',
  }));
}

function analyzeRecipeLinks(nameChecks, emailHtml) {
  const withUrl = nameChecks.filter((c) => c.has_spoonacular_url);
  const withoutUrl = nameChecks.filter((c) => !c.has_spoonacular_url);
  const cacheNoUrl = withoutUrl.filter((c) => c.source === 'meal_cache');
  const receptButtons = (emailHtml.match(/Recept →/g) || []).length;
  return {
    meals_with_url: withUrl.length,
    meals_without_url: withoutUrl.length,
    cache_meals_without_url: cacheNoUrl.length,
    email_recept_buttons_day1_full: receptButtons,
    cache_samples_no_url: cacheNoUrl.slice(0, 3).map((c) => ({
      catalog_id: c.catalog_id,
      name_cs: c.catalog_name_cs,
    })),
  };
}

async function main() {
  process.env.SPOONACULAR_MODE = process.env.SPOONACULAR_MODE || 'off';
  console.log('SPOONACULAR_MODE:', process.env.SPOONACULAR_MODE);
  console.log('TEST_EMAIL:', TEST_EMAIL);
  console.log('Expected Monday start (Prague):', nextMondayIsoPrague());
  console.log('Kcal window:', KCAL_MIN, '-', KCAL_MAX);

  await assertApiUp();

  const reg = await runRegistration();
  console.log('Registration HTTP', reg.status);
  console.log('Registration body keys:', Object.keys(reg.json || {}));
  if (reg.status !== 200 && reg.status !== 503) {
    console.error(JSON.stringify(reg.json, null, 2));
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 2000));
  const { bm, plan, task } = await loadPlanArtifacts();

  if (!plan?.structured_plan_json) {
    console.error('Chybí ai_generated_plans.structured_plan_json', { bm, task: task?.status });
    process.exit(1);
  }

  const pj = plan.structured_plan_json;
  const diag = pj._diagnostics || task?.result || {};
  const spoonacularCalls =
    diag.spoonacular_requests_total ??
    diag.spoonacular_requests ??
    pj._diagnostics?.spoonacular_requests_total ??
    null;

  const dayRows = (pj.days || []).map((d) => {
    const kcal = (d.meals || []).reduce((s, m) => s + mealKcal(m), 0);
    return {
      date: d.date,
      day_name: d.day_name,
      kcal_sum: kcal,
      meals: (d.meals || []).map((m) => ({
        type: m.type,
        name: m.display_name_cs,
        kcal: mealKcal(m),
        catalog_id: m.catalog_id,
        recipe_source: m.recipe?.source,
        has_spoonacular_url: !!(m.recipe?.sourceUrl || m.recipe?.source_url),
      })),
      workout: (d.workout?.exercises || []).slice(0, 5).map((ex) => ({
        name: ex.display_name_cs || ex.name_cs || ex.name,
        sets: ex.sets,
        reps: ex.reps,
        duration_sec: ex.duration_sec,
        duration_seconds: ex.duration_seconds,
      })),
    };
  });

  const nameChecks = await verifyCatalogNames(pj);
  const nameOk = nameChecks.every((c) => c.ok);
  const czechNamesOk = nameChecks.every((c) => c.name_is_czech || !c.name_is_english);

  const emailHtml = await buildEmailPreview(plan, bm);
  const emailMealTitles = extractEmailMealTitles(emailHtml);
  const emailCzechSample = emailMealTitles.slice(0, 6);
  const emailDayMatches = (emailHtml.match(/Den \d{2}/g) || []).length;
  const recipeLinkAnalysis = analyzeRecipeLinks(nameChecks, emailHtml);
  const badTraining = (emailHtml.match(/\d+×—/g) || []).length + (emailHtml.match(/—×/g) || []).length;
  const planHtml = plan.plan_html || '';
  const badTrainingPlanHtml = (planHtml.match(/\d+×—/g) || []).length;
  const spotCheck = spotCheckTranslation(nameChecks);

  const kcalPerDay = dayRows.map((d) => ({ date: d.date, day: d.day_name, kcal: d.kcal_sum }));
  const kcalInTargetWindow = dayRows.every((d) => d.kcal_sum >= KCAL_MIN && d.kcal_sum <= KCAL_MAX);

  const report = {
    test_email: TEST_EMAIL,
    spoonacular_mode: process.env.SPOONACULAR_MODE,
    registration_status: reg.status,
    initial_plan_task_status: task?.status,
    plan_id: plan.id,
    profile_calories_target: bm?.calories_target,
    plan_target_kcal: pj?.targets?.calories_per_day,
    valid_from: plan.valid_from,
    valid_until: plan.valid_until,
    expected_monday: nextMondayIsoPrague(),
    monday_start_ok: plan.valid_from === nextMondayIsoPrague(),
    days_count: (pj.days || []).length,
    spoonacular_http_calls_reported: spoonacularCalls,
    spoonacular_zero_ok: spoonacularCalls === 0,
    catalog_used: diag.catalog_used === true || nameChecks.some((c) => c.catalog_id),
    daily_kcal: kcalPerDay,
    kcal_window: { min: KCAL_MIN, max: KCAL_MAX },
    kcal_in_target_window_ok: kcalInTargetWindow,
    catalog_name_match_ok: nameOk,
    czech_names_ok: czechNamesOk,
    email_czech_name_samples: emailCzechSample,
    spot_check_translations: spotCheck,
    recipe_links: recipeLinkAnalysis,
    email_day_headings_found: emailDayMatches,
    email_bad_training_placeholders: badTraining,
    plan_html_bad_training_placeholders: badTrainingPlanHtml,
    dev_log_hint: 'grep [catalog-resolve] a spoonacular_requests_total v terminálu dev serveru',
    acceptance: {
      zero_spoonacular: spoonacularCalls === 0,
      seven_days: (pj.days || []).length === 7,
      monday_start: plan.valid_from === nextMondayIsoPrague(),
      kcal_ok: kcalInTargetWindow,
      catalog_names: nameOk,
      czech_names: czechNamesOk,
      training_render_ok: badTraining === 0 && badTrainingPlanHtml === 0,
    },
  };

  if (!existsSync(OUT_DIR)) {
    const { mkdirSync } = await import('fs');
    mkdirSync(OUT_DIR, { recursive: true });
  }
  writeFileSync(join(OUT_DIR, 'e2e-report.json'), JSON.stringify({ ...report, dayRows, nameChecks }, null, 2));
  writeFileSync(join(OUT_DIR, 'email-preview.html'), emailHtml);
  writeFileSync(join(OUT_DIR, 'plan.html'), planHtml);

  console.log('\n=== E2E REPORT ===\n');
  console.log(JSON.stringify(report, null, 2));
  console.log('\nArtifacts:', OUT_DIR);

  const allOk = Object.values(report.acceptance).every(Boolean);
  process.exit(allOk ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
