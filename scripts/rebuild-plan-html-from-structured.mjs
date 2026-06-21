#!/usr/bin/env node
/**
 * Přepíše plan_html z structured_plan_json (bez Spoonacular).
 *
 * Volá nasazené POST /api/admin/backfill-plan-html-from-structured (Bearer ADMIN_TOKEN).
 *
 *   node scripts/rebuild-plan-html-from-structured.mjs
 *   BACKFILL_APP_URL=https://app.bodyandmindon.cz ADMIN_TOKEN=… node scripts/rebuild-plan-html-from-structured.mjs --apply
 *   BACKFILL_APP_URL=http://localhost:3000 ADMIN_TOKEN=… node scripts/rebuild-plan-html-from-structured.mjs --apply --all
 *
 * Proměnné (volitelně načte .env / .env.local / .env.production.local):
 *   ADMIN_TOKEN        – stejný jako u ostatních admin API
 *   BACKFILL_APP_URL   – výchozí https://app.bodyandmindon.cz
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function loadDotEnvFile(relPath) {
  const p = join(repoRoot, relPath);
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvFile('.env');
loadDotEnvFile('.env.local');
loadDotEnvFile('.env.production.local');

const apply = process.argv.includes('--apply');
const allPlans = process.argv.includes('--all');

const base = String(
  process.env.BACKFILL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz'
).replace(/\/$/, '');
const token = (process.env.ADMIN_TOKEN || '').trim();

if (!token) {
  console.error('Chybí ADMIN_TOKEN (v env nebo .env*).');
  process.exit(1);
}

const url = `${base}/api/admin/backfill-plan-html-from-structured`;
const body = {
  dry_run: !apply,
  only_active: !allPlans,
  skip_unchanged: true,
};

try {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    FETCH_TIMEOUT.ADMIN
  );
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText} — ${url}`);
    if (res.status === 404) {
      console.error('Tip: endpoint je až po nasazení aktuálního main na Vercel, nebo použij BACKFILL_APP_URL=http://localhost:3000 s běžícím npm run dev.');
    }
    process.exit(1);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error('Neočekávaná odpověď (ne JSON):', text.slice(0, 500));
    process.exit(1);
  }
  console.log(JSON.stringify(json, null, 2));
  if (!apply) {
    console.error('\nDry-run. Pro zápis přidej --apply (volitelně --all pro všechny plány).');
  }
  process.exit(0);
} catch (e) {
  console.error(formatFetchError(e, url));
  process.exit(1);
}
