/**
 * Jedna vstupní brána: aplikuje ai_supporting_documents (tabulka + seed).
 * Zkusí v pořadí: SUPABASE_PAT (API) → DATABASE_URL (pg). Stačí mít jeden z nich v .env.
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const p = join(root, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnv();

const PROJECT_REF = 'ipfyavvmmxmsjupmfnes';
const MIGRATION_FILE = join(__dirname, '../supabase/migrations/20260323_ai_supporting_documents_apply.sql');

function runViaApi(pat) {
  return new Promise((resolve, reject) => {
    const sql = readFileSync(MIGRATION_FILE, 'utf8');
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`API ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function runViaDb(url) {
  const { Client } = await import('pg');
  const sql = readFileSync(MIGRATION_FILE, 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
}

async function main() {
  const pat = process.env.SUPABASE_PAT;
  const dbUrl = process.env.DATABASE_URL;

  if (pat) {
    console.log('Používám SUPABASE_PAT (Supabase API)...');
    try {
      await runViaApi(pat);
      console.log('Migrace ai_supporting_documents dokončena (via API).');
      return;
    } catch (e) {
      console.warn('API selhalo:', e.message);
      if (!dbUrl) {
        console.error('DATABASE_URL v .env chybí. Přidej ho nebo spusť SQL v Supabase SQL Editoru.');
        process.exit(1);
      }
    }
  }

  if (dbUrl) {
    console.log('Používám DATABASE_URL (přímé připojení)...');
    try {
      await runViaDb(dbUrl);
      console.log('Migrace ai_supporting_documents dokončena (via pg).');
      return;
    } catch (e) {
      console.error('Připojení k DB selhalo:', e.message);
      process.exit(1);
    }
  }

  console.error('V .env chybí SUPABASE_PAT i DATABASE_URL.');
  console.error('  SUPABASE_PAT: https://supabase.com/dashboard/account/tokens');
  console.error('  DATABASE_URL: Supabase → Connect to your project → Connection string (URI)');
  console.error('Nebo spusť SQL z: supabase/migrations/20260323_ai_supporting_documents_apply.sql v SQL Editoru.');
  process.exit(1);
}

main();
