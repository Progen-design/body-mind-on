#!/usr/bin/env node
/**
 * Read-only: ověří přítomnost povinných env proměnných (bez hodnot).
 *   npm run verify:env-required
 */
import { loadLocalEnv, envPresent, auditLine } from './audit-utils.mjs';

loadLocalEnv();

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'OPENAI_API_KEY',
  'ADMIN_TOKEN',
  'NEXT_PUBLIC_APP_URL',
  'CRON_SECRET',
  'VERCEL_API_TOKEN',
  'VERCEL_TEAM_ID',
  'VERCEL_PROJECT_NAME',
];

const OPTIONAL = [
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'EMAIL_FROM',
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'OPENAI_ASSISTANT_ID',
];

console.log('=== ENV REQUIRED ===');

let failed = 0;
let warned = 0;

for (const name of REQUIRED) {
  if (envPresent(name)) {
    auditLine('PASS', `${name} is set`);
  } else {
    auditLine('FAIL', `${name} is missing`);
    failed += 1;
  }
}

for (const name of OPTIONAL) {
  if (envPresent(name)) {
    auditLine('PASS', `${name} is set (optional)`);
  } else {
    auditLine('WARN', `${name} is missing (optional)`);
    warned += 1;
  }
}

if (failed > 0) {
  auditLine('FAIL', `${failed} required variable(s) missing`);
  process.exit(1);
}

auditLine('PASS', warned > 0 ? `all required present (${warned} optional missing)` : 'all required present');
process.exit(0);
