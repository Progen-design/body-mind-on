#!/usr/bin/env node
/**
 * Run beta email report using Vercel production env (no secrets printed).
 * npm run report:beta-email:prod
 */
import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(ROOT, '.env.vercel-production.tmp');

function loadEnvFile(path) {
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v.trim().replace(/\\r|\\n/g, '').trim();
  }
  return true;
}

if (!loadEnvFile(envPath)) {
  console.error('FAIL missing .env.vercel-production.tmp — run: npx vercel env pull .env.vercel-production.tmp --environment=production --yes');
  process.exit(1);
}

const r = spawnSync(
  process.execPath,
  [join(ROOT, 'scripts/report-beta-email-automation.mjs')],
  { stdio: 'inherit', env: process.env, cwd: ROOT },
);
process.exit(r.status ?? 1);
