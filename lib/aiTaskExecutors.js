import { supabaseServer } from './supabaseServer';
import { runAgent } from './runAgent';
import { generatePlan, getNextPlanRangeFromCurrentPlan, getNextWeekRange } from './generatePlan';
import { getTaskSchemaHint, getTaskSpec } from './aiTaskRegistry';

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

  const sideEffect = await persistTrainerPlan({
    userId: task.user_id,
    bm,
    generated,
    taskType: task.task_type,
    latestPlan,
  });

  return {
    ok: true,
    result: {
      side_effect: sideEffect.action,
      plan_id: sideEffect.plan_id ?? null,
      metrics: generated?.metrics ?? null,
      enrichment: generated?.enrichment ?? { meals: [], exercises: [] },
    },
  };
}

async function executeCoachTask(task) {
  const schemaHint = getTaskSchemaHint(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: {
      ...(task.payload ?? {}),
      task_contract: schemaHint,
    },
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
  const schemaHint = getTaskSchemaHint(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: {
      ...(task.payload ?? {}),
      task_contract: schemaHint,
    },
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

async function executeFallbackTask(task) {
  const schemaHint = getTaskSchemaHint(task.agent_slug, task.task_type);
  const aiResult = await runAgent(task.agent_slug, {
    userId: task.user_id ?? null,
    input: {
      ...(task.payload ?? {}),
      task_contract: schemaHint,
    },
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

export async function executeAITask(task) {
  const spec = getTaskSpec(task.agent_slug, task.task_type);
  if (!spec) return executeFallbackTask(task);

  if (task.agent_slug === 'trainer') return executeTrainerTask(task);
  if (task.agent_slug === 'coach') return executeCoachTask(task);
  if (task.agent_slug === 'marketing' || task.agent_slug === 'social') return executeContentTask(task);
  return executeFallbackTask(task);
}
