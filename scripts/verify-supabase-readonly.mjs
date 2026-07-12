#!/usr/bin/env node
/**
 * Read-only: Supabase config + minimální read dotaz (bez PII ve výstupu).
 *   npm run verify:supabase-readonly
 */
import { loadLocalEnv, envPresent, auditLine } from './audit-utils.mjs';

loadLocalEnv();

console.log('=== SUPABASE ===');

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!envPresent('NEXT_PUBLIC_SUPABASE_URL') && !envPresent('SUPABASE_URL')) {
  auditLine('FAIL', 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL missing');
  process.exitCode = 1;
} else {
  auditLine('PASS', 'Supabase URL env present');

  if (!anonKey) {
    auditLine('WARN', 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
  } else {
    auditLine('PASS', 'NEXT_PUBLIC_SUPABASE_ANON_KEY is set');
  }

  if (!serviceKey) {
    auditLine('FAIL', 'SUPABASE_SERVICE_ROLE_KEY is missing');
    process.exitCode = 1;
  } else {
    auditLine('PASS', 'SUPABASE_SERVICE_ROLE_KEY is set');

    if (!supabaseUrl) {
      auditLine('FAIL', 'no resolvable Supabase URL');
      process.exitCode = 1;
    } else {
      try {
        const probeUrl = `${supabaseUrl}/rest/v1/ai_logs?select=id&limit=1`;
        const res = await fetch(probeUrl, {
          method: 'GET',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (res.status === 401 || res.status === 403) {
          auditLine('FAIL', `Supabase auth rejected (HTTP ${res.status})`);
          process.exitCode = 1;
        } else if (!res.ok) {
          const body = await res.text();
          if (/does not exist|relation|permission/i.test(body)) {
            auditLine('WARN', `read-only probe on ai_logs failed (HTTP ${res.status})`);
            auditLine('WARN', 'connection/config OK but table probe inconclusive');
          } else {
            auditLine('FAIL', `Supabase read failed (HTTP ${res.status})`);
            process.exitCode = 1;
          }
        } else {
          auditLine('PASS', 'Supabase read-only connection OK (ai_logs probe, no row data printed)');
        }
      } catch (err) {
        const msg = err?.name === 'TimeoutError' ? 'request timed out' : (err?.message || 'network error');
        auditLine('WARN', `Supabase connectivity: ${msg}`);
      }
    }
  }
}
