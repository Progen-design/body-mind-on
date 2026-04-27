#!/usr/bin/env node
/**
 * Smoke test kritické cesty: POST /api/body-metrics
 * Očekává 200 (plán ready/pending/sent) nebo 503 s hasUserId: true
 *
 * Spustit: node scripts/smoke-test-critical-path.mjs
 * Lokální API: BASE_URL=http://localhost:3000 node scripts/smoke-test-critical-path.mjs
 *
 * Proti produkci (app.bodyandmindon.cz / *.vercel.app) výchozí příjemce:
 *   info+bm-smoke-<čas>@bodyandmindon.cz (plus-adresa na stejnou schránku jako info@).
 * Volitelný přepínač: SMOKE_TEST_RECIPIENT=jiny@email.cz → použije se local+bm-smoke-…@domain
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const DEFAULT_SMOKE_LOCAL = 'info';

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

const payloadPath = join(__dirname, 'smoke-test-payload.json');
let payload;
try {
  payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
} catch (e) {
  console.error('Chyba: nelze načíst', payloadPath, e.message);
  process.exit(1);
}

payload.email = buildSmokeRecipientEmail(BASE_URL);
console.log('Smoke recipient:', payload.email);

const url = `${BASE_URL.replace(/\/$/, '')}/api/body-metrics`;
console.log('POST', url);

const start = Date.now();
const TIMEOUT_MS = 90000; // body-metrics + OpenAI + Spoonacular + wger může trvat i ~70s na cold start
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
    console.error(`Chyba: timeout po ${TIMEOUT_MS / 1000}s`);
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
  const planOk = body.planSent || body.planPending || body.plan_state === 'ready';
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
