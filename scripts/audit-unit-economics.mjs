#!/usr/bin/env node
/**
 * Read-only agregace AI nákladů (bez PII).
 *   npm run audit:unit-economics
 *
 * PROMPT_NAKLADY_AI.md (2026-09-18) bod F — rozšířeno o rozpad podle
 * `purpose` za 7 a 30 dní z `ai_runs`, seřazený podle ceny.
 *
 * `ai_runs` je od téhle chvíle JEDINÝ zdroj skutečné ceny — `volejModel()`
 * (lib/openai.js) tam zapisuje účtenku za KAŽDÉ volání modelu, bez ohledu
 * na to, jestli šlo o generátor receptů nebo o agenta (TED, kouč, plán).
 * `ai_logs.estimated_cost_usd` je od stejné chvíle záměrně nulované u
 * volání, která už mají účtenku v `ai_runs` (`lib/runAgent.js`) — jinak by
 * `openai_daily_usage` (pohled nad ai_runs + ai_logs) sečetla totéž volání
 * dvakrát. Sekce „Podle účelu" níž proto čte `ai_runs`, ne `ai_logs`.
 *
 * Sekce „Podle úkolu" (marže na plán) zůstává nad `ai_logs.task_id` — `ai_runs`
 * task_id nemá (jen `recipe_id`), takže se z něj tahle konkrétní vazba
 * zatím reprodukovat nedá. Necháno jako samostatný, jasně označený nález.
 *
 * PROMPT_NAKLADY_AI_DODATEK.md (2026-09-18) — první verze týhle sekce sčítala
 * `ai_runs.cost_usd` přes VŠECHNY purposy, včetně `recipe_generator_beh`
 * (souhrnný řádek za běh generátoru, cenu nese už `recipe_generation`).
 * Report tím hlásil $32,05 za 30 dní místo skutečných $19,04 — 68% nad
 * skutečnost, přesně ten dvojí součet, který `openai_daily_usage`
 * (migrace 20260828100000) už jednou řešila filtrem `purpose IS DISTINCT
 * FROM 'recipe_generator_beh'`. Tenhle soubor teď používá stejné pravidlo
 * přes `sectiCenuBezAgregaci()`/`AGREGACNI_PURPOSY` z lib/openai.js — jedno
 * místo pravdy, ne zapamatovaný filtr na dvou místech zvlášť.
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv, sanitizeOutput } from './audit-utils.mjs';
import { AGREGACNI_PURPOSY, jeAgregacniPurpose, sectiCenuBezAgregaci } from '../lib/openai.js';

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

async function fetchAll(table, select, extra = (q) => q) {
  /** @type {object[]} */
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select).order('created_at', { ascending: false });
    q = extra(q);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break;
  }
  return rows;
}

/**
 * Rozpad `ai_runs` podle `purpose` v daném okně — počet volání, tokeny,
 * cena, průměr na volání, podíl na celkové ceně okna. Seřazeno podle ceny
 * sestupně, ať je hned vidět, kde peníze tečou nejvíc.
 *
 * Agregační purposy (AGREGACNI_PURPOSY — souhrnné/diagnostické řádky, ne
 * jednotlivá volání) se do rozpadu ani do součtu NEPOČÍTAJÍ — jejich cenu
 * už nesou řádky pod skutečným `purpose` volání. Kolik jich bylo vyloučeno
 * je viditelné v `vyloucenych_agregacnich_radku`, ne tiše schované.
 *
 * @param {object[]} runs
 * @param {number} sinceDays
 */
function rozpadPodleUcelu(runs, sinceDays) {
  const hranice = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const vOkne = runs.filter((r) => new Date(r.created_at).getTime() >= hranice);

  const { celkemUsd, pocetVyloucenychAgregacnich, pouziteRadky } = sectiCenuBezAgregaci(vOkne);

  const podleUcelu = new Map();
  for (const r of pouziteRadky) {
    const ucel = r.purpose || '(bez purpose)';
    const zaznam = podleUcelu.get(ucel) || { volani: 0, tokeny_vstup: 0, tokeny_vystup: 0, cena_usd: 0, chyby: 0 };
    zaznam.volani += 1;
    zaznam.tokeny_vstup += Number(r.input_tokens) || 0;
    zaznam.tokeny_vystup += Number(r.output_tokens) || 0;
    zaznam.cena_usd += Number(r.cost_usd) || 0;
    if (r.error) zaznam.chyby += 1;
    podleUcelu.set(ucel, zaznam);
  }

  const radky = [...podleUcelu.entries()]
    .map(([purpose, z]) => ({
      purpose,
      volani: z.volani,
      tokeny_vstup: z.tokeny_vstup,
      tokeny_vystup: z.tokeny_vystup,
      cena_usd: Number(z.cena_usd.toFixed(4)),
      prumerna_cena_usd_za_volani: z.volani ? Number((z.cena_usd / z.volani).toFixed(6)) : 0,
      podil_na_celku_pct: celkemUsd > 0 ? Number(((z.cena_usd / celkemUsd) * 100).toFixed(1)) : 0,
      chyby: z.chyby,
    }))
    .sort((a, b) => b.cena_usd - a.cena_usd);

  return {
    okno_dni: sinceDays,
    celkem_volani: pouziteRadky.length,
    celkem_cena_usd: Number(celkemUsd.toFixed(4)),
    vyloucenych_agregacnich_radku: pocetVyloucenychAgregacnich,
    podle_ucelu: radky,
  };
}

