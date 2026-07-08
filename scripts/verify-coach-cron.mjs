#!/usr/bin/env node
/**
 * Ověří Vercel cron konfiguraci a bezpečnost coach scheduler endpointu.
 *
 *   node scripts/verify-coach-cron.mjs
 *   BASE_URL=https://app.bodyandmindon.cz node scripts/verify-coach-cron.mjs
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

// --- Static: vercel.json ---
const vercelJsonPath = resolve(process.cwd(), 'vercel.json');
check('vercel.json existuje', existsSync(vercelJsonPath));
const vercelJson = existsSync(vercelJsonPath) ? JSON.parse(readFileSync(vercelJsonPath, 'utf8')) : {};
const crons = Array.isArray(vercelJson.crons) ? vercelJson.crons : [];
const coachCron = crons.find((c) => c.path === '/api/ai/run-coach-scheduler');
check('coach cron path /api/ai/run-coach-scheduler', Boolean(coachCron));
check('coach cron schedule */5 * * * *', coachCron?.schedule === '*/5 * * * *');
const maxDuration = vercelJson.functions?.['pages/api/ai/run-coach-scheduler.js']?.maxDuration;
check('coach scheduler maxDuration 120s', maxDuration === 120);

// --- Static: endpoint security ---
const routePath = resolve(process.cwd(), 'pages/api/ai/run-coach-scheduler.js');
const routeSrc = existsSync(routePath) ? readFileSync(routePath, 'utf8') : '';
check('endpoint existuje', routeSrc.length > 0);
check('endpoint vyžaduje CRON_SECRET', /CRON_SECRET|AI_SCHEDULER_SECRET/.test(routeSrc));
check('endpoint kontroluje Authorization Bearer', routeSrc.includes('authHeader === bearer'));
check('endpoint podporuje GET (Vercel Cron)', routeSrc.includes("'GET'"));
check('endpoint sanitizuje error response', routeSrc.includes('sanitizeErrorMessage'));
check('endpoint nevrací raw secret', !routeSrc.includes('json({ secret'));

const schedulerPath = resolve(process.cwd(), 'lib/aiScheduler.js');
const schedulerSrc = existsSync(schedulerPath) ? readFileSync(schedulerPath, 'utf8') : '';
check('runAICoachScheduler má task limit cap', schedulerSrc.includes('if (n > 3) n = 3'));

check('npm script verify:coach-cron', (() => {
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
  return pkg.scripts?.['verify:coach-cron'] != null;
})());

// --- Runtime (optional without secret) ---
if (!secret) {
  console.log('SKIP runtime checks — chybí CRON_SECRET v env');
} else {
  // Unauthorized must fail
  const unauthRes = await fetchWithTimeout(
    `${BASE_URL}/api/ai/run-coach-scheduler`,
    { method: 'GET' },
    FETCH_TIMEOUT.GET
  ).catch(() => null);
  check('GET bez auth vrací 401', unauthRes?.status === 401);

  // Vercel Cron style: GET + Bearer
  const url = `${BASE_URL}/api/ai/run-coach-scheduler`;
  console.log('GET', url, '(Authorization: Bearer ***)');
  let res;
  try {
    res = await fetchWithTimeout(
      url,
      { method: 'GET', headers: { Authorization: `Bearer ${secret}` } },
      FETCH_TIMEOUT.SCHEDULER
    );
  } catch (err) {
    console.error(formatFetchError(err, url));
    check('GET Bearer scheduler tick', false);
  }

  if (res) {
    const bodyText = await res.text();
    let body = {};
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = {};
    }
    check('GET Bearer HTTP 200', res.status === 200);
    check('GET Bearer ok=true', body?.ok === true);
    check('GET Bearer scheduler object', body?.scheduler != null);
    check('response bez secret', !bodyText.includes(secret));
    check('response bez sk-proj', !/sk-proj-/i.test(bodyText));
    if (res.ok && body?.ok) {
      console.log('PASS runtime:', JSON.stringify(body).slice(0, 280));
    }
  }
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
