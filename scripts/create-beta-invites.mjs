#!/usr/bin/env node
/**
 * Create beta invite codes for a cohort (plain codes shown once only).
 * npm run beta:create-invites -- --cohort=START-C1 --count=5 --output=.local/beta-start-c1-invites.txt
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadLocalEnv } from './audit-utils.mjs';
import { generateInviteCode, hashInviteCode } from '../lib/betaInviteCrypto.js';

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
const cohortCode = String(args.cohort || '').trim().toUpperCase();
const count = Number(args.count || 0);
const outputPath = args.output ? String(args.output) : null;

if (!cohortCode || !Number.isFinite(count) || count < 1) {
  console.error('FAIL --cohort and --count required');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('FAIL SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: cohort, error: cohortErr } = await admin
  .from('beta_cohorts')
  .select('id, code, max_participants, status')
  .eq('code', cohortCode)
  .maybeSingle();

if (cohortErr || !cohort?.id) {
  console.error('FAIL cohort not found');
  process.exit(1);
}

const { count: invitedCount } = await admin
  .from('beta_participants')
  .select('id', { count: 'exact', head: true })
  .eq('cohort_id', cohort.id);

const { count: registeredCount } = await admin
  .from('beta_participants')
  .select('id', { count: 'exact', head: true })
  .eq('cohort_id', cohort.id)
  .not('user_id', 'is', null);

const existingInvites = invitedCount || 0;
const remainingSlots = Math.max(cohort.max_participants - (registeredCount || 0), 0);
const maxNew = Math.min(count, cohort.max_participants - existingInvites, remainingSlots);

if (maxNew <= 0) {
  console.log(`No new invites created. Existing invites: ${existingInvites}, registered: ${registeredCount || 0}`);
  process.exit(0);
}

const plainCodes = [];
const rows = [];
const startAlias = existingInvites + 1;

for (let i = 0; i < maxNew; i += 1) {
  const plain = generateInviteCode();
  plainCodes.push(plain);
  rows.push({
    cohort_id: cohort.id,
    invite_code_hash: hashInviteCode(plain),
    status: 'invited',
    invited_at: new Date().toISOString(),
    internal_alias: `C1-P${String(startAlias + i).padStart(2, '0')}`,
  });
}

const { error: insErr } = await admin.from('beta_participants').insert(rows);
if (insErr) {
  console.error('FAIL invite insert');
  process.exit(1);
}

console.log(`Invites created: ${rows.length} for cohort ${cohortCode}`);
console.log(`  total invited slots: ${existingInvites + rows.length}/${cohort.max_participants}`);

if (outputPath) {
  const abs = join(ROOT, outputPath);
  mkdirSync(dirname(abs), { recursive: true });
  const lines = rows.map((r, idx) => `${r.internal_alias}\t${plainCodes[idx]}`);
  writeFileSync(abs, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`  export: ${outputPath} (gitignored — do not commit)`);
} else {
  console.log('  plain codes written to stdout (one-time only):');
  for (let i = 0; i < rows.length; i += 1) {
    console.log(`  ${rows[i].internal_alias}: ${plainCodes[i]}`);
  }
}
