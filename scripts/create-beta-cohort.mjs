#!/usr/bin/env node
/**
 * Create a closed beta cohort.
 * npm run beta:create-cohort -- --code=START-C1 --name="START Closed Beta Cohort 1" --max=5
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { COHORT_CODE_PATTERN, COHORT_STATUSES } from '../lib/betaCohortConstants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v] = arg.slice(2).split('=');
    out[k] = v ?? true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const code = String(args.code || '').trim().toUpperCase();
const name = String(args.name || '').trim();
const max = Number(args.max || 5);
const start = args.start ? String(args.start) : null;
const end = args.end ? String(args.end) : null;
const status = String(args.status || 'recruiting').trim();

if (!COHORT_CODE_PATTERN.test(code)) {
  console.error('FAIL invalid cohort code format');
  process.exit(1);
}
if (!name) {
  console.error('FAIL name required');
  process.exit(1);
}
if (!Number.isFinite(max) || max < 1 || max > 100) {
  console.error('FAIL max must be 1-100');
  process.exit(1);
}
if (!COHORT_STATUSES.includes(status)) {
  console.error('FAIL invalid status');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('FAIL SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await admin.from('beta_cohorts').select('id, code, status').eq('code', code).maybeSingle();
if (existing?.id) {
  console.log(`Cohort already exists: ${existing.code} (${existing.status})`);
  process.exit(0);
}

const row = {
  code,
  name,
  status,
  max_participants: max,
  starts_at: start ? new Date(`${start}T00:00:00+02:00`).toISOString() : null,
  ends_at: end ? new Date(`${end}T23:59:59+02:00`).toISOString() : null,
};

const { error } = await admin.from('beta_cohorts').insert(row);
if (error) {
  console.error('FAIL cohort insert');
  process.exit(1);
}

console.log(`Cohort created: ${code}`);
console.log(`  name: ${name}`);
console.log(`  status: ${status}`);
console.log(`  max_participants: ${max}`);
