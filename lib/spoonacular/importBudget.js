/**
 * Spoonacular daily points budget — 50 pts/day plan, 40 pt hard cap per rolling window.
 */
import { supabaseServer } from '../supabaseServer';

/**
 * Cena complexSearch: základ 1 bod + 0,01 bodu za každý VRÁCENÝ výsledek.
 *
 * Odvozeno z reálných dat, ne z dokumentace — deltas v `spoonacular_import_runs.quota_used`
 * z 29. 7. 2026 dávají 1,00 / 1,11 / 1,44 / 1,88 bodu, což přesně sedí na 1 + 0,01 × počet
 * vrácených receptů (0, 11, 44, 88). Původní konstanta 0,11 přeceňovala cenu 11× — pro
 * `number=100` odhadovala 12,0 bodu místo skutečných max 2,0.
 *
 * Odhad se počítá z POŽADOVANÉHO počtu, protože počet vrácených je znám až po volání.
 * Je to tedy horní mez: skutečná cena je vždy ≤ odhad, nikdy víc. To je přesně to, co
 * potřebuje závazná rezervace — podhodnocený odhad by kvótu přečerpal.
 */
const REQUEST_COST_BASE = 1;
const REQUEST_COST_PER_RESULT = 0.01;

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
 * Nejvyšší quota_used ohlášená v spoonacular_import_runs OD POSLEDNÍ PŮLNOCI UTC.
 *
 * `quota_used` je Spoonacularův kumulativní DENNÍ čítač, který se nuluje o půlnoci UTC.
 * Klouzavé okno 24 h proto míchalo dva různé kvótové dny: vysoká hodnota ze včerejška
 * dusila dnešní rozpočet ještě dlouho po resetu. Přesně to zabilo běh 30. 7. 2026 03:00 UTC
 * — `40 − 50,56 = −10,56` → budget_exhausted, přestože kvóta se tři hodiny předtím
 * resetovala na plných 50. Okno musí kopírovat hranici resetu, ne posledních 24 h.
 *
 * @returns {Promise<number>}
 */
export async function getPointsUsedToday() {
  const now = new Date();
  const midnightUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
  const { data, error } = await supabaseServer
    .from('spoonacular_import_runs')
    .select('quota_used')
    .gte('started_at', midnightUtc)
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
  const used = await getPointsUsedToday();
  const remaining = MAX_DAILY_POINTS - used;
  const cost = Number(estimatedCost) || estimateSpoonacularRequestCost(100);

  if (remaining < cost) {
    return { ok: false, status: 'budget_exhausted', used, remaining };
  }

  return { ok: true, used, remaining };
}
