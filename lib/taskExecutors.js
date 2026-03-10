/**
 * lib/taskExecutors.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CENTRAL DOMAIN EXECUTION LAYER
 *
 * This is the single authoritative dispatcher for all AI task execution.
 * Every AI agent task flows through executeAITask(task) in this file.
 *
 * Architecture:
 *   ai_tasks → scheduler → executeAITask → [trainer|coach|marketing|social|validator]
 *            → real domain outcome stored in DB
 *            → structured result returned to scheduler
 *
 * Result shapes (always include outcome_type):
 *   trainer   → { outcome_type: "plan_generated", plan_id, valid_from, valid_until, email_sent, summary }
 *   coach     → { outcome_type: "message_generated", message_id, summary }
 *   marketing → { outcome_type: "draft_generated", draft_id, agent_slug, summary }
 *   social    → { outcome_type: "draft_generated", draft_id, agent_slug, summary }
 *   validator → { outcome_type: "validation_result", validation_ok, errors, corrected_html }
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabaseServer } from './supabaseServer';
import { runAgent } from './runAgent';
import { generatePlan, getNextPlanRangeFromCurrentPlan, getNextWeekRange } from './generatePlan';
import { getTaskSchemaHintAsync, getTaskSpecAsync } from './aiTaskRegistry';
import { sendPlanEmail } from './mail';
import { getAgentConfig } from './getAgentConfig';
import { writeAILog } from './aiOps';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function isMissingSchemaError(message) {
  return /does not exist|neexistuje|relation .* does not exist|column .* does not exist/i.test(message || '');
}

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function buildPlanType(goal) {
  if (goal === 'redukce') return 'redukce';
  if (goal === 'nabirani_svaly') return 'nabirani';
  return 'udrzovani';
}

function toJsonObject(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return null;
  const trimmed = rawContent.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch { return null; }
}

function buildStoredMacros(bm, parsed) {
  const weight = asNum(bm?.weight_kg) || 70;
  const kc = asNum(parsed?.metrics?.calories) || asNum(bm?.calories_target) || 2200;
  const protein = asNum(parsed?.metrics?.protein_g) || Math.round(weight * 1.8);
  const fat = asNum(parsed?.metrics?.fat_g) || Math.round((kc * 0.25) / 9);
  const carbs = asNum(parsed?.metrics?.carbs_g) || Math.round((kc - protein * 4 - fat * 9) / 4);
  return {
    calories: Math.round(kc / 50) * 50,
    protein_g: protein,
    fat_g: fat,
    carbs_g: carbs,
  };
}

function buildCoachTitle(taskType) {
  const titles = {
    onboarding_message: 'Uvítání do programu',
    motivation_message: 'Motivace na další dny',
    recovery_message: 'Doporučení k regeneraci',
    positive_reinforcement: 'Pochvala za progres',
  };
  return titles[taskType] || 'Koučovací zpráva';
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loaders
// ─────────────────────────────────────────────────────────────────────────────

async function loadLatestBodyMetrics(userId) {
  const { data, error } = await supabaseServer
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load body_metrics: ${error.message}`);
  if (!data) throw new Error('No body_metrics for user');
  return data;
}

async function loadLatestPlan(userId) {
  const { data, error } = await supabaseServer
    .from('ai_generated_plans')
    .select('id, user_id, valid_from, valid_until, is_active, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load current plan: ${error.message}`);
  return data ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trainer: plan validators
// ─────────────────────────────────────────────────────────────────────────────

async function runPlanValidators(planHtml, bm, userId) {
  let htmlToPublish = planHtml || '';
  let nutritionOk = true;
  let trainingOk = true;
  const errors = [];

  const [nutConfig, trainConfig] = await Promise.all([
    getAgentConfig('nutrition_validator'),
    getAgentConfig('training_validator'),
  ]);

  if (nutConfig.enabled && planHtml) {
    try {
      const schemaHint = await getTaskSchemaHintAsync('nutrition_validator', 'validate_plan');
      const result = await runAgent('nutrition_validator', {
        userId: userId ?? null,
        input: {
          plan_html: planHtml,
          body_metrics: bm ? { diet_type: bm.diet_type, dietary_restrictions: bm.dietary_restrictions, foods_to_avoid: bm.foods_to_avoid } : null,
          task_contract: schemaHint,
          task_type: 'validate_plan',
        },
        taskType: 'validate_plan',
      });
      const parsed = result.parsedContent || toJsonObject(result.rawContent) || {};
      nutritionOk = parsed.ok === true;
      if (!nutritionOk && Array.isArray(parsed.errors)) errors.push(...parsed.errors.map((e) => `[nutrition] ${e}`));
      if (parsed.corrected_html) htmlToPublish = parsed.corrected_html;
    } catch (e) {
      nutritionOk = false;
      errors.push(`[nutrition] ${e?.message || 'Validator error'}`);
    }
  }

  if (trainConfig.enabled && planHtml) {
    try {
      const schemaHint = await getTaskSchemaHintAsync('training_validator', 'validate_plan');
      const result = await runAgent('training_validator', {
        userId: userId ?? null,
        input: {
          plan_html: htmlToPublish,
          body_metrics: bm ? { goal: bm.goal, workout_days: bm.workout_days } : null,
          task_contract: schemaHint,
          task_type: 'validate_plan',
        },
        taskType: 'validate_plan',
      });
      const parsed = result.parsedContent || toJsonObject(result.rawContent) || {};
      trainingOk = parsed.ok === true;
      if (!trainingOk && Array.isArray(parsed.errors)) errors.push(...parsed.errors.map((e) => `[training] ${e}`));
      if (parsed.corrected_html) htmlToPublish = parsed.corrected_html;
    } catch (e) {
      trainingOk = false;
      errors.push(`[training] ${e?.message || 'Validator error'}`);
    }
  }

  const validationWarning = (!nutritionOk || !trainingOk) && (nutConfig.enabled || trainConfig.enabled)
    ? errors.length ? errors.join('; ') : 'Validation did not pass'
    : null;

  return { nutritionOk, trainingOk, htmlToPublish, validationWarning };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trainer: persist plan
// ─────────────────────────────────────────────────────────────────────────────

async function persistTrainerPlan({ userId, bm, generated, taskType, latestPlan }) {
  const planHtml = generated?.html;
  if (!planHtml) throw new Error('Trainer plan generation returned empty html');

  const macros = buildStoredMacros(bm, generated);
  const nowIso = new Date().toISOString();
  const planType = buildPlanType(bm?.goal);

  if (taskType === 'adjust_plan' || taskType === 'reduce_training_load') {
    const updateTarget = latestPlan?.id ?? null;
    if (updateTarget) {
      const { error } = await supabaseServer.from('ai_generated_plans').update({
        plan_type: planType, plan_html: planHtml,
        daily_calories: macros.calories,
        macros: { protein_g: macros.protein_g, fat_g: macros.fat_g, carbs_g: macros.carbs_g },
        generated_by: `ai-task:${taskType}`,
        generation_prompt: `Autonomous trainer task ${taskType}`,
        user_context: bm, is_active: true,
      }).eq('id', updateTarget);
      if (error) throw new Error(`Failed to update plan: ${error.message}`);
      const vf = latestPlan?.valid_from ?? nowIso.split('T')[0];
      const vu = latestPlan?.valid_until ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return { action: 'updated_current_plan', plan_id: updateTarget, valid_from: vf, valid_until: vu };
    }
  }

  const range = taskType === 'weekly_plan_update'
    ? latestPlan?.valid_until
      ? getNextPlanRangeFromCurrentPlan(latestPlan.valid_until)
      : getNextWeekRange()
    : {
        from: latestPlan?.valid_from || nowIso.split('T')[0],
        until: latestPlan?.valid_until || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      };

  if (taskType === 'initial_plan' && latestPlan) {
    return { action: 'skipped_existing_plan', plan_id: latestPlan.id, valid_from: latestPlan.valid_from, valid_until: latestPlan.valid_until };
  }

  await supabaseServer.from('ai_generated_plans').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);

  const { data, error } = await supabaseServer.from('ai_generated_plans').insert({
    user_id: userId,
    email: bm?.email ?? null,
    plan_type: planType,
    plan_html: planHtml,
    plan_markdown: null,
    daily_calories: macros.calories,
    macros: { protein_g: macros.protein_g, fat_g: macros.fat_g, carbs_g: macros.carbs_g },
    workout_plan: {}, exercises_data: {}, meal_plan: {},
    generated_by: `ai-task:${taskType}`,
    generation_prompt: `Autonomous trainer task ${taskType}`,
    user_context: bm,
    valid_from: range.from,
    valid_until: range.until,
    is_active: true,
    created_at: nowIso,
  }).select('id').maybeSingle();

  if (error) throw new Error(`Failed to insert plan: ${error.message}`);
  return {
    action: taskType === 'weekly_plan_update' ? 'inserted_next_week_plan' : 'inserted_initial_plan',
    plan_id: data?.id ?? null,
    valid_from: range.from,
    valid_until: range.until,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR: Trainer → ai_generated_plans
// ─────────────────────────────────────────────────────────────────────────────

export async function executeTrainerTask(task) {
  const bm = await loadLatestBodyMetrics(task.user_id);
  const latestPlan = await loadLatestPlan(task.user_id);

  if (task.task_type === 'initial_plan' && latestPlan) {
    return {
      ok: true,
      result: {
        outcome_type: 'plan_generated',
        skipped: true,
        plan_id: latestPlan.id,
        valid_from: latestPlan.valid_from,
        valid_until: latestPlan.valid_until,
        email_sent: false,
        summary: 'Plan already exists – skipped generation',
      },
    };
  }

  const generated = await generatePlan({
    ...bm,
    user_id: task.user_id,
    task_context: {
      task_type: task.task_type,
      reason: task.payload?.reason ?? null,
      prompt: task.payload?.prompt ?? null,
      shared_fact: task.payload?.shared_fact ?? null,
      event_context: task.payload?.event_context ?? null,
    },
  });

  const validation = await runPlanValidators(generated?.html, bm, task.user_id);
  const finalGenerated = validation.htmlToPublish ? { ...generated, html: validation.htmlToPublish } : generated;

  const sideEffect = await persistTrainerPlan({
    userId: task.user_id, bm, generated: finalGenerated,
    taskType: task.task_type, latestPlan,
  });

  let emailSent = false;
  if (task.task_type === 'initial_plan' && bm?.email && finalGenerated?.html) {
    const emailOpts = task.payload?.emailOptions ?? {};
    const sendResult = await sendPlanEmail(bm.email, finalGenerated.html, {
      loginPassword: emailOpts.loginPassword ?? null,
      loginUrl: emailOpts.loginUrl ?? null,
      existingAccount: emailOpts.existingAccount === true,
      loginUnavailable: emailOpts.loginUnavailable === true,
      userChosePassword: emailOpts.userChosePassword === true,
    });
    emailSent = sendResult?.ok === true;
    if (!emailSent) console.warn('⚠️ [executeTrainerTask] sendPlanEmail failed:', sendResult?.message);
  }

  await writeAILog({
    user_id: task.user_id,
    task_id: task.id,
    agent_slug: 'trainer',
    action: task.task_type,
    status: 'completed',
    result: { plan_id: sideEffect.plan_id, email_sent: emailSent },
  });

  return {
    ok: true,
    result: {
      outcome_type: 'plan_generated',
      plan_id: sideEffect.plan_id ?? null,
      valid_from: sideEffect.valid_from ?? null,
      valid_until: sideEffect.valid_until ?? null,
      email_sent: emailSent,
      summary: sideEffect.action,
      metrics: generated?.metrics ?? null,
      validation_warning: validation.validationWarning ?? undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR: Coach → ai_messages
// ─────────────────────────────────────────────────────────────────────────────

export async function executeCoachTask(task) {
  const schemaHint = await getTaskSchemaHintAsync(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: { ...(task.payload ?? {}), task_contract: schemaHint, task_type: task.task_type },
    taskType: task.task_type,
  });

  const parsed = aiResult.parsedContent || toJsonObject(aiResult.rawContent) || {};
  const content = parsed?.message || parsed?.coaching_plan?.weekly_focus || aiResult.rawContent || '';
  const title = buildCoachTitle(task.task_type);

  const messageRow = {
    user_id: task.user_id ?? null,
    agent_slug: 'coach',
    task_type: task.task_type,
    title,
    content,
    status: 'generated',
    delivery_channel: 'in_app',
    created_at: new Date().toISOString(),
  };

  let messageId = null;

  // Primary: write to ai_messages (new canonical table)
  const { data: msgData, error: msgErr } = await supabaseServer
    .from('ai_messages')
    .insert(messageRow)
    .select('id')
    .maybeSingle();

  if (msgErr && !isMissingSchemaError(msgErr.message)) {
    throw new Error(`Failed to store coach message: ${msgErr.message}`);
  }
  if (!msgErr) messageId = msgData?.id ?? null;

  // Fallback: also write to ai_coach_messages for backward compatibility
  if (msgErr && isMissingSchemaError(msgErr.message)) {
    const { data: legacyData } = await supabaseServer
      .from('ai_coach_messages')
      .insert({ user_id: task.user_id ?? null, task_id: task.id, message_type: task.task_type, title, message: content, status: 'ready', created_at: new Date().toISOString() })
      .select('id').maybeSingle();
    messageId = legacyData?.id ?? null;
  }

  // Always write to user_ai_memory for context persistence
  await supabaseServer.from('user_ai_memory').insert({
    user_id: task.user_id ?? null,
    agent_slug: 'coach',
    memory_type: `coach_${String(task.task_type || 'message').toLowerCase()}`,
    content,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) console.warn('[executeCoachTask] memory write failed:', error.message); });

  await writeAILog({
    user_id: task.user_id,
    task_id: task.id,
    agent_slug: 'coach',
    action: task.task_type,
    status: 'completed',
    result: { message_id: messageId },
  });

  return {
    ok: true,
    result: {
      outcome_type: 'message_generated',
      message_id: messageId,
      summary: `${title} (${task.task_type})`,
      structured: parsed,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR: Marketing/Social → ai_content_drafts
// ─────────────────────────────────────────────────────────────────────────────

async function executeContentTask(task) {
  const schemaHint = await getTaskSchemaHintAsync(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: { ...(task.payload ?? {}), task_contract: schemaHint, task_type: task.task_type },
    taskType: task.task_type,
  });

  const parsed = aiResult.parsedContent || toJsonObject(aiResult.rawContent) || {};
  const title = parsed?.campaign?.angle || parsed?.content_plan?.theme || `${task.agent_slug}:${task.task_type}`;
  const contentPayload = Object.keys(parsed).length > 0 ? parsed : { rawContent: aiResult.rawContent };

  const { data, error } = await supabaseServer
    .from('ai_content_drafts')
    .insert({
      user_id: task.user_id ?? null,
      agent_slug: task.agent_slug,
      task_type: task.task_type,
      title,
      content: contentPayload,
      status: 'draft',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error.message)) {
      if (IS_PRODUCTION) throw new Error('Missing ai_content_drafts table for content task.');
      return {
        ok: true,
        result: { outcome_type: 'draft_generated', draft_id: null, agent_slug: task.agent_slug, summary: 'table_missing_fallback', structured: parsed },
      };
    }
    throw new Error(`Failed to store content draft: ${error.message}`);
  }

  await writeAILog({
    user_id: task.user_id,
    task_id: task.id,
    agent_slug: task.agent_slug,
    action: task.task_type,
    status: 'completed',
    result: { draft_id: data?.id },
  });

  return {
    ok: true,
    result: {
      outcome_type: 'draft_generated',
      draft_id: data?.id ?? null,
      agent_slug: task.agent_slug,
      summary: title,
      structured: parsed,
    },
  };
}

export const executeMarketingTask = (task) => executeContentTask(task);
export const executeSocialTask = (task) => executeContentTask(task);

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR: Validator
// ─────────────────────────────────────────────────────────────────────────────

async function executeValidatorTask(task) {
  const schemaHint = await getTaskSchemaHintAsync(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: { ...(task.payload ?? {}), task_contract: schemaHint, task_type: task.task_type, plan_html: task.payload?.plan_html ?? null },
    taskType: task.task_type,
  });
  const parsed = aiResult.parsedContent || toJsonObject(aiResult.rawContent) || {};
  return {
    ok: true,
    result: {
      outcome_type: 'validation_result',
      validation_ok: parsed.ok === true,
      errors: parsed.errors ?? [],
      suggestions: parsed.suggestions ?? [],
      corrected_html: parsed.corrected_html ?? null,
      structured: parsed,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR: Fallback (dev only)
// ─────────────────────────────────────────────────────────────────────────────

async function executeFallbackTask(task) {
  if (IS_PRODUCTION) {
    throw new Error(`No governed executor path for ${task.agent_slug}:${task.task_type}.`);
  }
  const schemaHint = await getTaskSchemaHintAsync(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: { ...(task.payload ?? {}), task_contract: schemaHint, task_type: task.task_type },
    taskType: task.task_type,
  });
  return {
    ok: true,
    result: {
      outcome_type: 'raw_fallback',
      rawContent: aiResult.rawContent,
      parsed: aiResult.parsedContent || toJsonObject(aiResult.rawContent),
      agent_slug: aiResult.agentSlug,
      model: aiResult.model,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Executor binding resolver (DB-first, slug-based fallback)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveExecutorSlug(agentSlug, sideEffectType) {
  try {
    const { data } = await supabaseServer
      .from('ai_executor_bindings')
      .select('executor_slug')
      .eq('side_effect_type', sideEffectType)
      .eq('enabled', true)
      .limit(1)
      .maybeSingle();
    if (data?.executor_slug) return data.executor_slug;
  } catch {}
  if (['plan_insert', 'plan_replace_current', 'plan_insert_next_week'].includes(sideEffectType)) return 'trainer_plan';
  if (sideEffectType === 'coach_message_insert') return 'coach_message';
  if (sideEffectType === 'content_draft_insert') return 'content_draft';
  if (sideEffectType === 'validation_result') return 'validator';
  if (agentSlug === 'trainer') return 'trainer_plan';
  if (agentSlug === 'coach') return 'coach_message';
  if (agentSlug === 'marketing') return 'content_draft';
  if (agentSlug === 'social') return 'content_draft';
  if (['nutrition_validator', 'training_validator'].includes(agentSlug)) return 'validator';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * executeAITask – single entry point for all AI task execution.
 * Called by the scheduler for every queued ai_task.
 *
 * @param {Object} task  Row from ai_tasks table.
 * @returns {Promise<{ ok: boolean, result: object }>}
 */
export async function executeAITask(task) {
  const spec = await getTaskSpecAsync(task.agent_slug, task.task_type);

  if (!spec) {
    if (IS_PRODUCTION) throw new Error(`Task spec missing for ${task.agent_slug}:${task.task_type}.`);
    return executeFallbackTask(task);
  }

  const executorSlug = await resolveExecutorSlug(task.agent_slug, spec.side_effect);

  if (!executorSlug) {
    if (IS_PRODUCTION) throw new Error(`Executor binding missing for side effect ${spec.side_effect}.`);
    return executeFallbackTask(task);
  }

  if (executorSlug === 'trainer_plan') return executeTrainerTask(task);
  if (executorSlug === 'coach_message') return executeCoachTask(task);
  if (executorSlug === 'content_draft') return executeContentTask(task);
  if (executorSlug === 'validator') return executeValidatorTask(task);

  return executeFallbackTask(task);
}
