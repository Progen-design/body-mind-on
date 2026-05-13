#!/usr/bin/env node
/**
 * Bezpečné odeslání testovacího plánovacího e-mailu: plán patří owner účtu, SMTP jde na recipient.
 * Vždy vyžaduje explicitní recipient v těle API (žádný default na serveru).
 *
 *   node scripts/send-test-plan-email.mjs
 *   node scripts/send-test-plan-email.mjs --yes
 *
 * Výchozí hodnoty (lze přepsat env před spuštěním — už nastavené klíče nepřepíše .env.local):
 *   TEST_PLAN_OWNER_EMAIL=info@bodyandmindon.cz
 *   TEST_PLAN_RECIPIENT=janprikopa@gmail.com
 *   TEST_APP_URL=https://app.bodyandmindon.cz
 *
 * Env (.env.local doplní jen klíče, které ještě nejsou v prostředí):
 *   ADMIN_TOKEN               (povinné)
 *   TEST_PLAN_OWNER_EMAIL
 *   TEST_PLAN_RECIPIENT
 *   TEST_APP_URL
 *   TEST_PLAN_ID              (volitelné – konkrétní řádek ai_generated_plans)
 *   TEST_PLAN_EMAIL_OUTPUT_MODE (volitelné; výchozí nutrition_training)
 */
import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
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

const OWNER = (process.env.TEST_PLAN_OWNER_EMAIL || 'info@bodyandmindon.cz').trim().toLowerCase();
const RECIPIENT = (process.env.TEST_PLAN_RECIPIENT || 'janprikopa@gmail.com').trim().toLowerCase();
const APP_URL = String(process.env.TEST_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim();
const PLAN_ID = process.env.TEST_PLAN_ID?.trim() || '';
const PLAN_OUTPUT = (process.env.TEST_PLAN_EMAIL_OUTPUT_MODE || 'nutrition_training').trim();
const URL = `${APP_URL}/api/admin/send-test-plan-email`;

if (/localhost|127\.0\.0\.1/i.test(APP_URL)) {
  console.warn('');
  console.warn('══════════════════════════════════════════════════════════════════');
  console.warn('⚠️  Pozor: TEST_APP_URL míří na localhost.');
  console.warn('   Pro produkční test použij TEST_APP_URL=https://app.bodyandmindon.cz');
  console.warn('══════════════════════════════════════════════════════════════════');
  console.warn('');
}

if (!ADMIN_TOKEN) {
  console.error('Chybí ADMIN_TOKEN (.env.local).');
  process.exit(1);
}

async function post(body) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json.ok) {
    throw new Error(json.error || json.message || `HTTP ${res.status}`);
  }
  return json;
}

console.log('');
console.log('[send-test-plan-email] Efektivní TEST_APP_URL:', APP_URL);
console.log('[send-test-plan-email] Kontrolní náhled (dry_run)…');

const preview = await post({
  owner_email: OWNER,
  recipient_email: RECIPIENT,
  dry_run: true,
  plan_output_mode: PLAN_OUTPUT,
  ...(PLAN_ID ? { plan_id: PLAN_ID } : {}),
});

console.log('');
console.log('  Owner účet (plán v DB):', preview.owner_email);
console.log('  Příjemce (test):       ', preview.recipient_email);
console.log('  App URL:               ', APP_URL);
console.log('  plan_id:               ', preview.plan_id);
console.log('  valid_from:            ', preview.valid_from);
console.log('  valid_until:           ', preview.valid_until);
console.log('  plan_html_length:      ', preview.plan_html_length);
console.log('  from structured JSON:  ', preview.rendered_from_structured);
console.log('  plan_output_mode:      ', preview.plan_output_mode);
console.log('');

const autoYes = process.argv.includes('--yes');
if (!autoYes) {
  const rl = createInterface({ input, output });
  const answer = (await rl.question(`Odeslat plán z účtu ${OWNER} na ${RECIPIENT}? [ano / ne] `))
    .trim()
    .toLowerCase();
  await rl.close();
  if (!/^ano\b|^a\b|^y\b|^yes\b/i.test(answer)) {
    console.log('Zrušeno (bez odeslání).');
    process.exit(0);
  }
}

console.log('[send-test-plan-email] Odesílám…');

const sent = await post({
  owner_email: OWNER,
  recipient_email: RECIPIENT,
  dry_run: false,
  plan_output_mode: PLAN_OUTPUT,
  ...(PLAN_ID ? { plan_id: PLAN_ID } : {}),
});

if (!sent?.ok) {
  console.error('Chyba:', sent);
  process.exit(1);
}

console.log('');
console.log(`Testovací e-mail byl odeslán na ${RECIPIENT}.`);
console.log(
  JSON.stringify({
    owner_email: sent.owner_email,
    recipient_email: sent.recipient_email,
    plan_id: sent.plan_id,
    valid_from: sent.valid_from,
    valid_until: sent.valid_until,
    plan_html_length: sent.plan_html_length,
    rendered_from_structured: sent.rendered_from_structured,
    plan_output_mode: sent.plan_output_mode,
    mail_provider: sent.mail_provider ?? null,
    mail_message_id: sent.mail_message_id ?? null,
    mail_template_used: sent.mail_template_used ?? null,
  })
);
console.log('');
