/**
 * Task type registry: DB-first (ai_task_types) with JS fallback.
 * See docs/AI_ARCHITECTURE_REFACTOR_ANALYSIS.md
 */
import { supabaseServer } from './supabaseServer';

const TRAINER_PLAN_OUTPUT_SCHEMA = {
  ok: 'boolean',
  metrics: {
    bmr: 'number',
    tdee: 'number',
    calories: 'number',
    protein_g: 'number',
    carbs_g: 'number',
    fat_g: 'number',
  },
  html: 'string',
  mindset_tip: 'string?',
  shopping_list: 'string[]?',
};

const COACH_MESSAGE_OUTPUT_SCHEMA = {
  ok: 'boolean',
  message: 'string',
  coaching_plan: {
    weekly_focus: 'string?',
    daily_actions: 'string[]?',
    obstacle_plan: 'string[]?',
    checkin_questions: 'string[]?',
  },
  assumptions: 'string[]?',
};

const CONTENT_DRAFT_OUTPUT_SCHEMA = {
  ok: 'boolean',
  assumptions: 'string[]?',
  payload: 'object',
};

const VALIDATION_OUTPUT_SCHEMA = {
  ok: 'boolean',
  errors: 'string[]',
  suggestions: 'string[]',
  corrected_html: 'string?',
};

const TASK_REGISTRY = {
  trainer: {
    initial_plan: {
      side_effect: 'plan_insert',
      description: 'Create initial user plan',
      output_schema: TRAINER_PLAN_OUTPUT_SCHEMA,
    },
    adjust_plan: {
      side_effect: 'plan_replace_current',
      description: 'Adjust current plan from progress',
      output_schema: TRAINER_PLAN_OUTPUT_SCHEMA,
    },
    reduce_training_load: {
      side_effect: 'plan_replace_current',
      description: 'Reduce training load in current plan',
      output_schema: TRAINER_PLAN_OUTPUT_SCHEMA,
    },
    weekly_plan_update: {
      side_effect: 'plan_insert_next_week',
      description: 'Create next week plan',
      output_schema: TRAINER_PLAN_OUTPUT_SCHEMA,
    },
  },
  coach: {
    onboarding_message: {
      side_effect: 'coach_message_insert',
      description: 'Store onboarding coaching message',
      output_schema: COACH_MESSAGE_OUTPUT_SCHEMA,
    },
    motivation_message: {
      side_effect: 'coach_message_insert',
      description: 'Store motivation coaching message',
      output_schema: COACH_MESSAGE_OUTPUT_SCHEMA,
    },
    recovery_message: {
      side_effect: 'coach_message_insert',
      description: 'Store recovery coaching message',
      output_schema: COACH_MESSAGE_OUTPUT_SCHEMA,
    },
    positive_reinforcement: {
      side_effect: 'coach_message_insert',
      description: 'Store positive reinforcement message',
      output_schema: COACH_MESSAGE_OUTPUT_SCHEMA,
    },
    apple_health_daily_review: {
      side_effect: 'coach_message_insert',
      description: 'Daily Apple Health recovery review from aggregated metrics',
      output_schema: COACH_MESSAGE_OUTPUT_SCHEMA,
    },
  },
  marketing: {
    campaign_brief: {
      side_effect: 'content_draft_insert',
      description: 'Create marketing campaign draft',
      output_schema: CONTENT_DRAFT_OUTPUT_SCHEMA,
    },
  },
  social: {
    social_post: {
      side_effect: 'content_draft_insert',
      description: 'Create social content draft',
      output_schema: CONTENT_DRAFT_OUTPUT_SCHEMA,
    },
  },
  nutrition_validator: {
    validate_plan: {
      side_effect: 'validation_result',
      description: 'Validate plan diet/preferences/shopping list',
      output_schema: VALIDATION_OUTPUT_SCHEMA,
    },
  },
  training_validator: {
    validate_plan: {
      side_effect: 'validation_result',
      description: 'Validate plan training rules/exercises/volume',
      output_schema: VALIDATION_OUTPUT_SCHEMA,
    },
  },
};

/** Sync: JS registry only (backward compat). */
export function getTaskSpec(agentSlug, taskType) {
  return TASK_REGISTRY?.[agentSlug]?.[taskType] ?? null;
}

/** Async: DB first (ai_task_types), then JS fallback. */
export async function getTaskSpecFromDb(agentSlug, taskType) {
  if (!agentSlug || !taskType) return null;
  try {
    const { data, error } = await supabaseServer
      .from('ai_task_types')
      .select('agent_slug, task_type, description, output_schema_json, side_effect_type, enabled')
      .eq('agent_slug', agentSlug)
      .eq('task_type', taskType)
      .eq('enabled', true)
      .maybeSingle();

    if (error || !data) return null;
    return {
      side_effect: data.side_effect_type,
      description: data.description ?? '',
      output_schema: data.output_schema_json ?? null,
      enabled: data.enabled !== false,
    };
  } catch {
    return null;
  }
}

/** Async: DB first, then JS. Returns same shape as getTaskSpec. */
export async function getTaskSpecAsync(agentSlug, taskType) {
  const fromDb = await getTaskSpecFromDb(agentSlug, taskType);
  if (fromDb) return fromDb;
  return getTaskSpec(agentSlug, taskType);
}

/** Sync: for callers that cannot await. */
export function getTaskSchemaHint(agentSlug, taskType) {
  const spec = getTaskSpec(agentSlug, taskType);
  if (!spec) return null;
  return {
    agent_slug: agentSlug,
    task_type: taskType,
    description: spec.description,
    required_side_effect: spec.side_effect,
    output_schema: spec.output_schema,
  };
}

/** Async: DB first, then JS. For use in executors. */
export async function getTaskSchemaHintAsync(agentSlug, taskType) {
  const spec = await getTaskSpecAsync(agentSlug, taskType);
  if (!spec) return null;
  return {
    agent_slug: agentSlug,
    task_type: taskType,
    description: spec.description,
    required_side_effect: spec.side_effect,
    output_schema: spec.output_schema,
  };
}

export function getSupportedTaskTypes(agentSlug) {
  return Object.keys(TASK_REGISTRY?.[agentSlug] ?? {});
}
