/**
 * Nastaví u zvoleného uživatele vypršený trial (pro test Stripe na profilu).
 * Použití: node scripts/set-expired-trial-for-test.js email@example.com
 * Vyžaduje v .env nebo .env.local: SUPABASE_URL (nebo NEXT_PUBLIC_SUPABASE_URL) a SUPABASE_SERVICE_ROLE_KEY.
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

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Použití: node scripts/set-expired-trial-for-test.js email@example.com');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v .env / .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const PAST_DATE = '2020-01-01T00:00:00.000Z';

async function run() {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: metrics, error: metricsErr } = await supabase
    .from('body_metrics')
    .select('user_id')
    .eq('email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metricsErr) {
    console.error('Chyba při čtení body_metrics:', metricsErr.message);
    process.exit(1);
  }

  const userId = metrics?.user_id;
  if (!userId) {
    console.error('Pro e-mail', normalizedEmail, 'nebyl nalezen záznam v body_metrics. Přihlas se nejdřív v aplikaci.');
    process.exit(1);
  }

  const { error: updateErr } = await supabase
    .from('memberships')
    .upsert(
      {
        user_id: userId,
        tier: 'START',
        status: 'trial',
        started_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        trial_ends_at: PAST_DATE,
        notes: 'Test – vypršený trial (set-expired-trial-for-test.js)',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (updateErr) {
    console.error('Chyba při aktualizaci memberships:', updateErr.message);
    process.exit(1);
  }

  console.log('OK: Uživatel', normalizedEmail, '(user_id:', userId, ') má nyní vypršený trial.');
  console.log('Obnov profil v aplikaci – uvidíš banner a Stripe Pricing Table.');
}

run();
