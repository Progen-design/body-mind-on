#!/usr/bin/env node
/**
 * Agregovaný audit DB integrity — bez PII ve výstupu.
 * npm run audit:database-integrity
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('FAIL missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

let failed = 0;
function section(title) {
  console.log(`\n## ${title}`);
}
function row(label, value, ok = true) {
  const status = ok ? 'OK' : 'WARN';
  if (!ok) failed += 1;
  console.log(`${status} ${label}: ${value}`);
}

async function sql(query) {
  const { data, error } = await admin.rpc('exec_sql_audit', { q: query }).catch(() => ({ data: null, error: { message: 'rpc_missing' } }));
  if (error?.message === 'rpc_missing') {
    return { useRest: true };
  }
  if (error) throw new Error(error.message);
  return { data };
}

/** Fallback checks via Supabase client where SQL RPC unavailable */
async function countOrphans(table, userCol = 'user_id') {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .not(userCol, 'is', null);
  if (error) return { error: error.message, count: null };
  return { count };
}

async function rlsEnabled(tables) {
  const out = [];
  for (const t of tables) {
    const { data, error } = await admin.from(t).select('*', { count: 'exact', head: true });
    out.push({ table: t, reachable: !error, error: error?.message || null });
  }
  return out;
}

const CORE_TABLES = [
  'memberships',
  'stripe_events',
  'ai_generated_plans',
  'body_metrics',
  'body_measurements',
  'product_events',
  'beta_feedback',
  'daily_activity_completions',
  'daily_checkins',
  'beta_cohorts',
  'beta_participants',
  'beta_email_messages',
  'beta_email_automation_state',
  'workout_replacements',
  'waitlist',
  'lifecycle_emails',
];

section('Tables reachable (service role)');
const reach = await rlsEnabled(CORE_TABLES);
for (const r of reach) {
  row(`table ${r.table}`, r.reachable ? 'reachable' : r.error, r.reachable);
}

section('Row counts (aggregated)');
for (const t of CORE_TABLES) {
  const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true });
  row(`rows ${t}`, error ? `error: ${error.message}` : String(count ?? 0), !error);
}

section('Integrity probes');
const probes = [
  {
    label: 'invalid membership status',
    run: async () => {
      const { data, error } = await admin.from('memberships').select('status').not('status', 'in', '(trial,pending_payment,active,past_due,canceled,expired)');
      if (error) return { ok: false, detail: error.message };
      return { ok: (data || []).length === 0, detail: String((data || []).length) };
    },
  },
  {
    label: 'duplicate memberships per user',
    run: async () => {
      const { data, error } = await admin.from('memberships').select('user_id');
      if (error) return { ok: false, detail: error.message };
      const seen = new Set();
      let dup = 0;
      for (const r of data || []) {
        if (seen.has(r.user_id)) dup += 1;
        seen.add(r.user_id);
      }
      return { ok: dup === 0, detail: String(dup) };
    },
  },
  {
    label: 'beta_email queued older than 90m (non quiet-hours risk)',
    run: async () => {
      const cutoff = new Date(Date.now() - 90 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from('beta_email_messages')
        .select('id', { count: 'exact' })
        .eq('status', 'queued')
        .lt('created_at', cutoff);
      if (error) return { ok: false, detail: error.message };
      return { ok: (data || []).length === 0, detail: String((data || []).length) };
    },
  },
  {
    label: 'synthetic test users (app_metadata flag)',
    run: async () => {
      let total = 0;
      let page = 1;
      for (;;) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return { ok: false, detail: error.message };
        total += (data?.users || []).filter((u) => u.app_metadata?.synthetic_test_user).length;
        if ((data?.users || []).length < 200) break;
        page += 1;
        if (page > 50) break;
      }
      return { ok: true, detail: String(total) };
    },
  },
];

for (const p of probes) {
  const r = await p.run();
  row(p.label, r.detail, r.ok !== false);
}

section('Migration parity (git file slugs)');
const migDir = join(ROOT, 'supabase', 'migrations');
const gitFiles = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
const gitSlugs = gitFiles.map((f) => f.replace(/^[\d_]+/, '').replace(/\.sql$/, ''));
row('git migration files', String(gitFiles.length));
const KNOWN_DB_ONLY = ['lifecycle_emails_queue'];
for (const slug of KNOWN_DB_ONLY) {
  const inGit = gitSlugs.some((s) => s.includes(slug) || slug.includes(s));
  row(`db-only migration tracked: ${slug}`, inGit ? 'present in git' : 'MISSING in git', inGit);
}

section('Summary');
console.log(failed === 0 ? 'RESULT: PASS' : `RESULT: WARN (${failed} checks)`);
process.exit(0);
