#!/usr/bin/env node
/**
 * Úklid účtů, které po sobě nechávají testovací běhy (smoke test, paid path).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROČ SE TENHLE SKRIPT PŘEPISOVAL (14. 8. 2026)
 *
 * V release testu selhal dvakrát a pokaždé tiše:
 *
 *   1. `AuthApiError: Unregistered API key`. Načítal `.env` PŘED `.env.local`
 *      a nastavoval jen dosud nedefinované klíče, takže starý
 *      SUPABASE_SERVICE_ROLE_KEY v `.env` přebil platný v `.env.local`.
 *      Pořadí je teď opačné — `.env` je poslední záchrana, ne autorita.
 *
 *   2. Hledal jen `smoketest+*@bodyandmindon.cz`. Jenže smoke test zakládá
 *      `info+bm-smoke-<dieta>-<čas>@bodyandmindon.cz` (proti produkci) nebo
 *      `bm-smoke-<dieta>-<čas>@example.com` (lokálně) a `verify:paid-path`
 *      zakládá `info+bm-paid-<čas>@…`. Se správným klíčem tedy skript našel
 *      NULA účtů a hlásil „Nic ke smazání“, zatímco jich v ostré DB leželo 41.
 *
 * Úklid, který skončí bez chyby a nic neudělá, je horší než úklid, který spadne.
 * Skript proto na konci ověřuje dopad a při zbytku končí nenulově.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROČ SE NEZRCADLÍ `je_testovaci_email()` Z DB
 *
 * Ta funkce má větev `^(info|smoketest)\+[^@]+@bodyandmindon\.cz$`, tedy JAKÝKOLI
 * `info+…` alias. Pro hlídku v `system_health_alerts` je to správně (falešně
 * nezakřičí), pro MAZÁNÍ je to mina — ručně založený `info+neco@` by zmizel.
 * Tady se proto vypisují konkrétní prefixy, které generují naše skripty.
 *
 * Použití:
 *   npm run admin:delete-smoketest-users -- --dry-run
 *   npm run admin:delete-smoketest-users
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
    let val = t.slice(eq + 1).trim().replace(/\r$/, '');
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// POŘADÍ JE ZÁVAZNÉ. Vyhrává první nalezená hodnota, takže nejkonkrétnější
// soubor musí jít první. Obrácené pořadí je přesně bug č. 1 z hlavičky.
loadDotEnvFile('.env.local');
loadDotEnvFile('.env.production.local');
loadDotEnvFile('.env');

const DRY = process.argv.includes('--dry-run');

/** Tabulky vázané na `user_id`. Pořadí = od závislých k nadřazeným. */
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
  // Doplněno 14. 8. 2026 — `verify:paid-path` ho uklízí, tenhle skript ne,
  // takže po smoke testech zůstávalo 15 řádků na účet.
  'start_workout_progression',
  'body_metrics',
  'memberships',
  'ai_logs',
];

/**
 * Tabulky vázané E-MAILEM, ne `user_id`. Smazání auth uživatele je tu nechá
 * viset — přesně tak vznikly osiřelé `registrations`, na které křičela hlídka
 * `registrations_viselec` (viz migrace 20260813214759).
 */
const TABLES_WITH_EMAIL = ['registrations', 'body_metrics'];

// VZORY ŽIJÍ V `lib/testAccountEmails.js`, ne tady. Zadrátovaný vzor u skriptu
// byl přesně to, co v release testu selhalo — a bez testu se to nedalo poznat.
const { isTestAccountEmail: jeTestovaciEmail } = await import('../lib/testAccountEmails.js');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL (nebo NEXT_PUBLIC_SUPABASE_URL) nebo SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/**
 * Jeden průchod auth uživateli. Dřív se `listUsers` volal ZNOVU pro každý
 * e-mail, aby se dohledalo `id` — u 41 účtů to bylo 41 enumerací celé tabulky.
 * @returns {Promise<Array<{id: string, email: string}>>}
 */
