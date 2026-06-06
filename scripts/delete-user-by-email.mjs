#!/usr/bin/env node
/**
 * Jednorázové smazání uživatele podle e-mailu (Supabase Auth + veřejné tabulky s user_id).
 * Vyžaduje SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL (nebo NEXT_PUBLIC_SUPABASE_URL) v prostředí nebo v .env.
 *
 * Použití: node scripts/delete-user-by-email.mjs info@bodyandmindon.cz
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
  for (const line of raw.split(/\n/)) {
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

const emailArg = (process.argv[2] || '').trim().toLowerCase();
if (!emailArg || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArg)) {
  console.error('Použití: node scripts/delete-user-by-email.mjs <email>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL (nebo NEXT_PUBLIC_SUPABASE_URL) nebo SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

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
    if (page > 50) {
      console.warn('listUsers: příliš mnoho stránek, ukončuji hledání.');
      return null;
    }
  }
}

async function deleteRowsForUser(userId) {
  const { data, error } = await supabase.rpc('delete_user_data', { target_user_id: userId });
  if (error) {
    throw new Error(`delete_user_data: ${error.message}`);
  }
  console.log('delete_user_data:', data);
}

async function deleteOrphanBodyMetricsByEmail(targetEmail) {
  const { error } = await supabase.from('body_metrics').delete().eq('email', targetEmail);
  if (error && !/relation|does not exist/i.test(error.message)) {
    console.warn('[body_metrics by email]', error.message);
  }
}

async function main() {
  const userId = await findAuthUserIdByEmail(emailArg);
  if (userId) {
    console.log('Nalezen auth uživatel:', emailArg, '→', userId);
    await deleteRowsForUser(userId);
    const { error: delAuth } = await supabase.auth.admin.deleteUser(userId);
    if (delAuth) {
      console.error('auth.admin.deleteUser:', delAuth.message);
      process.exit(1);
    }
    console.log('Auth uživatel smazán.');
  } else {
    console.log('Žádný auth záznam pro e-mail:', emailArg, '(přeskočeno auth.admin.deleteUser)');
  }
  await deleteOrphanBodyMetricsByEmail(emailArg);
  console.log('Hotovo (včetně orphan body_metrics pro stejný e-mail).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
