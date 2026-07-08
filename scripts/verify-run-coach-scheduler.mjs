#!/usr/bin/env node
/**
 * Ověří /api/ai/run-coach-scheduler:
 * - statická konfigurace Vercel cron
 * - GET + Authorization Bearer (stejně jako Vercel Cron)
 * - POST + query secret (manuální/legacy verify)
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
let failed = 0;

function check(label, ok) {
  if (ok) console.log(`OK ${label}`);
  else {
    console.log(`FAIL ${label}`);
    failed += 1;
  }
}

if (!secret) {
  console.error('Chybí CRON_SECRET nebo AI_SCHEDULER_SECRET v env.');
  process.exit(1);
}

// --- Static: vercel.json cron config ---
const vercelJsonPath = resolve(process.cwd(), 'vercel.json');
if (!existsSync(vercelJsonPath)) {
  check('vercel.json existuje', false);
} else {
  const vercelJson = JSON.parse(readFileSync(vercelJsonPath, 'utf8'));
  const crons = Array.isArray(vercelJson.crons) ? vercelJson.crons : [];
  const coachCron = crons.find((c) => c.path === '/api/ai/run-coach-scheduler');
  check('vercel.json má coach scheduler cron', Boolean(coachCron));
  check('coach cron schedule 0 6 * * * (Hobby: max 1x/day)', coachCron?.schedule === '0 6 * * *');
  const maxDuration = vercelJson.functions?.['pages/api/ai/run-coach-scheduler.js']?.maxDuration;
  check('coach scheduler maxDuration 120s', maxDuration === 120);
}

const routePath = resolve(process.cwd(), 'pages/api/ai/run-coach-scheduler.js');
const routeSrc = existsSync(routePath) ? readFileSync(routePath, 'utf8') : '';
check('endpoint kontroluje Authorization Bearer', routeSrc.includes('authHeader === bearer'));
check('endpoint podporuje GET', routeSrc.includes("'GET'"));
check('endpoint sanitizuje error response', routeSrc.includes('sanitizeErrorMessage'));

async function callScheduler({ method, url, headers, label }) {
  console.log(`${method}`, url.replace(secret, '***'));
  console.log('timeout:', `${FETCH_TIMEOUT.SCHEDULER} ms`);
  let res;
  try {
    res = await fetchWithTimeout(url, { method, headers }, FETCH_TIMEOUT.SCHEDULER);
  } catch (err) {
    console.error(formatFetchError(err, url.replace(secret, '***')));
    check(`${label} request`, false);
    return;
  }
  const bodyText = await res.text();
  let body = {};
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = {};
  }
  const bodyStr = JSON.stringify(body);
  check(`${label} HTTP 200`, res.status === 200);
  check(`${label} ok=true`, body?.ok === true);
  check(`${label} scheduler object`, body?.scheduler != null && typeof body.scheduler === 'object');
  check(`${label} response bez secret`, !bodyStr.includes(secret));
  check(`${label} response bez sk-proj`, !/sk-proj-/i.test(bodyStr));
  if (res.ok && body?.ok === true) {
    console.log(`PASS ${label}:`, bodyStr.slice(0, 300));
  } else {
    console.error(`FAIL ${label} body:`, bodyStr.slice(0, 400));
  }
}

// --- Runtime: Vercel Cron style (GET + Bearer) ---
await callScheduler({
  method: 'GET',
  url: `${BASE_URL}/api/ai/run-coach-scheduler`,
  headers: { Authorization: `Bearer ${secret}` },
  label: 'GET Bearer (Vercel Cron)',
});

// --- Runtime: manual verify (POST + query secret) ---
await callScheduler({
  method: 'POST',
  url: `${BASE_URL}/api/ai/run-coach-scheduler?secret=${encodeURIComponent(secret)}`,
  headers: { 'Content-Type': 'application/json' },
  label: 'POST query secret',
});

// --- Unauthorized must fail ---
const unauthRes = await fetchWithTimeout(
  `${BASE_URL}/api/ai/run-coach-scheduler`,
  { method: 'GET' },
  FETCH_TIMEOUT.GET
).catch(() => null);
check('GET bez auth vrací 401', unauthRes?.status === 401);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
