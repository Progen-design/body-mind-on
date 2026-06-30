#!/usr/bin/env node
/**
 * Batch regenerace legacy START plánů vytvořených před trust-fix deployem (762abd5).
 * Bez odesílání e-mailů — uživatel vidí nový plán v profilu.
 *
 *   node scripts/regenerate-legacy-start-plans.mjs --dry-run
 *   node scripts/regenerate-legacy-start-plans.mjs --apply --limit=1
 *   node scripts/regenerate-legacy-start-plans.mjs --apply --limit=10
 *   node scripts/regenerate-legacy-start-plans.mjs --apply --all
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN
 *      REGEN_APP_URL (výchozí https://app.bodyandmindon.cz)
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

for (const f of ['.env.production.local', '.env.local', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v.replace(/\r$/, '');
  }
}

const { parseDietaryExclusions, mealContainsExcludedFood } = await import('../lib/dietaryExclusions.js');
const { isAllowedSimpleStartCatalogSource } = await import('../lib/startSimpleMealFilter.js');

/** Deploy production trust-fix 762abd5 — 2026-06-28 22:47:01 Europe/Prague */
const LEGACY_CUTOFF_ISO = '2026-06-28T20:47:01.000Z';
const KCAL_TOLERANCE = 0.15;
const APP_URL = String(process.env.REGEN_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim();
const FETCH_TIMEOUT_MS = FETCH_TIMEOUT.ADMIN_LONG;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const applyAll = args.includes('--all');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 1) : null;

if (!dryRun && !apply) {
  console.error('Použij --dry-run nebo --apply (--limit=N | --all).');
  process.exit(1);
}
if (apply && !applyAll && !limit) {
  console.error('Při --apply zadej --limit=N nebo --all.');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (apply && !ADMIN_TOKEN) {
  console.error('Při --apply chybí ADMIN_TOKEN.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function dayKcalSum(day) {
  let s = 0;
  let n = 0;
  for (const meal of day?.meals || []) {
    const k = Number(meal?.kcal ?? meal?.calories ?? meal?.recipe?.calories);
    if (Number.isFinite(k) && k > 0) {
      s += k;
      n += 1;
    }
  }
  return n ? s : null;
}

function mealHasExternalIds(meal) {
  return Boolean(
    meal?.catalog_id
    || meal?.recipe_id
    || meal?.spoonacular_id
    || meal?.meal_cache_id
    || meal?.recipe?.id
    || meal?.spoonacular_url
    || (meal?.recipe?.source && meal.recipe.source !== 'simple_start_library')
  );
}

function analyzePlanIssues(planRow, bm) {
  const issues = [];
  const json = planRow?.structured_plan_json;
  const days = json?.days;
  if (!Array.isArray(days) || days.length < 7) {
    issues.push('missing_7_days');
    return issues;
  }

  const target = Number(
    json?.targets?.calories_per_day
    ?? json?.targets?.kcal_target_daily
    ?? bm?.calories_target
    ?? 0
  ) || null;

  const exclusions = parseDietaryExclusions(bm);

  for (const day of days) {
    const sum = dayKcalSum(day);
    if (target && sum != null) {
      const ratio = sum / target;
      if (ratio < 1 - KCAL_TOLERANCE || ratio > 1 + KCAL_TOLERANCE) {
        issues.push(`kcal_drift_day_${day.day_index ?? '?'}:${sum}/${target}`);
      }
    }
    for (const meal of day?.meals || []) {
      const name = meal?.display_name_cs || meal?.name_cs || meal?.name || '';
      if (exclusions.length && mealContainsExcludedFood(meal, exclusions)) {
        issues.push(`excluded_food:${name.slice(0, 40)}`);
      }
      const src = meal?.catalog_source || meal?.source || meal?.recipe?.source;
      if (src && !isAllowedSimpleStartCatalogSource(src)) {
        issues.push(`non_local_source:${src}`);
      }
      if (mealHasExternalIds(meal)) {
        issues.push(`external_meal_id:${name.slice(0, 30)}`);
      }
    }
  }

  return [...new Set(issues)];
}

async function fetchLegacyCandidates() {
  const { data: plans, error } = await supabase
    .from('ai_generated_plans')
    .select('id, user_id, email, created_at, valid_from, valid_until, generated_by, structured_plan_json, daily_calories')
    .eq('is_active', true)
    .lt('created_at', LEGACY_CUTOFF_ISO)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const candidates = [];
  for (const plan of plans || []) {
    if (!plan.user_id) continue;

    const [{ data: bmRows }, { data: membership }] = await Promise.all([
      supabase
        .from('body_metrics')
        .select('*')
        .eq('user_id', plan.user_id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('memberships')
        .select('tier, status, trial_ends_at')
        .eq('user_id', plan.user_id)
        .maybeSingle(),
    ]);

    const bm = bmRows?.[0];
    if (!bm?.email) continue;

    const tier = String(membership?.tier || bm.program || 'START').toUpperCase();
    if (tier !== 'START') continue;

    candidates.push({
      plan_id: plan.id,
      user_id: plan.user_id,
      email: String(bm.email).trim().toLowerCase(),
      plan_created_at: plan.created_at,
      valid_from: plan.valid_from,
      valid_until: plan.valid_until,
      generated_by: plan.generated_by,
      bm,
      issues: analyzePlanIssues(plan, bm),
    });
  }

  return candidates;
}

async function regenerateViaApi(candidate, index, total) {
  const label = `[${index + 1}/${total}] ${candidate.email}`;
  const url = `${APP_URL}/api/admin/regenerate-user-plan`;
  console.log(`${label} regeneruji přes API (plan ${candidate.plan_id})…`);

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        email: candidate.email,
        skip_email: true,
        deactivate_old: true,
        simple_start_mode: true,
        plan_scope: 'initial_7_day_trial',
        valid_from: candidate.valid_from,
        valid_until: candidate.valid_until,
        generated_by: 'legacy-start-regen:762abd5',
      }),
    },
    FETCH_TIMEOUT_MS
  );

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Neočekávaná odpověď ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.ok || !body.ok) {
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }

  const { data: newPlan } = await supabase
    .from('ai_generated_plans')
    .select('id, created_at, generated_by, email_sent, structured_plan_json')
    .eq('id', body.plan_id)
    .maybeSingle();

  const postIssues = analyzePlanIssues(newPlan, candidate.bm);
  console.log(`${label} OK plan_id=${body.plan_id} email_sent=${newPlan?.email_sent} post_issues=${postIssues.length}`);
  return {
    ok: true,
    email: candidate.email,
    old_plan_id: candidate.plan_id,
    new_plan_id: body.plan_id,
    post_issues: postIssues,
  };
}

