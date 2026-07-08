#!/usr/bin/env node
/**
 * Unit checks: coach fallback resilience + error sanitization (bez DB).
 *   node scripts/verify-coach-fallback.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildCoachFallbackMessage,
  getOpenAICoachFallbackReason,
  isOpenAIAuthError,
  isOpenAICoachFallbackError,
  isOpenAIQuotaOrRateLimitError,
} from '../lib/coachFallbackMessage.js';
import { sanitizeErrorMessage } from '../lib/safeLog.js';

let failed = 0;
function check(label, ok) {
  if (ok) console.log(`OK ${label}`);
  else {
    console.log(`FAIL ${label}`);
    failed += 1;
  }
}

const quotaCases = [
  new Error('429 You exceeded your current quota, please check your plan'),
  { status: 429, message: 'rate_limit_exceeded' },
  { message: 'insufficient_quota for model' },
];
for (const err of quotaCases) {
  check('quota detect', isOpenAIQuotaOrRateLimitError(err));
  check('coach fallback for quota', isOpenAICoachFallbackError(err));
}

const authCases = [
  new Error('401 Incorrect API key provided: sk-proj-abc123xyz. You can find your API key at https://platform.openai.com/account/api-keys.'),
  { status: 401, message: 'Incorrect API key provided' },
  { status: 403, message: 'permission denied' },
  { message: 'invalid_api_key' },
];
for (const err of authCases) {
  check('auth detect', isOpenAIAuthError(err));
  check('coach fallback for auth', isOpenAICoachFallbackError(err));
}

check('non-quota not misclassified', !isOpenAIQuotaOrRateLimitError(new Error('network timeout')));
check('non-auth not misclassified', !isOpenAIAuthError(new Error('network timeout')));
check('non-openai not coach fallback', !isOpenAICoachFallbackError(new Error('network timeout')));

check(
  'auth fallback reason',
  getOpenAICoachFallbackReason({ status: 401, message: 'Incorrect API key' }) === 'openai_auth_error'
);
check(
  'quota fallback reason',
  getOpenAICoachFallbackReason(new Error('429 quota exceeded')) === 'openai_quota_or_rate_limit'
);

const msg = buildCoachFallbackMessage({
  bodyMetrics: { name: 'Jan Novák' },
  userHabits: [{ id: 'hydration', label: 'Pitný režim' }],
  latestPlan: { id: 'plan-1' },
  taskType: 'onboarding_message',
});

check('fallback content has name', msg.message.includes('Jan'));
check('fallback content has habit', msg.message.includes('Pitný režim'));
check('fallback assumptions generic', msg.assumptions[0].includes('quota/auth'));

const words = msg.message.split(/\s+/).length;
check('fallback length <= 125 words', words <= 125);

const dirty = '401 Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890jdUA.';
const clean = sanitizeErrorMessage(dirty);
check('sanitize strips sk-proj key', !clean.includes('sk-proj-abcdefghijklmnopqrstuvwxyz'));
check('sanitize keeps error type', clean.includes('401 Incorrect API key'));
check('sanitize redacts marker', clean.includes('sk-[REDACTED]'));

const taskExecutors = readFileSync(resolve(process.cwd(), 'lib/taskExecutors.js'), 'utf8');
check('executeCoachTask uses isOpenAICoachFallbackError', taskExecutors.includes('isOpenAICoachFallbackError'));
check('executeCoachTask uses getOpenAICoachFallbackReason', taskExecutors.includes('getOpenAICoachFallbackReason'));

const aiScheduler = readFileSync(resolve(process.cwd(), 'lib/aiScheduler.js'), 'utf8');
check('aiScheduler sanitizes errors', aiScheduler.includes('sanitizeErrorMessage'));

const aiOps = readFileSync(resolve(process.cwd(), 'lib/aiOps.js'), 'utf8');
check('writeAILog sanitizes message', aiOps.includes('sanitizeErrorMessage'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
