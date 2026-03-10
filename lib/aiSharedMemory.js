/**
 * lib/aiSharedMemory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared cross-agent memory helpers.
 *
 * MEMORY MODEL:
 *   Agent-specific memory:
 *     memory_type does NOT start with "shared_"
 *     filtered by agent_slug
 *     e.g. "coach_onboarding_message", "trainer_plan_summary"
 *
 *   Shared cross-agent memory:
 *     memory_type starts with "shared_"
 *     visible to trainer and coach regardless of agent_slug
 *     e.g. "shared_recovery_priority", "shared_low_adherence_pattern"
 *
 * Defined shared memory types (write these only with grounded evidence):
 *   shared_recovery_priority       – recovery is needed (from recovery_message task context)
 *   shared_low_adherence_pattern   – user shows low adherence (from motivation_message task context)
 *   shared_plan_simplicity_needed  – plan should be simplified (from motivation_message context)
 *   shared_meal_preference         – explicit meal preference derived from profile/context
 *   shared_training_limitation     – avoid certain exercises (explicit from profile/context)
 *   shared_good_progress           – user is making good progress (from positive_reinforcement context)
 *
 * IMPORTANT:
 *   Never write a shared fact without a grounded reason (task type, event, or structured output).
 *   Do NOT write speculative or hallucinated facts.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabaseServer } from './supabaseServer';

const SHARED_PREFIX = 'shared_';
const MAX_SHARED_FACTS_AGE_DAYS = 30;

function isMissingSchemaError(msg) {
  return /does not exist|neexistuje|relation .* does not exist|column .* does not exist/i.test(msg || '');
}

/**
 * Load shared cross-agent memory facts for a user.
 * Returns all memory_type starting with "shared_", most recent first.
 *
 * @param {string} userId
 * @param {number} limit  Max facts to return (default 10)
 * @returns {Promise<Array<{ type: string, content: string, created_at: string, source_agent_slug: string|null }>>}
 */
export async function getSharedMemory(userId, limit = 10) {
  if (!userId) return [];
  try {
    const cutoff = new Date(Date.now() - MAX_SHARED_FACTS_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseServer
      .from('user_ai_memory')
      .select('memory_type, content, created_at, source_agent_slug')
      .eq('user_id', userId)
      .ilike('memory_type', `${SHARED_PREFIX}%`)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingSchemaError(error.message)) return [];
      console.warn('[getSharedMemory] error:', error.message);
      return [];
    }

    return (data ?? []).map((r) => ({
      type: r.memory_type,
      content: r.content,
      created_at: r.created_at,
      source_agent_slug: r.source_agent_slug ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Load agent-specific (non-shared) memory for a given agent.
 * Excludes entries with memory_type starting with "shared_".
 *
 * @param {string} userId
 * @param {string} agentSlug
 * @param {number} limit
 * @returns {Promise<Array<{ type: string, content: string, created_at: string }>>}
 */
export async function getAgentSpecificMemory(userId, agentSlug, limit = 10) {
  if (!userId || !agentSlug) return [];
  try {
    const { data, error } = await supabaseServer
      .from('user_ai_memory')
      .select('memory_type, content, created_at')
      .eq('user_id', userId)
      .eq('agent_slug', agentSlug)
      .not('memory_type', 'ilike', `${SHARED_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingSchemaError(error.message)) return [];
      console.warn('[getAgentSpecificMemory] error:', error.message);
      return [];
    }

    return (data ?? []).map((r) => ({
      type: r.memory_type,
      content: r.content,
      created_at: r.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Write a shared cross-agent memory fact.
 * Upserts by (user_id, memory_type) to prevent duplication per fact type.
 *
 * IMPORTANT: Only call this when fact is grounded in actual task context, event,
 * or structured AI output. Do NOT write speculative facts.
 *
 * @param {{ userId: string, memoryType: string, content: string, sourceAgentSlug?: string }} opts
 */
export async function writeSharedMemoryFact({ userId, memoryType, content, sourceAgentSlug = null }) {
  if (!userId || !memoryType || !content) return;
  if (!memoryType.startsWith(SHARED_PREFIX)) {
    console.warn(`[writeSharedMemoryFact] memoryType must start with "shared_", got: ${memoryType}`);
    return;
  }

  const now = new Date().toISOString();
  try {
    // Try upsert with source_agent_slug (column added in migration 20260322)
    const { error } = await supabaseServer
      .from('user_ai_memory')
      .upsert(
        {
          user_id: userId,
          agent_slug: sourceAgentSlug ?? 'system',
          memory_type: memoryType,
          content,
          source_agent_slug: sourceAgentSlug,
          created_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id,memory_type' }
      );

    if (error) {
      if (isMissingSchemaError(error.message)) {
        // Fall back without source_agent_slug if column doesn't exist yet
        await supabaseServer
          .from('user_ai_memory')
          .upsert(
            {
              user_id: userId,
              agent_slug: sourceAgentSlug ?? 'system',
              memory_type: memoryType,
              content,
              created_at: now,
              updated_at: now,
            },
            { onConflict: 'user_id,memory_type' }
          );
      } else {
        console.warn('[writeSharedMemoryFact] write failed:', error.message);
      }
    }
  } catch (e) {
    console.warn('[writeSharedMemoryFact] exception:', e?.message);
  }
}
