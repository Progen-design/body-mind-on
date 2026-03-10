/**
 * Applies 20260321_trusted_asset_resolution.sql to Supabase production via Management API.
 * Usage: node scripts/run-migration-v3.mjs <SUPABASE_PAT>
 * Get PAT at: https://supabase.com/dashboard/account/tokens
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_REF = 'ipfyavvmmxmsjupmfnes';
const MIGRATION_FILE = join(__dirname, '../supabase/migrations/20260321_trusted_asset_resolution.sql');

const pat = process.argv[2];
if (!pat) {
  console.error('Usage: node scripts/run-migration-v3.mjs <SUPABASE_PAT>');
  console.error('Get PAT at: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const sql = readFileSync(MIGRATION_FILE, 'utf8');

function callManagementApi(pat, projectRef, query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, data: JSON.parse(data || '{}') });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log('📦 Migration: 20260321_trusted_asset_resolution.sql');
  console.log('🔗 Project:', PROJECT_REF);
  console.log('📝 SQL length:', sql.length, 'chars\n');

  try {
    const result = await callManagementApi(pat, PROJECT_REF, sql);
    console.log('✅ Migration applied successfully!');
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

run();
