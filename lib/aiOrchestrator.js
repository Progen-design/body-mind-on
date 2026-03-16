/**
 * lib/aiOrchestrator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AI plan pipeline orchestration. Single entry point for plan generation.
 *
 * Pipeline phases:
 *   1. Normalize context (body_metrics, shared_memory, supporting_documents)
 *   2. Trainer draft (generatePlan internal: prompt → runAgent trainer → parse → enrich section → inject keys)
 *   3. Structure validation (validatePublishedPlanHtml) → retry or fallback if invalid
 *   4. Nutrition + Training validators (runPlanValidators) → corrected html if any
 *   5. Truth gate (validatePlanTruth: hard = unpublishable, soft = repetitive/weak)
 *   6. Hard fail → 1 retry then deterministic fallback
 *   7. Soft fail → 1 retry with reason then fallback
 *   8. Media enrichment (enrichPlanContent: meals + exercises)
 *   9. Persist (taskExecutors.persistTrainerPlan) + profile ready + email
 *
 * Agents:
 *   - ORCHESTRATOR: this module (runPlanPipeline, buildNormalizedContext)
 *   - TRAINER: generates draft (generatePlan → runAgent('trainer'))
 *   - NUTRITION_VALIDATOR / TRAINING_VALIDATOR: planValidators.runPlanValidators
 *   - MEDIA_ENRICHMENT: enrichPlanContent (meals + exercises, trust metadata)
 *   - COACH: separate flow (taskExecutors.executeCoachTask), does not generate plan
 *   - MEMORY: buildAgentContext (shared_memory, user_ai_memory), loadAgentDocumentsContext
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { generatePlan } from './generatePlan';
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
 * Single entry point for the full plan pipeline.
 * Runs: context → trainer draft → structure check → validators → truth gate → retry/fallback → enrichment → return.
 * Persistence and email are done by the caller (taskExecutors.executeTrainerTask).
 *
 * @param {object} params - same as generatePlan: name, gender, age, height_cm, weight_kg, activity, stress_level, goal, weekly_sessions, workout_days, diet_type, dietary_restrictions, foods_to_avoid, notes, user_id, task_context
 * @returns {Promise<object>} - same shape as generatePlan (html, metrics, enrichment, generation_source, truth_check, diagnostics, prompt_source, prompt_version, supporting_documents_count, document_titles, source_ids, ...)
 */
export async function runPlanPipeline(params) {
  return generatePlan(params);
}
