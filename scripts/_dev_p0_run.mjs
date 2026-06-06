#!/usr/bin/env node
/**
 * One-off helper for P0 RUN DEV — loads .env.local and runs Supabase CLI commands.
 * Usage: node scripts/_dev_p0_run.mjs branches-create | db-push | test-sql
 */
import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
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
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
}

loadEnv();

const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
const prodRef = process.env.SUPABASE_PROJECT_REF || 'ipfyavvmmxmsjupmfnes';
const cmd = process.argv[2];

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env.local');
  process.exit(1);
}

process.env.SUPABASE_ACCESS_TOKEN = token;

function run(args, opts = {}) {
  const r = spawnSync('npx', ['-y', 'supabase@latest', ...args], {
    cwd: root,
    env: process.env,
    shell: true,
    encoding: 'utf8',
    ...opts,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r;
}

if (cmd === 'branches-create') {
  const name = process.argv[3] || 'p0-rls-hardening';
  console.log(`Creating branch "${name}" on project ${prodRef} (NOT prod data)...`);
  const r = run(['branches', 'create', name, '--project-ref', prodRef, '-o', 'json']);
  process.exit(r.status ?? 1);
}

if (cmd === 'branches-list') {
  const r = run(['branches', 'list', '--project-ref', prodRef, '-o', 'json']);
  process.exit(r.status ?? 1);
}

if (cmd === 'projects-list') {
  const r = run(['projects', 'list', '-o', 'json']);
  process.exit(r.status ?? 1);
}

if (cmd === 'db-push') {
  const branchRef = process.argv[3];
  if (!branchRef) {
    console.error('Usage: node scripts/_dev_p0_run.mjs db-push <branch-ref>');
    process.exit(1);
  }
  console.log(`Linking and pushing migrations to DEV branch ${branchRef}...`);
  let r = run(['link', '--project-ref', branchRef]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'push', '--linked']);
  process.exit(r.status ?? 1);
}

/** Dev project (NOT prod ipfyavvmmxmsjupmfnes) — Vercel sandbox, may be INACTIVE */
const DEV_PROJECT_REF = process.env.SUPABASE_DEV_PROJECT_REF || 'qfufvsyhlbximanxayci';

if (cmd === 'db-push-dev') {
  console.log(`Linking and pushing migrations to DEV project ${DEV_PROJECT_REF} (NOT prod)...`);
  let r = run(['link', '--project-ref', DEV_PROJECT_REF]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'push', '--linked']);
  process.exit(r.status ?? 1);
}

if (cmd === 'db-lint-dev') {
  let r = run(['link', '--project-ref', DEV_PROJECT_REF]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'lint', '--linked', '--level', 'error']);
  process.exit(r.status ?? 1);
}

if (cmd === 'create-dev-project') {
  const name = process.argv[3] || 'body-mind-on-p0-dev';
  const orgId = process.env.SUPABASE_ORG_ID || 'pukopzbzuzvqnhorducf';
  const dbPassword = process.argv[4] || process.env.SUPABASE_DEV_DB_PASSWORD || `P0dev_${Date.now().toString(36)}!Aa1`;
  console.log(`Creating DEV project "${name}" in org ${orgId} (NOT prod)...`);
  const r = run([
    'projects', 'create', name,
    '--org-id', orgId,
    '--region', 'eu-central-1',
    '--db-password', dbPassword,
    '-o', 'json',
  ]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log('Save SUPABASE_DEV_DB_PASSWORD for future CLI access.');
  process.exit(0);
}
if (cmd === 'reset-dev-db-password') {
  const newPass = process.argv[3] || process.env.SUPABASE_DEV_DB_PASSWORD || `P0dev_${Date.now().toString(36)}!Aa1`;
  console.log(`Resetting DB password for DEV project ${DEV_PROJECT_REF}...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_PROJECT_REF}/database/password`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPass }),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}: ${text}`);
  if (res.ok) {
    process.env.SUPABASE_DB_PASSWORD = newPass;
    console.log('Set SUPABASE_DB_PASSWORD in env for this session.');
  }
  process.exit(res.ok ? 0 : 1);
}

if (cmd === 'db-push-dev-direct') {
  const dbPass = process.argv[3] || process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DEV_DB_PASSWORD;
  if (!dbPass) {
    console.error('Usage: reset-dev-db-password first, then db-push-dev-direct [password]');
    process.exit(1);
  }
  process.env.SUPABASE_DB_PASSWORD = dbPass;
  console.log(`Pushing migrations to DEV ${DEV_PROJECT_REF} with db password (NOT prod)...`);
  let r = run(['link', '--project-ref', DEV_PROJECT_REF]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'push', '--linked']);
  process.exit(r.status ?? 1);
}

if (cmd === 'restore-dev') {
  console.log(`Restoring paused DEV project ${DEV_PROJECT_REF}...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_PROJECT_REF}/restore`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}: ${text}`);
  process.exit(res.ok ? 0 : 1);
}

