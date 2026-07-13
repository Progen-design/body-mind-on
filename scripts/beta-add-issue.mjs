#!/usr/bin/env node
/**
 * Add a beta issue with redacted evidence.
 * npm run beta:add-issue -- --cohort=START-C1 --participant=C1-P01 --title="..." --category=onboarding --severity=medium
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES } from '../lib/betaCohortConstants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) out[arg.slice(2)] = true;
    else out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function redactEvidence(text) {
  let s = String(text || '').slice(0, 1500);
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  s = s.replace(/\+?\d[\d\s\-()]{7,}\d/g, '[phone]');
  s = s.replace(/token=[A-Za-z0-9._-]+/gi, 'token=[redacted]');
  s = s.replace(/access_token=[A-Za-z0-9._-]+/gi, 'access_token=[redacted]');
  return s;
}

const args = parseArgs(process.argv.slice(2));
const cohortCode = String(args.cohort || '').trim().toUpperCase();
const alias = args.participant ? String(args.participant).trim() : null;
const title = String(args.title || '').trim();
const category = String(args.category || '').trim();
const severity = String(args.severity || '').trim();
const step = args.step ? String(args.step).slice(0, 120) : null;
const evidence = args.evidence ? redactEvidence(args.evidence) : null;

if (!cohortCode || !title || !category || !severity) {
  console.error('FAIL --cohort --title --category --severity required');
  process.exit(1);
}
if (!ISSUE_CATEGORIES.includes(category)) {
  console.error('FAIL invalid category');
  process.exit(1);
}
if (!ISSUE_SEVERITIES.includes(severity)) {
  console.error('FAIL invalid severity');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('FAIL SUPABASE env required');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: cohort } = await admin.from('beta_cohorts').select('id').eq('code', cohortCode).maybeSingle();
if (!cohort?.id) {
  console.error('FAIL cohort not found');
  process.exit(1);
}

let participantId = null;
if (alias) {
  const { data: participant } = await admin
    .from('beta_participants')
    .select('id')
    .eq('cohort_id', cohort.id)
    .eq('internal_alias', alias)
    .maybeSingle();
  participantId = participant?.id || null;
}

const { data: inserted, error } = await admin.from('beta_issues').insert({
  cohort_id: cohort.id,
  participant_id: participantId,
  title: title.slice(0, 200),
  category,
  severity,
  status: 'open',
  evidence,
  affected_step: step,
}).select('id').single();

if (error) {
  console.error('FAIL issue insert');
  process.exit(1);
}

console.log(`Issue created: ${inserted.id}`);
console.log(`  cohort: ${cohortCode}`);
console.log(`  participant: ${alias || 'n/a'}`);
console.log(`  severity: ${severity}`);
console.log(`  category: ${category}`);
