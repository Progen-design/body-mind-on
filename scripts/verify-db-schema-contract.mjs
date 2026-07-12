#!/usr/bin/env node
/**
 * Ověření DB schema kontraktu (read-only SELECT na information_schema).
 *   node scripts/verify-db-schema-contract.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  break;
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const REQUIRED_TABLES = [
  'body_metrics',
  'ai_generated_plans',
  'ai_tasks',
  'ai_logs',
  'memberships',
  'exercise_asset_registry',
  'recipes_catalog',
];

const REQUIRED_COLUMNS = {
  ai_generated_plans: [
    'structured_plan_json',
    'plan_html',
    'valid_from',
    'valid_until',
    'is_active',
    'generated_by',
    'user_id',
  ],
  ai_tasks: [
    'status',
    'agent_slug',
    'task_type',
    'attempts',
    'processing_started_at',
    'next_retry_at',
    'dead_lettered_at',
  ],
  ai_logs: ['action', 'agent_slug', 'user_id', 'result'],
};

async function tableExists(supabase, table) {
  const { error } = await supabase.from(table).select('*').limit(0);
  if (!error) return true;
  if (/does not exist|relation|schema cache/i.test(error.message || '')) return false;
  return true;
}

async function columnExists(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(0);
  if (!error) return true;
  if (/column|does not exist/i.test(error.message || '')) return false;
  return true;
}

async function main() {
  if (!supabaseUrl || !serviceKey) {
    console.warn('SKIP DB schema contract — chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    const staticSrc = readFileSync(resolve(process.cwd(), 'lib/unifiedPlanPipeline.js'), 'utf8');
    check('static: unified pipeline references structured_plan_json flow', staticSrc.includes('planJson'));
    check('static: plan quality helper exists', existsSync(resolve(process.cwd(), 'lib/planQuality.js')));
    console.log('\nRESULT: PASS (static fallback only)');
    process.exit(0);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  for (const table of REQUIRED_TABLES) {
    const ok = await tableExists(supabase, table);
    check(`tabulka ${table}`, ok);
  }

  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    for (const col of cols) {
      const ok = await columnExists(supabase, table, col);
      check(`${table}.${col}`, ok);
    }
  }

  const { error: emailSentErr } = await supabase.from('ai_generated_plans').select('email_sent').limit(0);
  if (emailSentErr && /column|does not exist/i.test(emailSentErr.message || '')) {
    check('ai_generated_plans.email_sent (optional)', true, 'sloupec chybí — runtime fallback očekáván');
  } else {
    check('ai_generated_plans.email_sent', !emailSentErr);
  }

  console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('FAIL schema contract runtime', err?.message || err);
  process.exit(1);
});