async function main() {
  const logs = await fetchAll('ai_logs', 'duration_ms,input_tokens,output_tokens,estimated_cost_usd,task_id,agent_slug,status');
  // 30 dní stačí s rezervou na 7denní i 30denní okno; created_at index na
  // ai_runs (purpose, created_at) dělá tenhle filtr levným.
  const runs = await fetchAll('ai_runs', 'purpose,model,input_tokens,output_tokens,cost_usd,error,created_at', (q) =>
    q.gte('created_at', new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString())
  );

  const warnings = [];

  // --- Podle úkolu (marže na plán) — beze změny, čte ai_logs.task_id -------
  const durations = logs.map((r) => Number(r.duration_ms)).filter((n) => Number.isFinite(n) && n >= 0);
  const taskCost = new Map();
  for (const row of logs) {
    const tid = row.task_id;
    const c = Number(row.estimated_cost_usd);
    if (!tid || !Number.isFinite(c) || c <= 0) continue;
    taskCost.set(tid, (taskCost.get(tid) || 0) + c);
  }
  const perTaskCosts = [...taskCost.values()];
  const avgCostPerPlan = avg(perTaskCosts);
  const maxCostPerPlan = max(perTaskCosts);
  if (!perTaskCosts.length) {
    warnings.push(
      'žádný ai_logs řádek nemá zároveň task_id i nenulovou estimated_cost_usd — marže na úkol se nedá spočítat. ' +
      'ai_runs (autoritativní zdroj ceny od PROMPT_NAKLADY_AI.md) task_id nemá, jen recipe_id; ' +
      'propojení na task_id by chtělo buď sloupec navíc, nebo dohledání přes ai_tasks.'
    );
  }
  const avgCostCzk = avgCostPerPlan != null ? Number((avgCostPerPlan * USD_CZK).toFixed(2)) : null;

  // --- Podle účelu (7d / 30d) — nové, čte ai_runs.cost_usd ------------------
  if (!runs.length) {
    warnings.push('žádné řádky v ai_runs za posledních 31 dní — buď se nic nevolalo, nebo volejModel() ještě neběžel dost dlouho.');
  }

  // --- Historické agregační řádky se starou (nenulovou) cenou ---------------
  // PROMPT_NAKLADY_AI_DODATEK.md bod 2/výstup: "kolik řádků recipe_generator_beh
  // nese cost_usd (historie)". Celá historie, ne jen 31denní okno výš —
  // řádky z doby před opravou zápisu (lib/recipeGeneratorRun.js) mají cenu
  // dál, needitujeme je, jen se počítají.
  let historickychSCenou = 0;
  for (const purpose of AGREGACNI_PURPOSY) {
    const { count, error } = await supabase
      .from('ai_runs')
      .select('id', { count: 'exact', head: true })
      .eq('purpose', purpose)
      .not('cost_usd', 'is', null)
      .neq('cost_usd', 0);
    if (!error) historickychSCenou += count || 0;
  }

  const report = {
    agregacni_purposy: {
      pozn: 'purposy vyloučené ze všech součtů cen (viz lib/openai.js AGREGACNI_PURPOSY) — souhrnné/diagnostické řádky, ne jednotlivá volání.',
      seznam: AGREGACNI_PURPOSY,
      historickych_radku_s_nenulovou_cenou: historickychSCenou,
    },
    podle_uctu: {
      pozn: 'okno 7 a 30 dní z ai_runs.purpose — autoritativní cena po PROMPT_NAKLADY_AI.md, agregační purposy vyloučeny.',
      poslednich_7_dni: rozpadPodleUcelu(runs, 7),
      poslednich_30_dni: rozpadPodleUcelu(runs, 30),
    },
    podle_ukolu: {
      pozn: 'marže na plán z ai_logs.task_id — samostatný, užší zdroj (viz warnings, pokud je prázdný).',
      avg_duration_ms: durations.length ? Math.round(avg(durations)) : null,
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
