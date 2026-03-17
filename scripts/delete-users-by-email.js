/**
 * Smaže všechna data uživatelů s danými e-maily (pro testování na prázdných datech).
 * Použití: node scripts/delete-users-by-email.js janprikopa@gmail.com prikopa@pro-security.cz
 * Vyžaduje: SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY v .env / .env.local
 */
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
function loadEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  fs.readFileSync(p, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}
loadEnv('.env.local');
loadEnv('.env');

const emails = process.argv.slice(2).filter((e) => e && e.includes('@'));
if (emails.length === 0) {
  console.error('Použití: node scripts/delete-users-by-email.js email1@example.com email2@example.com');
  process.exit(1);
}

const normalizedEmails = emails.map((e) => e.trim().toLowerCase());

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v .env / .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const TABLES_WITH_USER_ID = [
  'habit_logs',
  'workouts',
  'ai_generated_plans',
  'body_metrics',
  'ai_tasks',
  'ai_events',
  'user_habits',
  'memberships',
  'ai_messages',
  'user_ai_memory',
  'user_meal_pins',
  'sessions',
  'ai_logs',
  'ai_content_drafts',
  'user_checkins',
  'profiles',
];

async function getUserIdByEmail(email) {
  const { data } = await supabase
    .from('body_metrics')
    .select('user_id')
    .eq('email', email)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function getAuthUserIdsByEmails(emails) {
  const ids = new Set();
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users || []) {
    if (u.email && emails.includes(u.email.toLowerCase())) {
      ids.add(u.id);
    }
  }
  return [...ids];
}

async function run() {
  const userIds = new Set();

  for (const email of normalizedEmails) {
    const fromMetrics = await getUserIdByEmail(email);
    if (fromMetrics) userIds.add(fromMetrics);
  }

  const fromAuth = await getAuthUserIdsByEmails(normalizedEmails);
  fromAuth.forEach((id) => userIds.add(id));

  const toDelete = [...userIds];
  if (toDelete.length === 0) {
    console.log('Pro e-maily', normalizedEmails.join(', '), 'nebyl nalezen žádný uživatel.');
    process.exit(0);
  }

  console.log('Smažu data pro user_ids:', toDelete.join(', '));
  console.log('E-maily:', normalizedEmails.join(', '));

  for (const userId of toDelete) {
    for (const table of TABLES_WITH_USER_ID) {
      try {
        const col = table === 'profiles' ? 'id' : 'user_id';
        const { error } = await supabase.from(table).delete().eq(col, userId);
        if (error) {
          if (/does not exist|relation .* does not exist/i.test(error.message)) {
            // Tabulka neexistuje – přeskočit
          } else {
            console.warn(`  ${table}:`, error.message);
          }
        } else {
          console.log(`  ${table}: smazáno`);
        }
      } catch (e) {
        console.warn(`  ${table}:`, e?.message || e);
      }
    }

    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) {
      console.warn('  auth.users delete:', authErr.message);
    } else {
      console.log('  auth.users: smazáno');
    }
  }

  console.log('Hotovo. Data pro', normalizedEmails.join(', '), 'byla smazána.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
