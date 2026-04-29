#!/usr/bin/env node
/**
 * Přegeneruje plán pro konkrétního uživatele přes POST /api/admin/regenerate-user-plan
 * (unified pipeline na serveru — stejné moduly jako produkce, bez importu lib v čistém Node).
 *
 *   node scripts/regenerate-plan-for-test-user.mjs --yes
 *
 * Env (např. z .env.local):
 *   ADMIN_TOKEN        — povinné
 *   REGEN_APP_URL      — výchozí https://app.bodyandmindon.cz (pro lokál: http://localhost:3000)
 *   REGEN_PLAN_EMAIL   — výchozí info@bodyandmindon.cz
 *
 * E-mail se neposílá. Testovací odeslání plánu na jinou adresu:
 *   npm run send-test-plan-email -- --yes
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const p = join(__dirname, '..', '.env.local');
  if (!existsSync(p)) return;
  const text = readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const TARGET = (process.env.REGEN_PLAN_EMAIL || 'info@bodyandmindon.cz').trim().toLowerCase();
const APP_URL = String(process.env.REGEN_APP_URL || 'https://app.bodyandmindon.cz').replace(
  /\/$/,
  ''
);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim();
const FETCH_TIMEOUT_MS = 300_000;

if (!process.argv.includes('--yes')) {
  console.error('Pro volání admin API přidej příznak --yes .');
  console.error(`Testovací e-mail: ${TARGET}`);
  console.error(`URL: ${APP_URL}/api/admin/regenerate-user-plan`);
  process.exit(1);
}

if (!ADMIN_TOKEN) {
  console.error('Chybí ADMIN_TOKEN v prostředí (.env.local).');
  process.exit(1);
}

const url = `${APP_URL}/api/admin/regenerate-user-plan`;

console.log('');
console.log('[regenerate-plan] Testovací účet:', TARGET);
console.log('[regenerate-plan] Endpoint:', url);
console.log('[regenerate-plan] Generování na serveru (unified pipeline) může trvat 1–5 minut…');
console.log('');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify({ email: TARGET, skip_email: true }),
    signal: controller.signal,
  });
  clearTimeout(timer);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error('Neočekávaná odpověď:', res.status, text.slice(0, 200));
    process.exit(1);
  }
  if (!res.ok || !body.ok) {
    console.error('Chyba:', res.status, body.message || body.error || body);
    process.exit(1);
  }
  console.log('[regenerate-plan] Hotovo:');
  console.log(
    JSON.stringify({
      ok: true,
      email: TARGET,
      plan_id: body.plan_id ?? null,
      valid_from: body.valid_from ?? null,
      valid_until: body.valid_until ?? null,
      days_count: body.days_count ?? null,
      plan_html_length: body.plan_html_length ?? null,
    })
  );
} catch (e) {
  clearTimeout(timer);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(APP_URL);
  if (isLocal && (e.name === 'AbortError' || /fetch failed|ECONNREFUSED/i.test(String(e.message)))) {
    console.error('');
    console.error('Server pravděpodobně neběží. Spusť npm run dev, nebo nastav');
    console.error('  REGEN_APP_URL=https://app.bodyandmindon.cz');
    console.error('');
  }
  console.error('[regenerate-plan] Selhalo:', e.message || String(e));
  process.exit(1);
}
