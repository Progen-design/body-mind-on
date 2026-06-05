import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const planId = process.argv[2] || '75b4f92c-7f0e-47a0-8bef-2c355251fab1';
for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  break;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: plan } = await sb.from('ai_generated_plans').select('structured_plan_json, valid_from').eq('id', planId).single();
const { data: bm } = await sb.from('body_metrics').select('*').eq('email', 'janprikopa+catalogtest@gmail.com').order('created_at', { ascending: false }).limit(1).maybeSingle();
const { buildWeeklyPlanEmailV8Document } = await import('../lib/weeklyPlanEmailV8.js');
const html = buildWeeklyPlanEmailV8Document({
  structuredPlanJson: plan.structured_plan_json,
  bodyMetrics: bm,
  firstName: 'Catalog',
  loginBlock: '',
  planChangeContext: false,
  appBaseUrl: 'https://app.bodyandmindon.cz',
  validFrom: plan.valid_from,
});
writeFileSync(resolve(process.cwd(), 'scripts/e2e-output/email-preview.html'), html);
const withUrl = (plan.structured_plan_json.days || []).flatMap((d) => d.meals || []).filter((m) => m.recipe?.sourceUrl).length;
console.log('meals with sourceUrl:', withUrl, 'Recept buttons:', (html.match(/Recept →/g) || []).length);
