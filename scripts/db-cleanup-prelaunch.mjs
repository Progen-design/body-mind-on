#!/usr/bin/env node
/**
 * Pre-launch database cleanup — runtime/user data only.
 *
 * DEFAULT: DRY RUN (no DELETE). Nothing is modified unless explicitly applied.
 *
 *   node scripts/db-cleanup-prelaunch.mjs
 *   node scripts/db-cleanup-prelaunch.mjs --dry-run
 *   CONFIRM_CLEAN_DATABASE=yes APPLY=true node scripts/db-cleanup-prelaunch.mjs --apply
 *   CONFIRM_CLEAN_DATABASE=yes WIPE_ALL_AUTH_USERS=yes APPLY=true node scripts/db-cleanup-prelaunch.mjs --apply
 *
 * Requires: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Optional keep list: KEEP_AUTH_EMAILS=prikopa@pro-security.cz,tom@example.com
 * Full wipe (no kept accounts): WIPE_ALL_AUTH_USERS=yes (requires CONFIRM_CLEAN_DATABASE=yes)
 *
 * Does NOT touch: schema, RLS, migrations, recipes_catalog, exercise_asset_registry,
 * ai_agents*, ai_trigger_rules, ai_task_types, ai_executor_bindings, ai_context_profiles,
 * community_categories, storage recipe-images bucket.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function loadDotEnvFile(relPath) {
  const p = join(repoRoot, relPath);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
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

['.env', '.env.local', '.env.production.local'].forEach(loadDotEnvFile);

const APPLY = process.argv.includes('--apply') || process.env.APPLY === 'true';
const DRY_RUN = !APPLY || process.argv.includes('--dry-run');
const WIPE_ALL_AUTH = process.env.WIPE_ALL_AUTH_USERS === 'yes';
const KEEP_EMAILS = WIPE_ALL_AUTH
  ? []
  : (process.env.KEEP_AUTH_EMAILS || 'prikopa@pro-security.cz')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

/** Delete order: children before parents; workouts before plans. */
const RUNTIME_TABLES_DELETE_ALL = [
  'habit_logs',
  'workouts',
  'user_meal_pins',
  'user_habits',
  'user_checkins',
  'user_ai_memory',
  'ai_messages',
  'ai_content_drafts',
  'ai_logs',
  'ai_tasks',
  'ai_events',
  'withings_measurements',
  'withings_body_snapshots',
  'withings_oauth_states',
  'withings_connections',
  'ai_generated_plans',
  'body_metrics',
  'profiles',
  'memberships',
  'community_replies',
  'community_posts',
  'nutrition_logs',
  'fitness_goals',
  'progress_tracking',
  'subscriptions',
  'ai_agents_logs',
  'trainer_calendar_tokens',
  'openai_response_cache',
  'openai_daily_usage',
  'meal_metadata_cache',
  'exercise_metadata_cache',
  '_backup_2026_06_02_ai_agents',
  '_backup_2026_06_02_body_metrics',
  '_backup_2026_06_02_exercise_cache',
  '_backup_2026_06_02_meal_cache',
  '_backup_2026_06_02_memberships',
  '_backup_2026_06_02_plans',
  '_backup_2026_06_02_profiles',
  '_backup_2026_06_02_user_habits',
  '_backup_2026_06_02_users',
];

const KEEP_TABLES = [
  'recipes_catalog',
  'exercise_asset_registry',
  'ai_agents',
  'ai_agent_settings',
  'ai_agent_tools',
  'ai_agent_versions',
  'ai_trigger_rules',
  'ai_task_types',
  'ai_executor_bindings',
  'ai_context_profiles',
  'ai_supporting_documents',
  'ai_config',
  'community_categories',
  'trainer_alert_state',
  'registrations',
  'users',
];

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function countTable(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    if (/relation|does not exist/i.test(error.message)) return { table, count: null, error: error.message };
    return { table, count: null, error: error.message };
  }
  return { table, count: count ?? 0 };
}

async function listAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
    if (page > 100) break;
  }
  return users;
}

