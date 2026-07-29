/**
 * Spoonacular daily points budget — 50 pts/day plan, 40 pt hard cap per rolling window.
 */
import { supabaseServer } from '../supabaseServer';

/** Per-request point cost: base 1 + ~0.11 × number (complexSearch with recipe info). */
const REQUEST_COST_BASE = 1;
const REQUEST_COST_PER_RESULT = 0.11;

/** Hard daily cap with reserve (plan limit is 50). */
export const MAX_DAILY_POINTS = 40;

/**
 * @param {number} number
 * @returns {number}
 */
export function estimateSpoonacularRequestCost(number) {
  const n = Math.max(1, Math.floor(Number(number) || 1));
  return REQUEST_COST_BASE + REQUEST_COST_PER_RESULT * n;
}

/**
 * @param {Response} res
 * @returns {number|null}
 */
export function readQuotaLeftFromResponse(res) {
  const raw = res.headers.get('x-api-quota-left') || res.headers.get('X-API-Quota-Left');
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Response} res
 * @returns {number|null}
 */
export function readQuotaUsedFromResponse(res) {
  const raw = res.headers.get('x-api-quota-used') || res.headers.get('X-API-Quota-Used');
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Response} res
 * @returns {number|null}
 */
export function readQuotaRequestCostFromResponse(res) {
  const raw = res.headers.get('x-api-quota-request') || res.headers.get('X-API-Quota-Request');
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Max quota_used reported in spoonacular_import_runs over the last 24 h.
 *
 * @returns {Promise<number>}
 */
export async function getPointsUsedLast24h() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseServer
    .from('spoonacular_import_runs')
    .select('quota_used')
    .gte('started_at', since)
    .not('quota_used', 'is', null);

  if (error) throw new Error(error.message);

  let maxUsed = 0;
  for (const row of data || []) {
    const n = Number(row.quota_used);
    if (Number.isFinite(n) && n > maxUsed) maxUsed = n;
  }
  return maxUsed;
}

/**
 * @param {number} [estimatedCost]
 * @returns {Promise<{ ok: true, used: number, remaining: number } | { ok: false, status: 'budget_exhausted', used: number, remaining: number }>}
 */
export async function checkImportBudget(estimatedCost = estimateSpoonacularRequestCost(100)) {
  const used = await getPointsUsedLast24h();
  const remaining = MAX_DAILY_POINTS - used;
  const cost = Number(estimatedCost) || estimateSpoonacularRequestCost(100);

  if (remaining < cost) {
    return { ok: false, status: 'budget_exhausted', used, remaining };
  }

  return { ok: true, used, remaining };
}
