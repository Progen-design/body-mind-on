import { supabaseServer } from './supabaseServer';
import { runAgent } from './runAgent';
import { generatePlan, getNextPlanRangeFromCurrentPlan, getNextWeekRange } from './generatePlan';
import { getTaskSchemaHintAsync, getTaskSpecAsync } from './aiTaskRegistry';
import { sendPlanEmail } from './mail';
import { getAgentConfig } from './getAgentConfig';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
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

function buildTaskMemoryType(taskType) {
  return `coach_${String(taskType || 'message').trim().toLowerCase()}`;
}

function buildCoachTitle(taskType) {
  switch (taskType) {
    case 'onboarding_message':
      return 'Uvítání do programu';
    case 'motivation_message':
      return 'Motivace na další dny';
    case 'recovery_message':
      return 'Doporučení k regeneraci';
    case 'positive_reinforcement':
      return 'Pochvala za progres';
    default:
      return 'Koučovací zpráva';
  }
}

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

/**
 * Run nutrition_validator and training_validator on plan HTML.
 * Publish goes only after this step; if validators fail we still return so caller can publish with validation_warning.
 * @returns {{ nutritionOk: boolean, trainingOk: boolean, htmlToPublish: string, validationWarning: string | null }}
 */
async function runPlanValidators(planHtml, bm, userId) {
  let htmlToPublish = planHtml || '';
  let nutritionOk = true;
  let trainingOk = true;
  const errors = [];

  const [nutConfig, trainConfig] = await Promise.all([
    getAgentConfig('nutrition_validator'),
    getAgentConfig('training_validator'),
  ]);

  const runNutrition = nutConfig.enabled && planHtml;
  const runTraining = trainConfig.enabled && planHtml;

  if (runNutrition) {
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
      if (parsed.corrected_html && typeof parsed.corrected_html === 'string') htmlToPublish = parsed.corrected_html;
    } catch (e) {
      console.warn('⚠️ [runPlanValidators] nutrition_validator failed:', e?.message);
      nutritionOk = false;
      errors.push(`[nutrition] ${e?.message || 'Validator error'}`);
    }
  }

  if (runTraining) {
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
      if (parsed.corrected_html && typeof parsed.corrected_html === 'string') htmlToPublish = parsed.corrected_html;
    } catch (e) {
      console.warn('⚠️ [runPlanValidators] training_validator failed:', e?.message);
      trainingOk = false;
      errors.push(`[training] ${e?.message || 'Validator error'}`);
    }
  }

  const validationWarning =
    (runNutrition || runTraining) && (!nutritionOk || !trainingOk)
      ? errors.length ? errors.join('; ') : 'Validation did not pass'
      : null;

  return { nutritionOk, trainingOk, htmlToPublish, validationWarning };
}