if (cmd === 'db-query-dev') {
  const sql = process.argv[3];
  const file = process.argv[4];
  const dbPass = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DEV_DB_PASSWORD;
  if (dbPass) process.env.SUPABASE_DB_PASSWORD = dbPass;
  let r = run(['link', '--project-ref', DEV_PROJECT_REF]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  const args = ['db', 'query', '--linked'];
  if (file) args.push('-f', file);
  else if (sql) args.push(sql);
  else {
    console.error('Usage: db-query-dev <sql> OR db-query-dev --file <path>');
    process.exit(1);
  }
  r = run(args);
  process.exit(r.status ?? 1);
}

if (cmd === 'apply-p0-dev') {
  const dbPass = process.argv[3] || process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DEV_DB_PASSWORD;
  if (dbPass) process.env.SUPABASE_DB_PASSWORD = dbPass;
  console.log(`Applying P0 migration only on DEV ${DEV_PROJECT_REF}...`);
  let r = run(['link', '--project-ref', DEV_PROJECT_REF]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'query', '--linked', '-f', 'supabase/migrations/20260606230000_p0_gdpr_rls_hardening.sql']);
  process.exit(r.status ?? 1);
}

if (cmd === 'api-keys-dev') {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}: ${text}`);
  process.exit(res.ok ? 0 : 1);
}

if (cmd === 'migration-list-dev') {
  const dbPass = process.argv[3] || process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DEV_DB_PASSWORD;
  if (dbPass) process.env.SUPABASE_DB_PASSWORD = dbPass;
  let r = run(['link', '--project-ref', DEV_PROJECT_REF]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['migration', 'list', '--linked']);
  process.exit(r.status ?? 1);
}

if (cmd === 'advisors-dev') {
  const dbPass = process.argv[3] || process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DEV_DB_PASSWORD;
  if (dbPass) process.env.SUPABASE_DB_PASSWORD = dbPass;
  let r = run(['link', '--project-ref', DEV_PROJECT_REF]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'advisors', '--linked', '--type', 'security', '--level', 'error']);
  process.exit(r.status ?? 0);
}

if (cmd === 'run-dev-tests') {
  const dbPass = process.argv[3] || process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DEV_DB_PASSWORD;
  if (dbPass) process.env.SUPABASE_DB_PASSWORD = dbPass;
  console.log(`Running P0 seed + tests on DEV project ${DEV_PROJECT_REF}...`);
  let r = run(['link', '--project-ref', DEV_PROJECT_REF]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'query', '--linked', '-f', 'scripts/test_p0_seed.sql']);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'query', '--linked', '-f', 'scripts/test_p0_rls_dev.sql']);
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = run(['db', 'advisors', '--linked', '--type', 'security', '--level', 'error']);
  process.exit(r.status ?? 0);
}

console.error('Unknown command:', cmd);
process.exit(1);
