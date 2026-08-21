/**
 * Spoonacular import run observability — spoonacular_import_runs table.
 */
import { supabaseServer } from '../supabaseServer.js';

/**
 * @param {object} row
 * @returns {Promise<void>}
 */
export async function insertImportRunRow(row) {
  const { error } = await supabaseServer.from('spoonacular_import_runs').insert(row);
  if (error) throw new Error(`spoonacular_import_runs insert failed: ${error.message}`);
}

/**
 * @param {string} runId
 * @param {string} mealType
 * @param {string} querySignature
 * @param {number} offsetUsed
 * @returns {Promise<{ startedAt: string, log: (patch: object) => void, finish: (patch?: object) => Promise<void> }>}
 */
export function createImportRunLogger(runId, mealType, querySignature, offsetUsed) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  /** @type {Record<string, unknown>} */
  let patch = {};

  return {
    startedAt,
    log(extra) {
      patch = { ...patch, ...extra };
    },
    async finish(finalPatch = {}) {
      const merged = { ...patch, ...finalPatch };
      await insertImportRunRow({
        run_id: runId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        meal_type: mealType,
        query_signature: querySignature,
        offset_used: offsetUsed,
        api_status: merged.api_status ?? null,
        api_results: merged.api_results ?? 0,
        candidates: merged.candidates ?? 0,
        inserted: merged.inserted ?? 0,
        skipped_duplicate: merged.skipped_duplicate ?? 0,
        skipped_filter: merged.skipped_filter ?? 0,
        skipped_filter_reasons: merged.skipped_filter_reasons ?? null,
        quota_left: merged.quota_left ?? null,
        quota_used: merged.quota_used ?? null,
        duration_ms: Date.now() - t0,
        error: merged.error ?? null,
      });
    },
  };
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logImportStructured(payload) {
  console.log(JSON.stringify({ source: 'import-spoonacular', ...payload }));
}