/** CORE FLOW: Saves trainer output to ai_generated_plans. Registration → AI plan requires this. See docs/CORE_FLOW_REGISTRACE_AI_PLAN.md */
async function persistTrainerPlan({
  userId,
  bm,
  generated,
  taskType,
  latestPlan,
}) {
  const planHtml = generated?.html;
  if (!planHtml) throw new Error('Trainer plan generation returned empty html');

  const macros = buildStoredMacros(bm, generated);
  const nowIso = new Date().toISOString();
  const planType = buildPlanType(bm?.goal);

  if (taskType === 'adjust_plan' || taskType === 'reduce_training_load') {
    const updateTarget = latestPlan?.id ?? null;
    const payload = {
      plan_type: planType,
      plan_html: planHtml,
      daily_calories: macros.calories,
      macros: {
        protein_g: macros.protein_g,
        fat_g: macros.fat_g,
        carbs_g: macros.carbs_g,
      },
      generated_by: `ai-task:${taskType}`,
      generation_prompt: `Autonomous trainer task ${taskType}`,
      user_context: bm,
      is_active: true,
    };

    if (updateTarget) {
      const { error } = await supabaseServer.from('ai_generated_plans').update(payload).eq('id', updateTarget);
      if (error) throw new Error(`Failed to update plan: ${error.message}`);
      return { action: 'updated_current_plan', plan_id: updateTarget };
    }
  }

  const range =
    taskType === 'weekly_plan_update'
      ? latestPlan?.valid_until
        ? getNextPlanRangeFromCurrentPlan(latestPlan.valid_until)
        : getNextWeekRange()
      : {
          from: latestPlan?.valid_from || new Date().toISOString().split('T')[0],
          until:
            latestPlan?.valid_until ||
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        };

  if (taskType === 'initial_plan' && latestPlan) {
    return { action: 'skipped_existing_plan', plan_id: latestPlan.id };
  }

  await supabaseServer.from('ai_generated_plans').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);

  const insertPayload = {
    user_id: userId,
    email: bm?.email ?? null,
    plan_type: planType,
    plan_html: planHtml,
    plan_markdown: null,
    daily_calories: macros.calories,
    macros: {
      protein_g: macros.protein_g,
      fat_g: macros.fat_g,
      carbs_g: macros.carbs_g,
    },
    workout_plan: {},
    exercises_data: {},
    meal_plan: {},
    generated_by: `ai-task:${taskType}`,
    generation_prompt: `Autonomous trainer task ${taskType}`,
    user_context: bm,
    valid_from: range.from,
    valid_until: range.until,
    is_active: true,
    created_at: nowIso,
  };

  const { data, error } = await supabaseServer
    .from('ai_generated_plans')
    .insert(insertPayload)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to insert plan: ${error.message}`);
  return {
    action: taskType === 'weekly_plan_update' ? 'inserted_next_week_plan' : 'inserted_initial_plan',
    plan_id: data?.id ?? null,
  };
}

async function executeTrainerTask(task) {
  const bm = await loadLatestBodyMetrics(task.user_id);
  const latestPlan = await loadLatestPlan(task.user_id);

  if (task.task_type === 'initial_plan' && latestPlan) {
    return {
      ok: true,
      result: {
        skipped: true,
        side_effect: 'skipped_existing_plan',
        plan_id: latestPlan.id,
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

  // Publish only after validation step (validators optional; if they fail we still publish so user always gets a plan).
  const validation = await runPlanValidators(generated?.html, bm, task.user_id);
  const generatedForPublish = validation.htmlToPublish
    ? { ...generated, html: validation.htmlToPublish }
    : generated;

  const sideEffect = await persistTrainerPlan({
    userId: task.user_id,
    bm,
    generated: generatedForPublish,
    taskType: task.task_type,
    latestPlan,
  });

  if (task.task_type === 'initial_plan' && bm?.email && generatedForPublish?.html) {
    const emailOpts = task.payload?.emailOptions ?? {};
    const sendResult = await sendPlanEmail(bm.email, generatedForPublish.html, {
      loginPassword: emailOpts.loginPassword ?? null,
      loginUrl: emailOpts.loginUrl ?? null,
      existingAccount: emailOpts.existingAccount === true,
      loginUnavailable: emailOpts.loginUnavailable === true,
      userChosePassword: emailOpts.userChosePassword === true,
    });
    if (!sendResult?.ok) {
      console.warn('⚠️ [executeTrainerTask] sendPlanEmail failed:', sendResult?.message);
    } else {
      console.log('📧 E-mail s plánem odeslán na:', bm.email);
    }
  }

  return {
    ok: true,
    result: {
      side_effect: sideEffect.action,
      plan_id: sideEffect.plan_id ?? null,
      metrics: generated?.metrics ?? null,
      enrichment: generated?.enrichment ?? { meals: [], exercises: [] },
      validation_warning: validation.validationWarning ?? undefined,
    },
  };
}

async function executeCoachTask(task) {
  const schemaHint = await getTaskSchemaHintAsync(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: {
      ...(task.payload ?? {}),
      task_contract: schemaHint,
      task_type: task.task_type,
    },
    taskType: task.task_type,
  });

  const parsed = aiResult.parsedContent || toJsonObject(aiResult.rawContent) || {};
  const message =
    parsed?.message ||
    parsed?.coaching_plan?.weekly_focus ||
    aiResult.rawContent;

  const coachRow = {
    user_id: task.user_id ?? null,
    task_id: task.id,
    message_type: task.task_type,
    title: buildCoachTitle(task.task_type),
    message,
    payload: parsed && Object.keys(parsed).length > 0 ? parsed : { rawContent: aiResult.rawContent },
    status: 'ready',
    created_at: new Date().toISOString(),
  };

  const { data: messageRow, error: messageErr } = await supabaseServer
    .from('ai_coach_messages')
    .insert(coachRow)
    .select('id')
    .maybeSingle();

  if (messageErr && !isMissingSchemaError(messageErr.message)) {
    throw new Error(`Failed to store coach message: ${messageErr.message}`);
  }

  const { error: memoryErr } = await supabaseServer.from('user_ai_memory').insert({
    user_id: task.user_id ?? null,
    agent_slug: 'coach',
    memory_type: buildTaskMemoryType(task.task_type),
    content: message,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (memoryErr) throw new Error(`Failed to store coach memory: ${memoryErr.message}`);

  return {
    ok: true,
    result: {
      side_effect: 'coach_message_insert',
      message_id: messageRow?.id ?? null,
      storage_fallback: messageErr ? 'user_ai_memory_only' : null,
      structured: parsed,
    },
  };
}

async function executeContentTask(task) {
  const schemaHint = await getTaskSchemaHintAsync(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: {
      ...(task.payload ?? {}),
      task_contract: schemaHint,
      task_type: task.task_type,
    },
    taskType: task.task_type,
  });

  const parsed = aiResult.parsedContent || toJsonObject(aiResult.rawContent) || {};
  const title =
    parsed?.campaign?.angle ||
    parsed?.content_plan?.theme ||
    `${task.agent_slug}:${task.task_type}`;

  const { data, error } = await supabaseServer
    .from('ai_content_drafts')
    .insert({
      user_id: task.user_id ?? null,
      task_id: task.id,
      agent_slug: task.agent_slug,
      content_type: task.task_type,
      title,
      payload: parsed && Object.keys(parsed).length > 0 ? parsed : { rawContent: aiResult.rawContent },
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error.message)) {
      if (IS_PRODUCTION) {
        throw new Error('Missing ai_content_drafts artifact table for content task.');
      }
      return {
        ok: true,
        result: {
          side_effect: 'raw_result_only',
          storage_fallback: 'ai_content_drafts_missing',
          structured: parsed,
          rawContent: aiResult.rawContent,
        },
      };
    }
    throw new Error(`Failed to store content draft: ${error.message}`);
  }

  return {
    ok: true,
    result: {
      side_effect: 'content_draft_insert',
      draft_id: data?.id ?? null,
      structured: parsed,
    },
  };
}

async function executeValidatorTask(task) {
  const schemaHint = await getTaskSchemaHintAsync(task.agent_slug, task.task_type);
  const planHtml = task.payload?.plan_html ?? null;
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: {
      ...(task.payload ?? {}),
      task_contract: schemaHint,
      task_type: task.task_type,
      plan_html: planHtml,
    },
    taskType: task.task_type,
  });
  const parsed = aiResult.parsedContent || toJsonObject(aiResult.rawContent) || {};
  return {
    ok: true,
    result: {
      side_effect: 'validation_result',
      validation_ok: parsed.ok === true,
      errors: parsed.errors ?? [],
      suggestions: parsed.suggestions ?? [],
      corrected_html: parsed.corrected_html ?? null,
      structured: parsed,
    },
  };
}

async function executeFallbackTask(task) {
  if (IS_PRODUCTION) {
    throw new Error(`No governed executor path for ${task.agent_slug}:${task.task_type}.`);
  }

  const schemaHint = await getTaskSchemaHintAsync(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: {
      ...(task.payload ?? {}),
      task_contract: schemaHint,
      task_type: task.task_type,
    },
    taskType: task.task_type,
  });

  return {
    ok: true,
    result: {
      side_effect: 'raw_result_only',
      rawContent: aiResult.rawContent,
      parsed: aiResult.parsedContent || toJsonObject(aiResult.rawContent),
      agent_slug: aiResult.agentSlug,
      model: aiResult.model,
    },
  };
}

/** Resolve executor: DB (ai_executor_bindings) or legacy slug-based. */
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
  if (sideEffectType === 'plan_insert' || sideEffectType === 'plan_replace_current' || sideEffectType === 'plan_insert_next_week') return 'trainer_plan';
  if (sideEffectType === 'coach_message_insert') return 'coach_message';
  if (sideEffectType === 'content_draft_insert') return 'content_draft';
  if (sideEffectType === 'validation_result') return 'validator';
  return null;
}

export async function executeAITask(task) {
  const spec = await getTaskSpecAsync(task.agent_slug, task.task_type);
  if (!spec) {
    if (IS_PRODUCTION) {
      throw new Error(`Task spec missing for ${task.agent_slug}:${task.task_type}.`);
    }
    return executeFallbackTask(task);
  }

  const executorSlug = await resolveExecutorSlug(task.agent_slug, spec.side_effect);
  if (!executorSlug) {
    if (IS_PRODUCTION) {
      throw new Error(`Executor binding missing for side effect ${spec.side_effect}.`);
    }
    return executeFallbackTask(task);
  }

  if (executorSlug === 'trainer_plan') return executeTrainerTask(task);
  if (executorSlug === 'coach_message') return executeCoachTask(task);
  if (executorSlug === 'content_draft') return executeContentTask(task);
  if (executorSlug === 'validator') return executeValidatorTask(task);
  return executeFallbackTask(task);
}
