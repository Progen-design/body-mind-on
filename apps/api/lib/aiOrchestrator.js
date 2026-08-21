/**
 * lib/aiOrchestrator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AI plan pipeline orchestration. DEPRECATED: Use runUnifiedPlanPipeline from unifiedPlanPipeline.js.
 * runPlanPipeline is a thin wrapper for backward compatibility.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { runUnifiedPlanPipeline } from './unifiedPlanPipeline';
import { loadAgentDocumentsContext } from './loadAgentDocumentsContext';
import { getSharedMemory } from './aiSharedMemory';
import { getAgentConfig } from './getAgentConfig';

/** Pipeline phase names for logging and diagnostics. */
export const PIPELINE_PHASES = [
  'normalize_context',
  'trainer_draft',
  'structure_validation',
  'validators',
  'truth_gate',
  'retry_or_fallback',
  'media_enrichment',
  'persist',
];

/**
 * Build normalized context for the plan pipeline (documents, shared memory).
 * Used when you need context before calling runPlanPipeline (e.g. diagnostics, future extensions).
 *
 * @param {{ user_id?: string | null }} bm - at least user_id for memory/docs
 * @param {string | null} userId
 * @param {object | null} taskContext - task_type, reason, prompt, shared_fact, event_context
 * @returns {Promise<{
 *   supporting_documents: Array<{ title: string, summary: string, key_facts?: string[], source_id?: string }>,
 *   supporting_documents_count: number,
 *   document_titles: string[],
 *   source_ids: string[],
 *   shared_memory: Array<{ type: string, content: string, at: string, from?: string }>,
 *   prompt_source: string | null,
 *   prompt_version: number | null,
 * }>}
 */
export async function buildNormalizedContext(bm, userId, taskContext = null) {
  const uid = userId ?? bm?.user_id ?? null;
  const [docs, shared, agentConfig] = await Promise.all([
    loadAgentDocumentsContext('trainer'),
    uid ? getSharedMemory(uid, 8) : Promise.resolve([]),
    getAgentConfig('trainer'),
  ]);

  const supporting_documents = Array.isArray(docs) ? docs : [];
  return {
    supporting_documents,
    supporting_documents_count: supporting_documents.length,
    document_titles: supporting_documents.map((d) => d.title).filter(Boolean),
    source_ids: supporting_documents.map((d) => d.source_id).filter(Boolean),
    shared_memory: (shared || []).map((r) => ({
      type: r.type,
      content: r.content,
      at: r.created_at,
      from: r.source_agent_slug,
    })),
    prompt_source: agentConfig?.prompt_source ?? null,
    prompt_version: agentConfig?.prompt_version ?? null,
    task_context: taskContext ?? null,
  };
}

/**
 * DEPRECATED: Use runUnifiedPlanPipeline. Thin wrapper for backward compatibility.
 * @param {object} params - body_metrics-like object
 * @returns {Promise<object>} - { html, generation_source, fallback_used, ... } (shape expected by legacy callers)
 */
export async function runPlanPipeline(params) {
  const result = await runUnifiedPlanPipeline({ bm: params, useOpenAI: true });
  if (!result?.ok) {
    throw new Error(result?.error ?? 'Plan generation failed');
  }
  return {
    html: result.planHtml,
    planJson: result.planJson,
    generation_source: result.generation_source ?? 'openai',
    fallback_used: result.generation_source === 'fallback',
    truth_check: null,
  };
}
