#!/usr/bin/env node
/**
 * Unit checks: coach fallback + quota detection (bez DB).
 *   node scripts/verify-coach-fallback.mjs
 */
import {
  buildCoachFallbackMessage,
  isOpenAIQuotaOrRateLimitError,
} from '../lib/coachFallbackMessage.js';

let failed = 0;

const quotaCases = [
  new Error('429 You exceeded your current quota, please check your plan'),
  { status: 429, message: 'rate_limit_exceeded' },
  { message: 'insufficient_quota for model' },
];
for (const err of quotaCases) {
  if (!isOpenAIQuotaOrRateLimitError(err)) {
    console.log('FAIL quota detect', err);
    failed += 1;
  }
}
if (!isOpenAIQuotaOrRateLimitError(new Error('network timeout'))) {
  /* ok */
} else {
  console.log('FAIL non-quota misclassified');
  failed += 1;
}
console.log(failed ? '' : 'OK quota detection');

const msg = buildCoachFallbackMessage({
  bodyMetrics: { name: 'Jan Novák' },
  userHabits: [{ id: 'hydration', label: 'Pitný režim' }],
  latestPlan: { id: 'plan-1' },
  taskType: 'onboarding_message',
});

if (!msg.message.includes('Jan') || !msg.message.includes('Pitný režim')) {
  console.log('FAIL fallback content');
  failed += 1;
} else {
  console.log('OK fallback message sample:', msg.message.slice(0, 120) + '…');
}

const words = msg.message.split(/\s+/).length;
if (words > 125) {
  console.log('FAIL fallback too long', words);
  failed += 1;
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
