#!/usr/bin/env node
/**
 * Ověří POST /api/ai/run-coach-scheduler (jen read-only scheduler tick, bez extra mutací).
 *
 *   node scripts/verify-run-coach-scheduler.mjs
 *   BASE_URL=https://app.bodyandmindon.cz node scripts/verify-run-coach-scheduler.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

for (const name of ['.env.production.local', '.env.prod-smoke.local', '.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  break;
}

const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const secret = process.env.CRON_SECRET || process.env.AI_SCHEDULER_SECRET;

if (!secret) {
  console.error('Chybí CRON_SECRET nebo AI_SCHEDULER_SECRET v env.');
  process.exit(1);
}

const url = `${BASE_URL}/api/ai/run-coach-scheduler?secret=${encodeURIComponent(secret)}`;
console.log('POST', `${BASE_URL}/api/ai/run-coach-scheduler?secret=***`);
console.log('timeout:', `${FETCH_TIMEOUT.SCHEDULER} ms`);

let res;
try {
  res = await fetchWithTimeout(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    FETCH_TIMEOUT.SCHEDULER
  );
} catch (err) {
  console.error(formatFetchError(err, `${BASE_URL}/api/ai/run-coach-scheduler`));
  process.exit(1);
}

const body = await res.json().catch(() => ({}));
if (!res.ok || body?.ok !== true) {
  console.error(`HTTP ${res.status}: ${BASE_URL}/api/ai/run-coach-scheduler`);
  console.error(JSON.stringify(body).slice(0, 400));
  process.exit(1);
}

console.log('PASS:', JSON.stringify(body));
