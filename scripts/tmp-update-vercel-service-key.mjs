#!/usr/bin/env node
/**
 * Sync SUPABASE_SERVICE_ROLE_KEY to Vercel production from local .env.local.
 * Never prints secret values.
 */
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { loadLocalEnv } from './audit-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!key.startsWith('sb_secret_')) {
  console.error('FAIL local SUPABASE_SERVICE_ROLE_KEY must start with sb_secret_');
  process.exit(1);
}

const projectJsonPath = join(ROOT, '.vercel', 'project.json');
if (!existsSync(projectJsonPath)) {
  console.error('FAIL missing .vercel/project.json — run: npx vercel link');
  process.exit(1);
}

const { orgId, projectId } = JSON.parse(readFileSync(projectJsonPath, 'utf8'));
if (!orgId || !projectId) {
  console.error('FAIL .vercel/project.json missing orgId or projectId');
  process.exit(1);
}

const childEnv = { ...process.env, VERCEL_ORG_ID: orgId, VERCEL_PROJECT_ID: projectId };

function runVercel(args) {
  const r = spawnSync('npx', ['vercel', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    env: childEnv,
  });
  return r;
}

// Snapshot current production prefix (no values)
const tmpPull = join(ROOT, '.env.vercel-production.tmp');
if (existsSync(tmpPull)) unlinkSync(tmpPull);
const pull = runVercel(['env', 'pull', '.env.vercel-production.tmp', '--environment=production', '--yes']);
if (pull.status !== 0) {
  console.error('FAIL vercel env pull');
  if (pull.stderr) console.error(pull.stderr.trim());
  process.exit(1);
}

let beforePrefix = 'missing';
if (existsSync(tmpPull)) {
  for (const line of readFileSync(tmpPull, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) continue;
    const v = line.slice('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/^["']|["']$/g, '');
    if (v.startsWith('sb_secret_')) beforePrefix = 'sb_secret_*';
    else if (v.startsWith('eyJ')) beforePrefix = 'legacy JWT';
    else if (v) beforePrefix = 'other';
    break;
  }
  unlinkSync(tmpPull);
}

console.log(`production before: ${beforePrefix}`);

const update = runVercel([
  'env',
  'update',
  'SUPABASE_SERVICE_ROLE_KEY',
  'production',
  '--yes',
  `--value=${key}`,
]);

if (update.status !== 0) {
  console.error('FAIL vercel env update');
  if (update.stdout) console.error(update.stdout.trim());
  if (update.stderr) console.error(update.stderr.trim());
  process.exit(1);
}

console.log('OK SUPABASE_SERVICE_ROLE_KEY updated on Vercel production (sb_secret_*)');
console.log('Note: existing production deployment may need redeploy to pick up the new env.');