async function nactiTestovaciAuthUcty() {
  const nalezene = new Map();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      const em = (u.email || '').trim().toLowerCase();
      if (em && jeTestovaciEmail(em) && !nalezene.has(em)) nalezene.set(em, u.id);
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 100) {
      console.warn('listUsers: více než 100 stránek, ukončuji enumeraci.');
      break;
    }
  }
  return [...nalezene].map(([email, id]) => ({ email, id })).sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Profily bez auth uživatele. Vznikají, když se dřívější úklid nedokončil.
 * @returns {Promise<Array<{id: string, email: string}>>}
 */
async function nactiOsireleProfily(smazaneEmaily) {
  const { data, error } = await supabase.from('profiles').select('id, email');
  if (error) {
    console.warn('[profiles sken]', error.message);
    return [];
  }
  const jizReseno = new Set(smazaneEmaily);
  return (data || [])
    .filter((p) => jeTestovaciEmail(p.email) && !jizReseno.has(String(p.email).toLowerCase()))
    .map((p) => ({ id: p.id, email: String(p.email).toLowerCase() }));
}

async function smazRadkyUzivatele(userId) {
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

async function smazRadkyPodleEmailu(email) {
  for (const table of TABLES_WITH_EMAIL) {
    const { error } = await supabase.from(table).delete().eq('email', email);
    if (error && !/relation|does not exist|column/i.test(error.message)) {
      console.warn(`[${table} by email]`, error.message);
    }
  }
}

async function smazJeden({ id, email, maAuth }) {
  if (maAuth) {
    await smazRadkyUzivatele(id);
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw new Error(`deleteUser ${email}: ${error.message}`);
  } else {
    await smazRadkyUzivatele(id);
  }
  await smazRadkyPodleEmailu(email);
}

/**
 * KONTROLA DOPADU. Bez ní skript hlásil úspěch i tehdy, když nesmazal nic.
 * @returns {Promise<string[]>} popisy zbytků, prázdné = čisto
 */
async function overUklid() {
  const zbytky = [];

  const authZbytek = await nactiTestovaciAuthUcty();
  if (authZbytek.length) zbytky.push(`auth.users=${authZbytek.length}`);

  const { data: profily } = await supabase.from('profiles').select('id, email');
  const profZbytek = (profily || []).filter((p) => jeTestovaciEmail(p.email));
  if (profZbytek.length) zbytky.push(`profiles=${profZbytek.length}`);

  for (const table of TABLES_WITH_EMAIL) {
    const { data, error } = await supabase.from(table).select('email');
    if (error) continue;
    const pocet = (data || []).filter((r) => jeTestovaciEmail(r.email)).length;
    if (pocet) zbytky.push(`${table}=${pocet}`);
  }

  return zbytky;
}

async function main() {
  const authUcty = await nactiTestovaciAuthUcty();
  const osirele = await nactiOsireleProfily(authUcty.map((u) => u.email));

  const kSmazani = [
    ...authUcty.map((u) => ({ ...u, maAuth: true })),
    ...osirele.map((p) => ({ ...p, maAuth: false })),
  ];

  console.log(`Testovací účty: ${authUcty.length} v auth, ${osirele.length} osiřelých profilů.`);
  for (const u of kSmazani) console.log(`  ${u.maAuth ? 'auth  ' : 'orphan'} ${u.email}`);

  if (kSmazani.length === 0) {
    const zbytky = await overUklid();
    if (zbytky.length) {
      console.error(`Nic k mazání, ale kontrola našla zbytky: ${zbytky.join(', ')}`);
      process.exit(1);
    }
    console.log('Nic ke smazání, produkce je čistá.');
    return;
  }

  if (DRY) {
    console.log('\nDry run – nic se nesmazalo.');
    return;
  }

  let chyb = 0;
  for (const u of kSmazani) {
    try {
      await smazJeden(u);
      console.log('Smazán:', u.email);
    } catch (e) {
      chyb += 1;
      console.error('Selhalo:', u.email, e?.message || e);
    }
  }

  const zbytky = await overUklid();
  if (zbytky.length || chyb) {
    console.error(`\nÚKLID NEDOKONČEN — chyb ${chyb}, zbytky: ${zbytky.join(', ') || 'žádné'}`);
    process.exit(1);
  }
  console.log(`\nHotovo: smazáno ${kSmazani.length}, po kontrole nezůstala žádná stopa.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