function maskEmail(email) {
  const e = String(email || '');
  const [local, domain] = e.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}${'*'.repeat(Math.max(0, local.length - visible.length))}@${domain}`;
}

function isLikelyTestEmail(email) {
  const em = String(email || '').toLowerCase();
  return (
    em.includes('+bm-') ||
    em.includes('+emailsent') ||
    em.includes('+catalog') ||
    em.includes('+smoke') ||
    em.includes('+test') ||
    em.includes('+e2e') ||
    em.startsWith('info+') && em.endsWith('@bodyandmindon.cz') ||
    em.endsWith('@example.com') ||
    em.startsWith('janprikopa+')
  );
}

async function deleteAllFromTable(table) {
  if (DRY_RUN) return { table, deleted: 0, dryRun: true };

  const attempts = [
    () => supabase.from(table).delete({ count: 'exact' }).gte('id', '00000000-0000-0000-0000-000000000000'),
    () => supabase.from(table).delete({ count: 'exact' }).not('cache_key', 'is', null),
    () => supabase.from(table).delete({ count: 'exact' }).not('usage_date', 'is', null),
    () => supabase.from(table).delete({ count: 'exact' }).not('created_at', 'is', null),
  ];

  let lastError = null;
  for (const attempt of attempts) {
    const res = await attempt();
    if (!res.error) return { table, deleted: res.count ?? null };
    lastError = res.error;
    if (!/does not exist|column/i.test(res.error.message || '')) break;
  }
  throw new Error(`${table}: ${lastError?.message || 'delete failed'}`);
}

async function deleteAuthUser(userId) {
  if (DRY_RUN) return { userId, dryRun: true };
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw new Error(`auth.deleteUser ${userId}: ${error.message}`);
  return { userId, deleted: true };
}

async function countStorageBucket(bucket) {
  const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (error) return { bucket, count: null, error: error.message };
  let total = data?.length ?? 0;
  for (const entry of data || []) {
    if (!entry.id) {
      const nested = await supabase.storage.from(bucket).list(entry.name, { limit: 1000 });
      total += (nested.data?.length ?? 0) - 1;
    }
  }
  return { bucket, count: total };
}

async function cleanAvatarsBucket(keepUserIds) {
  const keep = new Set(keepUserIds.filter(Boolean));
  const { data: topLevel, error } = await supabase.storage.from('avatars').list('', { limit: 1000 });
  if (error) throw new Error(`avatars list: ${error.message}`);
  let removed = 0;
  for (const entry of topLevel || []) {
    const folder = entry.name;
    if (!folder || keep.has(folder)) continue;
    const { data: files } = await supabase.storage.from('avatars').list(folder, { limit: 1000 });
    const paths = (files || []).map((f) => `${folder}/${f.name}`);
    if (!paths.length) continue;
    if (DRY_RUN) {
      removed += paths.length;
      continue;
    }
    const { error: remErr } = await supabase.storage.from('avatars').remove(paths);
    if (remErr) console.warn('[avatars] remove', folder, remErr.message);
    else removed += paths.length;
  }
  return { bucket: 'avatars', removed, dryRun: DRY_RUN };
}

async function main() {
  if (APPLY && process.env.CONFIRM_CLEAN_DATABASE !== 'yes') {
    console.error('APPLY vyžaduje CONFIRM_CLEAN_DATABASE=yes');
    process.exit(1);
  }
  if (APPLY && WIPE_ALL_AUTH && process.env.CONFIRM_CLEAN_DATABASE !== 'yes') {
    console.error('WIPE_ALL_AUTH_USERS=yes vyžaduje CONFIRM_CLEAN_DATABASE=yes');
    process.exit(1);
  }

  console.log(`Mode: ${DRY_RUN ? 'DRY_RUN' : 'APPLY'}`);
  console.log('WIPE_ALL_AUTH_USERS:', WIPE_ALL_AUTH ? 'yes' : 'no');
  console.log('KEEP_AUTH_EMAILS:', KEEP_EMAILS.map(maskEmail).join(', ') || '(none)');

  const beforeCounts = [];
  for (const table of [...RUNTIME_TABLES_DELETE_ALL, ...KEEP_TABLES]) {
    beforeCounts.push(await countTable(table));
  }

  const authUsers = await listAuthUsers();
  const toDeleteAuth = authUsers.filter((u) => !KEEP_EMAILS.includes((u.email || '').toLowerCase()));
  const toKeepAuth = authUsers.filter((u) => KEEP_EMAILS.includes((u.email || '').toLowerCase()));

  if (APPLY && toKeepAuth.length === 0 && !WIPE_ALL_AUTH) {
    const proSecurity = authUsers
      .filter((u) => String(u.email || '').toLowerCase().includes('pro-security'))
      .map((u) => maskEmail(u.email));
    console.error('KEEP_AUTH_EMAILS nenalezen — APPLY zastaven.');
    console.error('Pro-security účty v Auth:', proSecurity.join(', ') || '(žádné)');
    console.error('Pro smazání všech účtů použijte WIPE_ALL_AUTH_USERS=yes');
    process.exit(1);
  }
  if (APPLY && WIPE_ALL_AUTH && toDeleteAuth.length === 0) {
    console.log('WIPE_ALL_AUTH_USERS: žádní auth uživatelé ke smazání — pokračuji na runtime tabulky.');
  }

  const recipeImagesBefore = await countStorageBucket('recipe-images');

  console.log('\n--- Before counts (runtime tables) ---');
  for (const row of beforeCounts.filter((r) => RUNTIME_TABLES_DELETE_ALL.includes(r.table))) {
    console.log(`${row.table}: ${row.count ?? 'ERR'}${row.error ? ` (${row.error})` : ''}`);
  }

  console.log('\n--- Auth users ---');
  console.log('total:', authUsers.length);
  console.log('to keep:', toKeepAuth.length, toKeepAuth.map((u) => maskEmail(u.email)).join(', ') || '-');
  console.log('to delete:', toDeleteAuth.length);
  console.log('likely test (heuristic):', authUsers.filter((u) => isLikelyTestEmail(u.email)).length);
  console.log('recipe-images objects (keep):', recipeImagesBefore.count ?? recipeImagesBefore.error);

  const actions = [];

  for (const table of RUNTIME_TABLES_DELETE_ALL) {
    const result = await deleteAllFromTable(table);
    actions.push({ phase: 'truncate_runtime', ...result });
    console.log(`${DRY_RUN ? '[DRY]' : '[DEL]'} ${table}`, result);
  }

  const avatarClean = await cleanAvatarsBucket(toKeepAuth.map((u) => u.id));
  actions.push({ phase: 'avatars_bucket', ...avatarClean });
  console.log(`${DRY_RUN ? '[DRY]' : '[STORAGE]'} avatars cleanup`, avatarClean);

  for (const u of toDeleteAuth) {
    const { data: rpcData, error: rpcErr } = DRY_RUN
      ? { data: null, error: null }
      : await supabase.rpc('delete_user_data', { target_user_id: u.id });
    if (!DRY_RUN && rpcErr) {
      console.warn('delete_user_data fallback skip', maskEmail(u.email), rpcErr.message);
    } else if (!DRY_RUN) {
      console.log('delete_user_data', maskEmail(u.email), rpcData);
    }
    const del = await deleteAuthUser(u.id);
    actions.push({ phase: 'auth_delete', email: maskEmail(u.email), ...del });
    console.log(`${DRY_RUN ? '[DRY]' : '[AUTH]'} delete`, maskEmail(u.email));
  }

  const afterCounts = [];
  for (const table of [...RUNTIME_TABLES_DELETE_ALL, ...KEEP_TABLES, 'profiles']) {
    afterCounts.push(await countTable(table));
  }

  const recipeImagesAfter = await countStorageBucket('recipe-images');
  console.log('recipe-images after:', recipeImagesAfter.count ?? recipeImagesAfter.error);
  for (const row of afterCounts.filter((r) => KEEP_TABLES.includes(r.table))) {
    const before = beforeCounts.find((b) => b.table === row.table);
    const ok = row.count === before?.count;
    console.log(`${ok ? 'OK' : 'WARN'} ${row.table}: before=${before?.count} after=${row.count}`);
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: DRY_RUN ? 'DRY_RUN' : 'APPLY',
    keep_auth_emails: KEEP_EMAILS,
    before_counts: beforeCounts,
    after_counts: afterCounts,
    auth: {
      total: authUsers.length,
      delete: toDeleteAuth.length,
      keep: toKeepAuth.length,
    },
    actions,
  };

  const artifactsDir = join(repoRoot, 'scripts', 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });
  const reportPath = join(artifactsDir, `db-cleanup-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\nReport saved:', reportPath);

  if (DRY_RUN) {
    console.log('\nDRY RUN complete — no data modified.');
    console.log('To apply: CONFIRM_CLEAN_DATABASE=yes APPLY=true node scripts/db-cleanup-prelaunch.mjs --apply');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
