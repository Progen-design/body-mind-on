#!/usr/bin/env node
/**
 * Read-only: ověří OPENAI_API_KEY a lightweight auth check (bez výpisu key).
 *   npm run verify:openai-config
 */
import { loadLocalEnv, envPresent, auditLine } from './audit-utils.mjs';

loadLocalEnv();

console.log('=== OPENAI ===');

if (!envPresent('OPENAI_API_KEY')) {
  auditLine('FAIL', 'OPENAI_API_KEY is missing');
  process.exitCode = 1;
} else {
  auditLine('PASS', 'OPENAI_API_KEY is set');

  const key = process.env.OPENAI_API_KEY;

  try {
    const res = await fetch('https://api.openai.com/v1/models?limit=1', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401 || res.status === 403) {
      auditLine('FAIL', `OpenAI auth rejected (HTTP ${res.status})`);
      process.exitCode = 1;
    } else if (!res.ok) {
      auditLine('WARN', `OpenAI API returned HTTP ${res.status} (non-auth)`);
    } else {
      auditLine('PASS', 'OpenAI API auth OK (models endpoint)');
    }
  } catch (err) {
    const msg = err?.name === 'TimeoutError' ? 'request timed out' : (err?.message || 'network error');
    auditLine('WARN', `OpenAI connectivity check skipped: ${msg}`);
  }
}
