#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(ROOT, '.env.vercel-production.tmp');
if (!existsSync(envPath)) {
  console.error('FAIL missing .env.vercel-production.tmp — run vercel env pull first');
  process.exit(1);
}

let cron = '';
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^CRON_SECRET="?([^"]+)"?/);
  if (m) cron = m[1].trim();
}

if (!cron) {
  console.error('FAIL CRON_SECRET not found in pulled env');
  process.exit(1);
}

const base = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const res = await fetch(`${base}/api/cron/beta-email`, {
  headers: { Authorization: `Bearer ${cron}` },
});
const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }

console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(body, null, 2));
if (res.status !== 200) process.exit(1);
if (body.disabled === true) process.exit(1);
console.log('OK cron endpoint active');
