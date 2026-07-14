#!/usr/bin/env node
/**
 * Read-only agregace: reální vs test/smoke účty (bez PII ve výstupu).
 *   npm run audit:users
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv, sanitizeOutput } from './audit-utils.mjs';

loadLocalEnv();

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('FAIL missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/** @param {string} email */
function isLikelyTestEmail(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return false;
  return e.includes('bm-smoke')
    || e.includes('smoke')
    || e.includes('example.com')
    || e.includes('test');
}

async function countTable(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function listAllAuthUsers() {
  /** @type {{ id: string, isTest: boolean }[]} */
  const users = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    for (const u of batch) {
      users.push({
        id: u.id,
        isTest: isLikelyTestEmail(u.email),
      });
    }
    if (batch.length < perPage) break;
    page += 1;
    if (page > 100) break;
  }
  return users;
}

async function main() {
  const users = await listAllAuthUsers();
  const testUserIds = new Set(users.filter((u) => u.isTest).map((u) => u.id));
  const realUserIds = new Set(users.filter((u) => !u.isTest).map((u) => u.id));

  const [
    bodyMetricsTotal,
    profilesTotal,
    membershipsTotal,
    plansTotal,
    workoutsTotal,
    habitLogsTotal,
    activeMembershipsTotal,
  ] = await Promise.all([
    countTable('body_metrics'),
    countTable('profiles'),
    countTable('memberships'),
    countTable('ai_generated_plans'),
    countTable('workouts'),
    countTable('habit_logs'),
    supabase.from('memberships').select('*', { count: 'exact', head: true }).eq('status', 'active').then((r) => {
      if (r.error) throw new Error(`memberships active: ${r.error.message}`);
      return r.count ?? 0;
    }),
  ]);

  let realUserPlanCount = 0;
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('ai_generated_plans')
      .select('user_id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      if (row.user_id && realUserIds.has(row.user_id)) realUserPlanCount += 1;
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const report = {
    auth_users_total: users.length,
    likely_smoke_test_users: testUserIds.size,
    likely_real_users: realUserIds.size,
    body_metrics_total: bodyMetricsTotal,
    profiles_total: profilesTotal,
    memberships_total: membershipsTotal,
    ai_generated_plans_total: plansTotal,
    plans_per_likely_real_user: realUserIds.size
      ? Number((realUserPlanCount / realUserIds.size).toFixed(2))
      : 0,
    workouts_total: workoutsTotal,
    habit_logs_total: habitLogsTotal,
    active_memberships_total: activeMembershipsTotal,
    classification_patterns: ['bm-smoke', 'smoke', 'example.com', 'test'],
    generated_at: new Date().toISOString(),
  };

  console.log(sanitizeOutput(JSON.stringify(report, null, 2)));
}

main().catch((err) => {
  console.error('FAIL', sanitizeOutput(err?.message || String(err)));
  process.exit(1);
});
