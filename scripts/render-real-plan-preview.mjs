import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { buildWeeklyPlanEmailV2Document } from '../lib/weeklyPlanEmailV2.js';
import { buildWeeklyPlanEmailV4Document } from '../lib/weeklyPlanEmailV4.js';
import { buildWeeklyPlanEmailV5Document } from '../lib/weeklyPlanEmailV5.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(relPath) {
  try {
    const text = readFileSync(join(root, relPath), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch {}
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}
const sb = createClient(url, key);

const planId = process.argv[2];
const versionArg = (process.argv[3] || 'v5').toLowerCase();
if (!planId) {
  console.error('Usage: node render-real-plan-preview.mjs <plan_id> [v2|v4|v5]');
  process.exit(1);
}
const validVersions = ['v2', 'v4', 'v5'];
const version = validVersions.includes(versionArg) ? versionArg : 'v5';

const { data: plan } = await sb
  .from('ai_generated_plans')
  .select('id, user_id, structured_plan_json, valid_from')
  .eq('id', planId)
  .maybeSingle();
if (!plan) {
  console.error('plan not found');
  process.exit(1);
}

const { data: bm } = await sb
  .from('body_metrics')
  .select('*')
  .eq('user_id', plan.user_id)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

const builders = {
  v2: buildWeeklyPlanEmailV2Document,
  v4: buildWeeklyPlanEmailV4Document,
  v5: buildWeeklyPlanEmailV5Document,
};
const builder = builders[version];
const html = builder({
  structuredPlanJson: plan.structured_plan_json,
  bodyMetrics: bm,
  firstName: bm?.name ?? null,
  appBaseUrl: 'https://app.bodyandmindon.cz',
  ctaUrl: 'https://app.bodyandmindon.cz',
  validFrom: plan.valid_from,
});

const out = join(tmpdir(), `body-mind-on-real-plan-${version}-${planId}.html`);
writeFileSync(out, html, 'utf8');
console.log(out);
console.log(`size: ${html.length} bytes`);
console.log(`no placeholders: ${!/\{\{[a-zA-Z_]+\}\}/.test(html)}`);
console.log(`v5 marker: ${html.includes('v5.0')}`);
