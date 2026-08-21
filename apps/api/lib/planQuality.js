/**
 * lib/planQuality.js — observability zápis kvality plánu (neblokující).
 */

import { computePlanQualityMetrics } from './planQualityMetrics.js';
import { writeAILog } from './aiOps.js';
import { canonicalAgentSlug, LEGACY_AGENT_SLUG_TRAINER } from './aiAgentNaming.js';

export { computePlanQualityMetrics } from './planQualityMetrics.js';

/**
 * Neblokující zápis do ai_logs (action plan_quality_event).
 * @param {object} planJson
 * @param {object} [bodyMetrics]
 * @param {{ user_id?: string, generation_source?: string, fallback_used?: boolean, agent_slug?: string }} [opts]
 */
export async function logPlanQualityEvent(planJson, bodyMetrics = {}, opts = {}) {
  try {
    const metrics = computePlanQualityMetrics(planJson, bodyMetrics, opts);
    const legacySlug = opts.agent_slug ?? LEGACY_AGENT_SLUG_TRAINER;
    await writeAILog({
      action: 'plan_quality_event',
      agent_slug: legacySlug,
      user_id: bodyMetrics?.user_id ?? opts.user_id ?? null,
      result: {
        ...metrics,
        canonical_agent_slug: canonicalAgentSlug(legacySlug),
      },
    });
    return metrics;
  } catch {
    return null;
  }
}
