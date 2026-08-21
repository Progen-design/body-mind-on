/**
 * Spoonacular daily points budget — 50 pts/day plan, 40 pt hard cap per rolling window.
 */
import { supabaseServer } from '../supabaseServer.js';

/**
 * Cena complexSearch: základ 1 bod + 0,11 bodu za každý VRÁCENÝ výsledek.
 *
 * Ověřeno proti `spoonacular_import_runs`: 35 běhů, nulový rozptyl.
 *   api_results 0 → 1,00   |   1 → 1,11   |   4 → 1,44   |   8 → 1,88
 * Sedí to na 1 + 0,11 × api_results (0,11 = 0,01 za výsledek + 0,10 za
 * addRecipeInformation/addRecipeNutrition, které posíláme u každého dotazu).
 *
 * Konstanta byla 31. 7. 2026 omylem snížena na 0,01 na základě špatně přiřazených
 * dat — deltas 1,00/1,11/1,44/1,88 byly přisouzeny počtům 0/11/44/88, ale skutečné
 * api_results byly 0/1/4/8. Vráceno zpět na 0,11.
 *
 * Odhad se počítá z POŽADOVANÉHO počtu, protože počet vrácených je znám až po volání.
 * Pro number=100 to dává 12,0 bodu — skutečná horní mez, protože víc než `number`
 * výsledků se vrátit nemůže. Podhodnocený odhad by kvótu přečerpal, což je přesně
 * to, čemu má rozpočet bránit.
 */
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
