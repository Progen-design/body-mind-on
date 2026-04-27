#!/usr/bin/env node
/**
 * Smaže všechny Supabase Auth uživatele s e-mailem smoketest+*@bodyandmindon.cz (+ související řádky).
 * Stejná logika jako delete-user-by-email.mjs. Vyžaduje SUPABASE_SERVICE_ROLE_KEY a URL v .env / .env.local.
 *
 * Použití: node scripts/delete-smoketest-users.mjs
 * Dry run (jen výpis): node scripts/delete-smoketest-users.mjs --dry-run
 */
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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

const DRY = process.argv.includes('--dry-run');

const TABLES_WITH_USER_ID = [
  'habit_logs',
  'workouts',
  'user_meal_pins',
  'user_habits',
  'user_checkins',
  'user_ai_memory',
  'ai_messages',
  'ai_content_drafts',
  'ai_tasks',
  'ai_generated_plans',
  'body_metrics',
  'memberships',
  'ai_logs',
];

/** smoketest+cokoli@bodyandmindon.cz */
const SMOKE_PATTERN = /^smoketest\+.+@bodyandmindon\.cz$/i;

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL (nebo NEXT_PUBLIC_SUPABASE_URL) nebo SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function listAllSmokeEmails() {
  const emails = new Set();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      const em = (u.email || '').trim().toLowerCase();
      if (em && SMOKE_PATTERN.test(em)) emails.add(em);
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 100) {
      console.warn('listUsers: více než 100 stránek, ukončuji enumeraci.');
      break;
    }
  }
  return [...emails].sort();
}

async function deleteRowsForUser(userId) {
  for (const table of TABLES_WITH_USER_ID) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error && !/relation|does not exist|column/i.test(error.message)) {
      console.warn(`[${table}]`, error.message);
    }
  }
  const { error: profErr } = await supabase.from('profiles').delete().eq('id', userId);
  if (profErr && !/relation|does not exist/i.test(profErr.message)) {
    console.warn('[profiles]', profErr.message);
  }
}

async function findAuthUserIdByEmail(targetEmail) {
  const needle = targetEmail.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === needle);
    if (hit) return hit.id;
    if (users.length < perPage) return null;
    page += 1;
    if (page > 100) return null;
  }
}

async function deleteOrphanBodyMetricsByEmail(targetEmail) {
  const { error } = await supabase.from('body_metrics').delete().eq('email', targetEmail);
  if (error && !/relation|does not exist/i.test(error.message)) {
    console.warn('[body_metrics by email]', error.message);
  }
}

async function deleteOneEmail(email) {
  const userId = await findAuthUserIdByEmail(email);
  if (userId) {
    await deleteRowsForUser(userId);
    const { error: delAuth } = await supabase.auth.admin.deleteUser(userId);
    if (delAuth) throw new Error(`deleteUser ${email}: ${delAuth.message}`);
    console.log('Smazán auth:', email, '→', userId);
  } else {
    console.log('Auth nenalezen (jen orphan?):', email);
  }
  await deleteOrphanBodyMetricsByEmail(email);
}

async function main() {
  const emails = await listAllSmokeEmails();
  console.log(`Nalezeno smoketest+*@bodyandmindon.cz: ${emails.length}`);
  if (emails.length === 0) {
    console.log('Nic ke smazání.');
    return;
  }
  for (const em of emails) console.log(' ', em);
  if (DRY) {
    console.log('Dry run – nic se nesmazalo.');
    return;
  }
  for (const em of emails) {
    await deleteOneEmail(em);
  }
  console.log('Hotovo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
