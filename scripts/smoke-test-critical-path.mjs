#!/usr/bin/env node
/**
 * Smoke test kritické cesty: POST /api/body-metrics
 * Očekává 200 (plán ready/pending/sent) nebo 503 s hasUserId: true
 *
 * Spuštění:
 *   npm run smoke-test
 *   npm run smoke-test:prod
 *   BASE_URL=https://app.bodyandmindon.cz npm run smoke-test
 *
 * Lokální API musí běžet (npm run dev), jinak test ihned skončí s nápovědou — nečeká 90 s.
 *
 * Proti produkci výchozí příjemce (+ alias):
 *   info+bm-smoke-<čas>@bodyandmindon.cz
 * Volitelně: SMOKE_TEST_RECIPIENT=jiny@email.cz
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HEALTH_TIMEOUT_MS = 4000;
const MAIN_TIMEOUT_MS = 90000;

const DEFAULT_SMOKE_LOCAL = 'info';

function resolveBaseUrl() {
  if (process.env.BASE_URL && String(process.env.BASE_URL).trim()) {
    return String(process.env.BASE_URL).trim().replace(/\/$/, '');
  }
  if (process.argv.includes('--prod')) {
    return 'https://app.bodyandmindon.cz';
  }
  return 'http://localhost:3000';
}

const BASE_URL = resolveBaseUrl();

function buildSmokeRecipientEmail(baseUrl) {
  const raw = process.env.SMOKE_TEST_RECIPIENT?.trim();
  const prodLike = /bodyandmindon\.cz/i.test(baseUrl) || /\.vercel\.app/i.test(baseUrl);

  if (raw) {
    const at = raw.lastIndexOf('@');
    if (at <= 0) {
      console.error('SMOKE_TEST_RECIPIENT musí být platný e-mail (např. info@bodyandmindon.cz).');
      process.exit(1);
    }
    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1).toLowerCase();
    if (!local || !domain || !/^[^\s@]+\.[^\s@]+$/.test(domain)) {
      console.error('SMOKE_TEST_RECIPIENT musí být platný e-mail s doménou.');
      process.exit(1);
    }
    return `${local}+bm-smoke-${Date.now()}@${domain}`;
  }

  if (prodLike) {
    return `${DEFAULT_SMOKE_LOCAL}+bm-smoke-${Date.now()}@bodyandmindon.cz`;
  }

  return `bm-smoke-${Date.now()}@example.com`;
}

async function assertApiReachable(baseUrl) {
  const healthUrl = `${baseUrl.replace(/\/$/, '')}/api/integrations-status`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(healthUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      console.error(`Health check: ${healthUrl} vrátil ${res.status}.`);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(t);
    const isLocal =
      /^https?:\/\/localhost\b/i.test(baseUrl) ||
      /^https?:\/\/127\.0\.0\.1\b/i.test(baseUrl);
    if (isLocal) {
      console.error('');
      console.error('Lokální server neběží. Spusť npm run dev, nebo použij');
      console.error('  BASE_URL=https://app.bodyandmindon.cz npm run smoke-test');
      console.error('nebo');
      console.error('  npm run smoke-test:prod');
      console.error('');
      console.error(`Detail: ${e.name === 'AbortError' ? 'timeout health check' : e.message}`);
    } else {
      console.error(`Health check selhal (${healthUrl}): ${e.message}`);
    }
    return false;
  }
}

const payloadPath = join(__dirname, 'smoke-test-payload.json');
let payload;
try {
  payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
} catch (e) {
  console.error('Chyba: nelze načíst', payloadPath, e.message);
  process.exit(1);
}

console.log('BASE_URL:', BASE_URL);

const okHealth = await assertApiReachable(BASE_URL);
if (!okHealth) process.exit(1);

payload.email = buildSmokeRecipientEmail(BASE_URL);
console.log('Smoke recipient:', payload.email);

const url = `${BASE_URL.replace(/\/$/, '')}/api/body-metrics`;
console.log('POST', url);

const start = Date.now();
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), MAIN_TIMEOUT_MS);
let res;
try {
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
} catch (e) {
  clearTimeout(timeoutId);
  if (e.name === 'AbortError') {
    console.error(`Chyba: timeout po ${MAIN_TIMEOUT_MS / 1000}s`);
  } else {
    console.error('Chyba připojení:', e.message);
  }
  process.exit(1);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
let body;
try {
  body = await res.json();
} catch {
  body = {};
}

const ok = res.ok;
const status = res.status;

if (ok) {
  const planOk =
    body.planSent ||
    body.planPending ||
    body.plan_state === 'ready' ||
    body.plan_state === 'processing';
  if (planOk) {
    console.log(`PASS (${elapsed}s): 200, plán ready/pending/sent`);
    process.exit(0);
  }
  console.log(`PASS (${elapsed}s): 200, účet vytvořen, plán: ${body.plan_state || 'pending'}`);
  process.exit(0);
}

if (status === 503 && body.hasUserId === true) {
  console.log(`PASS (${elapsed}s): 503 s hasUserId – účet vytvořen, retry CTA`);
  process.exit(0);
}

console.error(`FAIL (${elapsed}s): ${status}`, body.error || body.message || body);
process.exit(1);
