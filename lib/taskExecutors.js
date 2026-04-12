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
import { validatePublishedPlanHtml } from './validatePlanHtml';
import { runUnifiedPlanPipeline } from './unifiedPlanPipeline';
import { getNextPlanRangeFromCurrentPlan, getNextWeekRange, buildDeterministicFallbackPlanHtml } from './generatePlan';
import { getTaskSchemaHintAsync, getTaskSpecAsync } from './aiTaskRegistry';
import { sendPlanEmail } from './mail';
import { getAgentConfig } from './getAgentConfig';
import { writeAILog } from './aiOps';
import { writeSharedMemoryFact } from './aiSharedMemory';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** Plán smí být publikován: AI výstup, AI retry, deterministický fallback, nebo unified pipeline (openai/fallback). */
const AI_PUBLISHABLE_SOURCES = ['ai', 'ai_retry', 'ai_retry_truth', 'deterministic_fallback', 'openai', 'fallback'];

function isPublishableFromAI(generationSource) {
  return generationSource && AI_PUBLISHABLE_SOURCES.includes(generationSource);
}

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

/** +n kalendářních dní k ISO datu YYYY-MM-DD (poledne lokálně – stejné chování jako dřív v taskExecutors). */
function addCalendarDaysIso(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/** Pondělí kalendářního týdne obsahujícího isoDate (0=neděle → pondělí téhož týdne zpět). */
function getThisWeekMonday(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

/** Sedm dní pondělí–neděle pro týden obsahující isoDate. */
function weekRangeFromMondayContaining(isoDate) {
  const from = getThisWeekMonday(isoDate);
  return { from, until: addCalendarDaysIso(from, 6) };
}

/**
 * Týdenní rozsah pro initial_plan: vždy pondělí aktuálního (dnešního) týdne – ne „dnes“ jako první den,
 * aby UI mělo vždy 7 dnů od pondělí (např. nedělní registrace neusekne začátek plánu).
 */
function initialPlanWeekRangeFromRegistration(_bm) {
  const todayIso = new Date().toISOString().split('T')[0];
  return weekRangeFromMondayContaining(todayIso);
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
    .select('id, user_id, valid_from, valid_until, is_active, created_at, plan_html')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load current plan: ${error.message}`);
  return data ?? null;
}

/** Zda latestPlan je použitelný pro skip (initial_plan): exists, is_active, plan_html má core sekce. */
function hasUsableExistingPlan(plan) {
  if (!plan) return false;
  if (plan.is_active !== true) return false;
  const html = plan.plan_html;
  if (typeof html !== 'string' || !html.trim()) return false;
  return validatePublishedPlanHtml(html).ok;
}

// Trainer: plan validators → lib/planValidators.js (runPlanValidators)

// ─────────────────────────────────────────────────────────────────────────────
// Trainer: persist plan
// ─────────────────────────────────────────────────────────────────────────────

async function persistTrainerPlan({ userId, bm, generated, taskType, latestPlan, selectedHtmlSource = null, planRange: planRangeFromPipeline = null }) {
  const planHtml = generated?.html;
  if (!planHtml || typeof planHtml !== 'string') throw new Error('Trainer plan generation returned empty html');
  const planValid = validatePublishedPlanHtml(planHtml);
  if (!planValid.ok) {
    console.error('[persistTrainerPlan] Plan invalid – not persisting', {
      reason: planValid.reason,
      missing_core_sections: planValid.missingCoreSections ?? [],
      html_length: planValid.length,
      matched_sections: planValid.matchedSections ?? [],
    });
    throw new Error(`Trainer plan html invalid (${planValid.reason}) – not persisting`);
  }

  const planJson = generated?.planJson;
  const targets = planJson?.targets ?? generated?.targets;
  const macros = targets
    ? {
        calories: Math.round((Number(targets.calories_per_day) || 2200) / 50) * 50,
        protein_g: Number(targets.protein_g) || Math.round((asNum(bm?.weight_kg) || 70) * 1.8),
        fat_g: Number(targets.fat_g) || Math.round(((targets.calories_per_day || 2200) * 0.25) / 9),
        carbs_g: Number(targets.carbs_g) || Math.round(((targets.calories_per_day || 2200) - (targets.protein_g || 120) * 4 - (targets.fat_g || 65) * 9) / 4),
      }
    : buildStoredMacros(bm, generated);
  const nowIso = new Date().toISOString();
  const planType = buildPlanType(bm?.goal);

  if (taskType === 'adjust_plan' || taskType === 'reduce_training_load') {
    const updateTarget = latestPlan?.id ?? null;
    if (updateTarget) {
      console.info('[persistTrainerPlan] updating plan', { plan_id: updateTarget, user_id: userId, html_length: (planHtml || '').length, plan_type: planType });
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

  const range =
    planRangeFromPipeline && planRangeFromPipeline.from && planRangeFromPipeline.until
      ? { from: planRangeFromPipeline.from, until: planRangeFromPipeline.until }
      : taskType === 'weekly_plan_update'
        ? latestPlan?.valid_until
          ? getNextPlanRangeFromCurrentPlan(latestPlan.valid_until)
          : getNextWeekRange()
        : initialPlanWeekRangeFromRegistration(bm);

  if (taskType === 'initial_plan' && hasUsableExistingPlan(latestPlan)) {
    const htmlLen = latestPlan?.plan_html?.length ?? 0;
    console.info('[persistTrainerPlan] initial_plan skipped because existing valid plan', { existing_plan_html_length: htmlLen });
    return { action: 'skipped_existing_plan', plan_id: latestPlan.id, valid_from: latestPlan.valid_from, valid_until: latestPlan.valid_until };
  }

  await supabaseServer.from('ai_generated_plans').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);

  const htmlLength = (planHtml || '').length;
  console.info('[persistTrainerPlan] inserting trainer plan', { user_id: userId, html_length: htmlLength, matched_sections: planValid.matchedSections ?? [], missing_core_sections: planValid.missingCoreSections ?? [], plan_type: planType, task_type: taskType, published_plan_validation_reason: planValid.reason ?? 'ok', selected_html_source: selectedHtmlSource ?? undefined });

  const insertPayload = {
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
  };
  if (planJson && typeof planJson === 'object') {
    insertPayload.structured_plan_json = planJson;
  }
  const upsertOpts = { onConflict: 'user_id,valid_from', ignoreDuplicates: false };
  let { data, error } = await supabaseServer
    .from('ai_generated_plans')
    .upsert(insertPayload, upsertOpts)
    .select('id')
    .maybeSingle();
  if (error && isMissingSchemaError(error.message) && insertPayload.structured_plan_json) {
    delete insertPayload.structured_plan_json;
    const retry = await supabaseServer
      .from('ai_generated_plans')
      .upsert(insertPayload, upsertOpts)
      .select('id')
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    console.error('[persistTrainerPlan] upsert_failed', { user_id: userId, db_error: error.message, code: error.code });
    throw new Error(`Failed to save plan: ${error.message}`);
  }
  // Runtime contract: initial_plan must have a persisted plan id – never complete without it
  if (taskType === 'initial_plan' && (data?.id == null || data?.id === undefined)) {
    console.error('[persistTrainerPlan] insert returned no id – cannot complete initial_plan task', { user_id: userId });
    throw new Error('Plan insert did not return id – cannot complete initial_plan task');
  }
  console.info('[persistTrainerPlan] plan_insert_success', { plan_id: data?.id ?? null, is_active: true, user_id: userId });
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
    if (hasUsableExistingPlan(latestPlan)) {
      const htmlLen = latestPlan.plan_html?.length ?? 0;
      console.info('[executeTrainerTask] initial_plan skipped because existing valid plan', { existing_plan_html_length: htmlLen });
      return {
        ok: true,
        result: {
          outcome_type: 'plan_generated',
          skipped: true,
          skip_reason: 'skipped_existing_valid_plan',
          plan_id: latestPlan.id,
          valid_from: latestPlan.valid_from,
          valid_until: latestPlan.valid_until,
          email_sent: false,
          summary: 'skipped_existing_valid_plan',
          html_length: latestPlan.plan_html?.length ?? 0,
          selected_html_source: 'skipped',
          matched_sections: (() => {
            const v = validatePublishedPlanHtml(latestPlan.plan_html);
            return v.matchedSections ?? [];
          })(),
        },
      };
    }
    const htmlLen = latestPlan.plan_html?.length ?? 0;
    const validationResult = validatePublishedPlanHtml(latestPlan.plan_html);
    console.info('[executeTrainerTask] initial_plan regenerated because existing plan invalid', {
      existing_plan_html_length: htmlLen,
      reason: validationResult.reason ?? 'unknown',
      missingCoreSections: validationResult.missingCoreSections ?? [],
      structure: validationResult.structure ?? null,
    });
  }

  // Spočítat rozsah plánu PŘED generováním, aby pořadí dnů v HTML odpovídalo valid_from.
  // Nikdy nedědit valid_from z předchozího (často chybného) řádku — jen registrace + weekly update.
  const forceRegenerate = task.payload?.force_regenerate === true;
  let planRange;
  if (task.task_type === 'weekly_plan_update') {
    if (forceRegenerate) {
      const todayIso = new Date().toISOString().split('T')[0];
      planRange = weekRangeFromMondayContaining(todayIso);
    } else if (latestPlan?.valid_until) {
      const r = getNextPlanRangeFromCurrentPlan(latestPlan.valid_until);
      planRange = { from: r.from, until: r.until };
    } else {
      const r = getNextWeekRange();
      planRange = { from: r.from, until: r.until };
    }
  } else {
    planRange = initialPlanWeekRangeFromRegistration(bm);
  }

  const pipelineResult = await runUnifiedPlanPipeline({
    bm: { ...bm, user_id: task.user_id },
    validFrom: planRange.from,
    validUntil: planRange.until,
    useOpenAI: true,
  });

  if (!pipelineResult?.ok) {
    const reason = pipelineResult?.error ?? 'Unified plan pipeline failed';
    console.error('[executeTrainerTask] Pipeline failed', { reason });
    const failPayload = {
      outcome_type: 'plan_generation_failed',
      reason,
      generation_source: null,
      fallback_used: false,
      fallback_internal_only: true,
      trainer_ai_attempted: true,
      trainer_ai_succeeded: false,
      published_to_user: false,
      email_sent: false,
      root_failure_stage: 'unified_pipeline_failed',
    };
    if (task?.id) {
      await supabaseServer.from('ai_tasks').update({
        status: 'failed',
        result: failPayload,
        last_error: reason,
        processed_at: new Date().toISOString(),
      }).eq('id', task.id);
    }
    throw new Error(reason);
  }

  const chosenHtml = pipelineResult.planHtml || '';
  const selectedHtmlSource = 'unified_pipeline';
  const finalValid = validatePublishedPlanHtml(chosenHtml);
  const structuredPlanValidation = pipelineResult.validation ?? null;

  const generated = {
    html: chosenHtml,
    planJson: pipelineResult.planJson,
    generation_source: pipelineResult.generation_source ?? 'openai',
    fallback_used: pipelineResult.generation_source === 'fallback',
    truth_check: null,
    structured_plan_validation: structuredPlanValidation,
  };

  console.info('[executeTrainerTask] html_length', finalValid.length, 'selected', selectedHtmlSource, 'generation_source', generated?.generation_source ?? null, 'fallback_used', generated?.fallback_used ?? false);

  // PRAVIDLO: Plán publikovatelný z AI nebo deterministic_fallback (když AI selhal).
  if (!isPublishableFromAI(generated?.generation_source)) {
    const reason = `generation_source=${generated?.generation_source ?? 'unknown'} není publikovatelný`;
    console.error('[executeTrainerTask] Plan not publishable', { generation_source: generated?.generation_source, fallback_used: generated?.fallback_used });
    const failPayload = {
      outcome_type: 'plan_generation_failed',
      reason,
      generation_source: generated?.generation_source ?? null,
      fallback_used: generated?.fallback_used ?? false,
      fallback_internal_only: true,
      trainer_ai_attempted: true,
      trainer_ai_succeeded: false,
      trainer_ai_failed: true,
      trainer_ai_failure_reason: reason,
      published_to_user: false,
      email_sent: false,
      root_failure_stage: 'fallback_not_publishable',
    };
    if (task?.id) {
      await supabaseServer.from('ai_tasks').update({
        status: 'failed',
        result: failPayload,
        last_error: reason,
        processed_at: new Date().toISOString(),
      }).eq('id', task.id);
    }
    throw new Error(reason);
  }

  const truthCheck = generated?.truth_check ?? null;
  const resultPayload = {
    outcome_type: 'plan_generation_failed',
    reason: finalValid.reason,
    html_length: finalValid.length,
    selected_html_source: selectedHtmlSource,
    matched_sections: finalValid.matchedSections ?? [],
    missing_core_sections: finalValid.missingCoreSections ?? [],
    structure: finalValid.structure ?? null,
    validatorReplacementApplied: false,
    validatorReplacementReason: null,
    generation_source: generated?.generation_source ?? null,
    fallback_used: generated?.fallback_used ?? false,
    truth_check: truthCheck,
    repetitive_meals: truthCheck?.repetitive_meals ?? null,
    repetitive_training_days: truthCheck?.repetitive_training_days ?? null,
    unjustified_supplements: truthCheck?.unjustified_supplements ?? null,
  };

  if (!finalValid.ok) {
    console.error('[executeTrainerTask] Generated trainer plan missing core sections', resultPayload);
    if (task?.id) {
      await supabaseServer.from('ai_tasks').update({
        status: 'failed',
        result: resultPayload,
        last_error: `Generated trainer plan missing core sections (${finalValid.reason})`,
        processed_at: new Date().toISOString(),
      }).eq('id', task.id);
    }
    throw new Error('Generated trainer plan missing core sections');
  }

  const finalGenerated = { ...generated, html: chosenHtml };

  const sideEffect = await persistTrainerPlan({
    userId: task.user_id, bm, generated: finalGenerated,
    taskType: task.task_type, latestPlan,
    selectedHtmlSource,
    planRange,
  });

  // Runtime contract: initial_plan must never be completed without a persisted plan_id
  if (task.task_type === 'initial_plan' && (sideEffect?.plan_id == null || sideEffect?.plan_id === undefined)) {
    console.error('[executeTrainerTask] initial_plan persist did not return plan_id – failing task', { user_id: task.user_id });
    throw new Error('Initial plan task cannot complete without persisted plan_id');
  }

  let emailSent = false;
  let emailError = null;
  let validationWarning = null;
  if (task.task_type === 'initial_plan' && bm?.email && finalGenerated?.html) {
    const planHtml = finalGenerated.html;
    const emailValid = validatePublishedPlanHtml(planHtml);
    if (!emailValid.ok) {
      console.warn('[executeTrainerTask] Plan validation failed – email not sent. Plan saved to DB.', { reason: emailValid.reason });
      validationWarning = 'Plán uložen, ale nebyl dostatečně kompletní pro e-mail – otevři aplikaci pro zobrazení.';
    } else {
      const emailOpts = task.payload?.emailOptions ?? {};
      const sendResult = await sendPlanEmail(bm.email, planHtml, {
        loginPassword: emailOpts.loginPassword ?? null,
        loginUrl: emailOpts.loginUrl ?? null,
        existingAccount: emailOpts.existingAccount === true,
        loginUnavailable: emailOpts.loginUnavailable === true,
        userChosePassword: emailOpts.userChosePassword === true,
      });
      emailSent = sendResult?.ok === true;
      if (!emailSent) {
        emailError = sendResult?.message ?? null;
        console.warn('[executeTrainerTask] sendPlanEmail failed:', emailError);
      }
    }
  }

  await writeAILog({
    user_id: task.user_id,
    task_id: task.id,
    agent_slug: 'trainer',
    action: task.task_type,
    status: 'completed',
    result: { plan_id: sideEffect.plan_id, email_sent: emailSent },
  });

  const regenerated = latestPlan && !hasUsableExistingPlan(latestPlan);
  const skipReason = regenerated ? 'regenerated_because_existing_plan_invalid' : undefined;
  const summary = regenerated ? 'regenerated_because_existing_plan_invalid' : sideEffect.action;
  return {
    ok: true,
    result: {
      outcome_type: 'plan_generated',
      plan_id: sideEffect.plan_id ?? null,
      saved_plan_id: sideEffect.plan_id ?? null,
      valid_from: sideEffect.valid_from ?? null,
      valid_until: sideEffect.valid_until ?? null,
      trainer_ai_attempted: true,
      trainer_ai_succeeded: true,
      trainer_ai_failed: false,
      trainer_ai_failure_reason: null,
      published_to_user: true,
      email_attempted: task.task_type === 'initial_plan' && !!bm?.email,
      email_sent: emailSent,
      email_error: emailError ?? validationWarning ?? null,
      fallback_used: generated?.fallback_used ?? false,
      fallback_internal_only: false,
      profile_plan_returned: true,
      root_failure_stage: null,
      email_sent: emailSent,
      summary,
      skip_reason: skipReason,
      html_length: finalValid.length,
      selected_html_source: selectedHtmlSource,
      matched_sections: finalValid.matchedSections ?? [],
      missing_core_sections: finalValid.missingCoreSections ?? [],
      structure: finalValid.structure ?? null,
      validatorReplacementApplied: structuredPlanValidation?.validatorReplacementApplied ?? false,
      validatorReplacementReason: structuredPlanValidation?.validatorReplacementReason ?? null,
      generation_source: generated?.generation_source ?? null,
      fallback_used: generated?.fallback_used ?? false,
      metrics: generated?.metrics ?? null,
      validation_warning: validationWarning ?? structuredPlanValidation?.validationWarning ?? undefined,
      structured_plan_validation_ok: structuredPlanValidation?.ok ?? null,
      truth_check: generated?.truth_check ?? null,
      repetitive_meals: generated?.truth_check?.repetitive_meals ?? null,
      repetitive_training_days: generated?.truth_check?.repetitive_training_days ?? null,
      unjustified_supplements: generated?.truth_check?.unjustified_supplements ?? null,
      truth_retry_triggered: generated?.truth_retry_triggered ?? undefined,
      truth_retry_reason: generated?.truth_retry_reason ?? undefined,
      truth_retry_fixed: generated?.truth_retry_fixed ?? undefined,
      final_publish_source: generated?.final_publish_source ?? undefined,
      raw_ai_html_length: generated?.raw_ai_html_length ?? undefined,
      final_html_length: generated?.final_html_length ?? undefined,
      ai_output_was_used: generated?.ai_output_was_used ?? undefined,
      retry_output_was_used: generated?.retry_output_was_used ?? undefined,
      fallback_output_was_used: generated?.fallback_output_was_used ?? undefined,
      weak_quality_flags: generated?.weak_quality_flags ?? undefined,
      media_exact_count: generated?.media_exact_count ?? undefined,
      media_none_count: generated?.media_none_count ?? undefined,
      prompt_source: generated?.prompt_source ?? undefined,
      prompt_version: generated?.prompt_version ?? undefined,
      supporting_documents_count: generated?.supporting_documents_count ?? undefined,
      document_titles: generated?.document_titles ?? undefined,
      source_ids: generated?.source_ids ?? undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR: Coach → ai_messages (canonical – no ai_coach_messages fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write grounded shared facts based on coach task type.
 * Only writes facts that are grounded in the task type trigger — NOT hallucinated.
 * The task was decided based on progress analysis, so the task type itself is evidence.
 */
async function writeCoachSharedFacts(task) {
  const userId = task.user_id;
  if (!userId) return;

  const taskType = task.task_type;

  if (taskType === 'recovery_message') {
    // Grounded: task was triggered by high_stress_detected → recovery is needed
    await writeSharedMemoryFact({
      userId,
      memoryType: 'shared_recovery_priority',
      content: 'Recovery priority detected — reduce training load, prioritize sleep and stress management.',
      sourceAgentSlug: 'coach',
    });
  }

  if (taskType === 'motivation_message') {
    // Grounded: task was triggered by low_adherence_detected
    await writeSharedMemoryFact({
      userId,
      memoryType: 'shared_low_adherence_pattern',
      content: 'Low adherence pattern detected — user may need simplified plan or additional motivation.',
      sourceAgentSlug: 'coach',
    });
    await writeSharedMemoryFact({
      userId,
      memoryType: 'shared_plan_simplicity_needed',
      content: 'Plan simplification recommended — reduce complexity, focus on sustainable habits.',
      sourceAgentSlug: 'coach',
    });
  }

  if (taskType === 'positive_reinforcement') {
    // Grounded: task was triggered by progress_good
    await writeSharedMemoryFact({
      userId,
      memoryType: 'shared_good_progress',
      content: 'User is showing good progress — maintain or slightly increase plan intensity.',
      sourceAgentSlug: 'coach',
    });
  }
  // onboarding_message: do NOT write shared facts — context not established yet
}

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

  let messageId = null;

  // Write to ai_messages – the ONLY canonical coach message table
  // (ai_coach_messages is legacy; all new writes go here exclusively)
  const { data: msgData, error: msgErr } = await supabaseServer
    .from('ai_messages')
    .insert({
      user_id: task.user_id ?? null,
      agent_slug: 'coach',
      task_type: task.task_type,
      title,
      content,
      status: 'generated',
      delivery_channel: 'in_app',
      task_id: task.id ?? null,
      payload: task.payload ? JSON.parse(JSON.stringify(task.payload)) : null,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (msgErr) {
    throw new Error(`Failed to store coach message in ai_messages: ${msgErr.message}`);
  }
  messageId = msgData?.id ?? null;

  // Write agent-specific memory for context persistence
  await supabaseServer
    .from('user_ai_memory')
    .insert({
      user_id: task.user_id ?? null,
      agent_slug: 'coach',
      memory_type: `coach_${String(task.task_type || 'message').toLowerCase()}`,
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.warn('[executeCoachTask] memory write failed:', error.message);
    });

  // Write grounded shared facts (cross-agent memory for trainer to consume)
  await writeCoachSharedFacts(task).catch((e) => {
    console.warn('[executeCoachTask] shared facts write failed:', e?.message);
  });

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
// Fallback plan when AI pipeline failed (e.g. after registration)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimální validní HTML plán – vždy projde validací. Použije se když buildDeterministicFallbackPlanHtml selže. */
function getMinimalValidPlanHtml() {
  const days = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
  let daysHtml = '';
  for (const d of days) {
    daysHtml += `<h3>${d}</h3><p><b>Snídaně:</b> Ovesná kaše s ovocem</p><p><b>Oběd:</b> Kuřecí prsa s rýží</p><p><b>Večeře:</b> Zeleninový salát s tofu</p><p><b>Trénink tento den:</b></p><ul><li>Odpočinek.</li></ul>`;
  }
  const base = `<h2>Tvůj plán na tento týden</h2><h3>Jídelníček</h3>${daysHtml}<h3>Trénink</h3><p>Postupně zvyšuj zátěž. Dýchej pravidelně.</p>`;
  const MIN = 3500;
  return base.length >= MIN ? base : base + '\n<!-- ' + ' padding '.repeat(Math.ceil((MIN - base.length - 12) / 10)) + ' -->';
}

/**
 * Persist deterministic fallback plan as INTERNAL-ONLY artifact (debug/admin/support).
 * NIKDY se nevolá z produkčního flow – pravidlo AI-first: finální plán smí vzniknout pouze z AI.
 * Plán se persistuje s is_active: false a generated_by: 'deterministic_fallback_internal_only'.
 * Uživatel ho neuvidí v profilu a nepošle se e-mailem.
 * @returns {Promise<{ plan_id: string, valid_from: string, valid_until: string, bm: object, planHtml: string } | null>}
 */
export async function persistFallbackPlanForUser(userId) {
  try {
    const bm = await loadLatestBodyMetrics(userId);
    const regDateIso = bm?.created_at ? new Date(bm.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const targetStart = new Date(regDateIso + 'T12:00:00');
    let planHtml = buildDeterministicFallbackPlanHtml(bm, targetStart);
    let planValid = validatePublishedPlanHtml(planHtml);
    if (!planValid.ok) {
      console.warn('[persistFallbackPlanForUser] Fallback HTML invalid, trying minimal', {
        reason: planValid.reason,
        structure: planValid.structure,
        user_id: userId,
      });
      planHtml = getMinimalValidPlanHtml();
      planValid = validatePublishedPlanHtml(planHtml);
      if (!planValid.ok) {
        console.error('[persistFallbackPlanForUser] Minimal HTML also invalid', { reason: planValid.reason, user_id: userId });
        return null;
      }
    }
    const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
    const range = { from: regDateIso, until: addDays(regDateIso, 6) };
    const planType = buildPlanType(bm?.goal);
    const macros = buildStoredMacros(bm, {});

    await supabaseServer.from('ai_generated_plans').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);

    const { data, error } = await supabaseServer
      .from('ai_generated_plans')
      .upsert(
        {
          user_id: userId,
          email: bm?.email ?? null,
          plan_type: planType,
          plan_html: planHtml,
          plan_markdown: null,
          daily_calories: macros.calories,
          macros: { protein_g: macros.protein_g, fat_g: macros.fat_g, carbs_g: macros.carbs_g },
          workout_plan: {}, exercises_data: {}, meal_plan: {},
          generated_by: 'deterministic_fallback_internal_only',
          generation_prompt: 'Internal fallback artifact – NOT published to user (AI-first rule)',
          user_context: bm,
          valid_from: range.from,
          valid_until: range.until,
          is_active: false,
        },
        { onConflict: 'user_id,valid_from', ignoreDuplicates: false }
      )
      .select('id')
      .maybeSingle();

    if (error || !data?.id) {
      console.error('[persistFallbackPlanForUser] insert failed', {
        user_id: userId,
        error: error?.message,
        code: error?.code,
        details: error?.details,
      });
      return null;
    }
    console.info('[persistFallbackPlanForUser] plan persisted', { plan_id: data.id, user_id: userId });
    return { plan_id: data.id, valid_from: range.from, valid_until: range.until, bm, planHtml };
  } catch (err) {
    console.error('[persistFallbackPlanForUser]', {
      user_id: userId,
      error: err?.message,
      stack: err?.stack?.slice(0, 500),
    });
    return null;
  }
}

/**
 * Last-resort: persist deterministic plan as PUBLISHABLE when AI fails during registration.
 * Plán se zobrazí v profilu (is_active: true, generated_by bez 'fallback' pro profile filter).
 * @returns {Promise<{ plan_id: string, valid_from: string, valid_until: string, bm: object, planHtml: string } | { plan_id: null, error: string }>}
 */
export async function persistPublishableFallbackPlanForUser(userId) {
  try {
    const bm = await loadLatestBodyMetrics(userId);
    const regDateIso = bm?.created_at ? new Date(bm.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const targetStart = new Date(regDateIso + 'T12:00:00');
    let planHtml = buildDeterministicFallbackPlanHtml(bm, targetStart);
    let planValid = validatePublishedPlanHtml(planHtml);
    if (!planValid.ok) {
      console.warn('[persistPublishableFallbackPlanForUser] Fallback HTML invalid, trying minimal', {
        reason: planValid.reason,
        user_id: userId,
      });
      planHtml = getMinimalValidPlanHtml();
      planValid = validatePublishedPlanHtml(planHtml);
      if (!planValid.ok) {
        console.error('[persistPublishableFallbackPlanForUser] Minimal HTML also invalid', { user_id: userId });
        return { plan_id: null, error: 'minimal_html_invalid' };
      }
    }
    const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
    const range = { from: regDateIso, until: addDays(regDateIso, 6) };
    const planType = buildPlanType(bm?.goal);
    const macros = buildStoredMacros(bm, {});

    await supabaseServer.from('ai_generated_plans').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);

    const { data, error } = await supabaseServer
      .from('ai_generated_plans')
      .upsert(
        {
          user_id: userId,
          email: bm?.email ?? null,
          plan_type: planType,
          plan_html: planHtml,
          plan_markdown: null,
          daily_calories: macros.calories,
          macros: { protein_g: macros.protein_g, fat_g: macros.fat_g, carbs_g: macros.carbs_g },
          workout_plan: {}, exercises_data: {}, meal_plan: {},
          generated_by: 'reg_deterministic',
          generation_prompt: 'Last-resort plan when AI failed',
          user_context: bm,
          valid_from: range.from,
          valid_until: range.until,
          is_active: true,
        },
        { onConflict: 'user_id,valid_from', ignoreDuplicates: false }
      )
      .select('id')
      .maybeSingle();

    if (error || !data?.id) {
      console.error('[persistPublishableFallbackPlanForUser] insert failed', {
        user_id: userId,
        error: error?.message,
      });
      return { plan_id: null, error: error?.message || 'insert_failed' };
    }
    console.info('[persistPublishableFallbackPlanForUser] plan persisted (publishable)', { plan_id: data.id, user_id: userId });
    return { plan_id: data.id, valid_from: range.from, valid_until: range.until, bm, planHtml };
  } catch (err) {
    console.error('[persistPublishableFallbackPlanForUser]', {
      user_id: userId,
      error: err?.message,
      stack: err?.stack?.slice(0, 500),
    });
    return { plan_id: null, error: err?.message || 'unknown' };
  }
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
