#!/usr/bin/env node
/**
 * Aplikuje migraci 20260325_onboarding_metrics_index na produkci.
 * Usage: node scripts/run-onboarding-metrics-migration.mjs [SUPABASE_PAT]
 * PAT lze předat jako argument nebo nastavit v .env jako SUPABASE_PAT.
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

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
      const v = t.slice(i + 1).trim();
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadEnv();

const PROJECT_REF = 'ipfyavvmmxmsjupmfnes';
const MIGRATION_FILE = join(__dirname, '../supabase/migrations/20260325_onboarding_metrics_index.sql');

const pat = process.argv[2] || process.env.SUPABASE_PAT;
if (!pat) {
  console.error('Usage: node scripts/run-onboarding-metrics-migration.mjs [SUPABASE_PAT]');
  console.error('Or set SUPABASE_PAT in .env. Get PAT at: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

function callManagementApi(pat, projectRef, query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, data: JSON.parse(data || '{}') });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  const name = MIGRATION_FILE.split(/[/\\]/).pop();
  console.log('Applying:', name);
  console.log('Project:', PROJECT_REF, '\n');

  const sql = readFileSync(MIGRATION_FILE, 'utf8');
  try {
    await callManagementApi(pat, PROJECT_REF, sql);
    console.log('Done. Index idx_ai_logs_onboarding created.');
  } catch (err) {
    console.error('FAILED:', err.message);
    console.error('\nAlternative: copy SQL from supabase/migrations/20260325_onboarding_metrics_index.sql');
    console.error('into Supabase Dashboard → SQL Editor and run.');
    process.exit(1);
  }
}

run();
