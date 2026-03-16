/**
 * Spustí migraci ai_supporting_documents (tabulka + seed) přes přímé DB připojení.
 * Vyžaduje v .env: DATABASE_URL (Supabase → Settings → Database → Connection string URI).
 */
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i <= 0) return;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Chybí DATABASE_URL v .env. Supabase → Project Settings → Database → Connection string (URI).');
  process.exit(1);
}

const sqlPath = path.join(root, 'supabase', 'migrations', '20260323_ai_supporting_documents_apply.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql);
    console.log('Migrace ai_supporting_documents (tabulka + seed) proběhla úspěšně.');
  } catch (err) {
    console.error('Chyba:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
