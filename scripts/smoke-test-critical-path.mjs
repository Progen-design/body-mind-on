#!/usr/bin/env node
/**
 * Smoke test kritické cesty: POST /api/body-metrics
 * Očekává 200 (plán ready/pending/sent) nebo 503 s hasUserId: true
 * Spustit: node scripts/smoke-test-critical-path.mjs
 * Pro produkci: BASE_URL=https://app.bodyandmindon.cz node scripts/smoke-test-critical-path.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const payloadPath = join(__dirname, 'smoke-test-payload.json');
let payload;
try {
  payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
} catch (e) {
  console.error('Chyba: nelze načíst', payloadPath, e.message);
  process.exit(1);
}

// Unikátní e-mail pro každý běh, aby se předešlo konfliktům
payload.email = `smoketest+${Date.now()}@bodyandmindon.cz`;

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
