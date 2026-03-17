#!/usr/bin/env node
/**
 * scripts/query-onboarding-metrics.mjs
 * P1 – Dotaz na onboarding metriky z ai_logs.
 * Vyžaduje: SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY v .env
 *
 * Použití:
 *   node scripts/query-onboarding-metrics.mjs
 *   node scripts/query-onboarding-metrics.mjs --last 24
 *   node scripts/query-onboarding-metrics.mjs --last 7  (hodin)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadEnv();

const lastHours = parseInt(process.argv.find((a) => a.startsWith('--last'))?.split('=')[1] || process.argv[process.argv.indexOf('--last') + 1] || '24', 10) || 24;

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY. Použij .env nebo export.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const since = new Date(Date.now() - lastHours * 60 * 60 * 1000).toISOString();

const { data: rows, error } = await supabase
  .from('ai_logs')
  .select('id, user_id, status, message, payload, created_at')
  .eq('agent_slug', 'onboarding')
  .eq('action', 'registration_complete')
  .gte('created_at', since)
  .order('created_at', { ascending: false })
  .limit(100);

if (error) {
  console.error('Chyba:', error.message);
  process.exit(1);
}

const results = rows || [];
const byResult = { ai_success: 0, fallback_success: 0, failed: 0 };
const times = [];

for (const r of results) {
  const res = r.payload?.onboarding_result ?? 'unknown';
  if (res in byResult) byResult[res]++;
  const ms = r.payload?.time_to_plan_ready_ms;
  if (typeof ms === 'number' && ms > 0) times.push(ms);
}

console.log(`\n=== Onboarding metriky (posledních ${lastHours} h) ===\n`);
console.log('Celkem registrací:', results.length);
console.log('  ai_success:', byResult.ai_success);
console.log('  fallback_success:', byResult.fallback_success);
console.log('  failed:', byResult.failed);
if (times.length > 0) {
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log('  time_to_plan_ready: avg', avg, 'ms, median', median, 'ms');
}
console.log('\nPoslední záznamy:');
for (const r of results.slice(0, 5)) {
  const res = r.payload?.onboarding_result ?? '-';
  const planState = r.payload?.plan_state ?? '-';
  const timeMs = r.payload?.time_to_plan_ready_ms;
  console.log(`  ${r.created_at} | ${res} | plan_state=${planState} | ${timeMs ? timeMs + 'ms' : '-'} | user=${(r.user_id || '').slice(0, 8)}...`);
}
console.log('');