async function main() {
  console.log('');
  console.log('=== Legacy START plan regeneration ===');
  console.log('cutoff:', LEGACY_CUTOFF_ISO);
  console.log('mode:', dryRun ? 'dry-run' : `apply${applyAll ? ' (all)' : ` (limit=${limit})`}`);
  if (apply) console.log('api:', `${APP_URL}/api/admin/regenerate-user-plan`);
  console.log('');

  const candidates = await fetchLegacyCandidates();
  console.log(`Nalezeno ${candidates.length} legacy START kandidátů.`);

  const withIssues = candidates.filter((c) => c.issues.length > 0);
  console.log(`S detekovanými problémy: ${withIssues.length}`);

  if (dryRun) {
    console.log('');
    for (const c of candidates) {
      console.log(
        JSON.stringify({
          email: c.email,
          plan_id: c.plan_id,
          created_at: c.plan_created_at,
          valid_from: c.valid_from,
          generated_by: c.generated_by,
          issues: c.issues.slice(0, 8),
          issue_count: c.issues.length,
        })
      );
    }
    console.log('');
    console.log('Dry-run hotovo. Pro regeneraci: --apply --limit=N nebo --apply --all');
    return;
  }

  const batch = applyAll ? candidates : candidates.slice(0, limit);
  console.log(`Regeneruji ${batch.length} uživatelů (skip email).`);
  console.log('');

  const results = { ok: 0, fail: 0, items: [] };
  for (let i = 0; i < batch.length; i += 1) {
    try {
      const item = await regenerateViaApi(batch[i], i, batch.length);
      results.items.push(item);
      results.ok += 1;
    } catch (err) {
      results.fail += 1;
      const msg = formatFetchError(err, `${APP_URL}/api/admin/regenerate-user-plan`);
      results.items.push({ ok: false, email: batch[i].email, error: msg });
      console.error(`[${i + 1}/${batch.length}] ${batch[i].email} FAIL:`, msg);
    }
  }

  console.log('');
  console.log('=== Souhrn ===');
  console.log(JSON.stringify({
    total: batch.length,
    ok: results.ok,
    fail: results.fail,
    failed_emails: results.items.filter((r) => !r.ok).map((r) => ({ email: r.email, error: r.error })),
    regen_with_post_issues: results.items.filter((r) => r.ok && r.post_issues?.length).length,
  }, null, 2));

  if (results.fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
