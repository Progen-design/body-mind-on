#!/usr/bin/env node
/**
 * Read-only agregace AI nákladů z ai_logs (bez PII).
 *   npm run audit:unit-economics
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv, sanitizeOutput } from './audit-utils.mjs';

loadLocalEnv();

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MONTHLY_PRICE_CZK = Number(process.env.AUDIT_MONTHLY_PRICE_CZK || 599);
const USD_CZK = Number(process.env.AUDIT_USD_CZK_RATE || 25);

if (!url || !key) {
  console.error('FAIL missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function avg(nums) {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function max(nums) {
  const valid = nums.filter((n) => Number.isFinite(n));
  return valid.length ? Math.max(...valid) : null;
}

function marginPct(costCzk, plansPerMonth) {
  const cost = costCzk * plansPerMonth;
  if (!Number.isFinite(cost) || MONTHLY_PRICE_CZK <= 0) return null;
  return Number((((MONTHLY_PRICE_CZK - cost) / MONTHLY_PRICE_CZK) * 100).toFixed(1));
}

async function fetchAllAiLogs() {
  /** @type {object[]} */
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('ai_logs')
      .select('duration_ms,input_tokens,output_tokens,estimated_cost_usd,task_id,agent_slug,status')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break;
  }
  return rows;
}

async function main() {
  const logs = await fetchAllAiLogs();
  const warnings = [];

  const durations = logs.map((r) => Number(r.duration_ms)).filter((n) => Number.isFinite(n) && n >= 0);
  const inputTokens = logs.map((r) => Number(r.input_tokens)).filter((n) => Number.isFinite(n) && n >= 0);
  const outputTokens = logs.map((r) => Number(r.output_tokens)).filter((n) => Number.isFinite(n) && n >= 0);
  const costs = logs.map((r) => Number(r.estimated_cost_usd)).filter((n) => Number.isFinite(n) && n >= 0);

  if (!costs.length) {
    warnings.push('estimated_cost_usd missing or zero in all ai_logs rows — margin estimates unavailable');
  }
  if (!inputTokens.length && !outputTokens.length) {
    warnings.push('input_tokens/output_tokens not populated in ai_logs');
  }

  const avgCost = avg(costs);
  const maxCost = max(costs);
  const avgCostCzk = avgCost != null ? Number((avgCost * USD_CZK).toFixed(2)) : null;

  const taskCost = new Map();
  for (const row of logs) {
    const tid = row.task_id;
    const c = Number(row.estimated_cost_usd);
    if (!tid || !Number.isFinite(c)) continue;
    taskCost.set(tid, (taskCost.get(tid) || 0) + c);
  }
  const perTaskCosts = [...taskCost.values()];
  const avgCostPerPlan = avg(perTaskCosts);
  const maxCostPerPlan = max(perTaskCosts);

  const report = {
    ai_runs_total: logs.length,
    avg_duration_ms: durations.length ? Math.round(avg(durations)) : null,
    avg_input_tokens: inputTokens.length ? Math.round(avg(inputTokens)) : null,
    avg_output_tokens: outputTokens.length ? Math.round(avg(outputTokens)) : null,
    total_estimated_cost_usd: costs.length ? Number(costs.reduce((a, b) => a + b, 0).toFixed(4)) : null,
    avg_cost_usd_per_log: avgCost != null ? Number(avgCost.toFixed(6)) : null,
    max_cost_usd_per_log: maxCost != null ? Number(maxCost.toFixed(6)) : null,
    avg_cost_usd_per_task: avgCostPerPlan != null ? Number(avgCostPerPlan.toFixed(6)) : null,
    max_cost_usd_per_task: maxCostPerPlan != null ? Number(maxCostPerPlan.toFixed(6)) : null,
    tasks_with_cost_data: perTaskCosts.length,
    pricing_assumptions: {
      monthly_price_czk: MONTHLY_PRICE_CZK,
      usd_czk_rate: USD_CZK,
    },
    gross_margin_estimate_pct: {
      '1_plan_per_month': marginPct(avgCostCzk ?? 0, 1),
      '4_plans_per_month': marginPct(avgCostCzk ?? 0, 4),
      '8_plans_per_month': marginPct(avgCostCzk ?? 0, 8),
    },
    warnings,
    generated_at: new Date().toISOString(),
  };

  if (warnings.length) {
    console.log('WARN', warnings.join('; '));
  }
  console.log(sanitizeOutput(JSON.stringify(report, null, 2)));
}

main().catch((err) => {
  console.error('FAIL', sanitizeOutput(err?.message || String(err)));
  process.exit(1);
});
