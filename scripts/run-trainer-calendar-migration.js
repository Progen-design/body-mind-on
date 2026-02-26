/**
 * Spustí migraci 20260221_trainer_calendar_tokens.sql proti Supabase.
 * Vyžaduje v .env: DATABASE_URL (Supabase → Settings → Database → Connection string, např. Session mode URI).
 */
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Chybí DATABASE_URL v .env. V Supabase: Project Settings → Database → Connection string (URI).');
  process.exit(1);
}

const sqlPath = path.join(root, 'supabase', 'migrations', '20260221_trainer_calendar_tokens.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql);
    console.log('Migrace 20260221_trainer_calendar_tokens.sql proběhla úspěšně.');
  } catch (err) {
    console.error('Chyba:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
