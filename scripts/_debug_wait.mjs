import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env.preview.local', '.env.preview', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const DEV_URL = process.env.SUPABASE_DEV_URL || 'https://qfufvsyhlbximanxayci.supabase.co';
const DEV_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
console.log('DEV_URL', DEV_URL);
console.log('KEY role', JSON.parse(Buffer.from(DEV_KEY.split('.')[1], 'base64url')).role);
const devSb = createClient(DEV_URL, DEV_KEY, { auth: { persistSession: false } });
const email = process.argv[2] || 'p0-preview-1780786223865@example.com';
const uid = process.argv[3] || 'ddb7a43b-1a6b-4307-8429-52709436ad83';
const { data, error } = await devSb.from('body_metrics').select('user_id, email').eq('email', email).maybeSingle();
console.log('body_metrics', { data, error });
const { data: m, error: mErr } = await devSb.from('memberships').select('tier, status').eq('user_id', uid).maybeSingle();
console.log('membership', { m, mErr });
