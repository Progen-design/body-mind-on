/**
 * lib/unifiedPlanPipeline.js
 * JEDINÝ ORCHESTRÁTOR pro generování plánů.
 * Všechny vstupy (registrace, preference, next-week, assistant-intake) vedou sem.
 *
 * Flow:
 *   body_metrics → planInput → generateStructuredPlan (OpenAI JSON → Spoonacular → wger)
 *   → structured validators (optional)
 *   → renderPlanHtmlFromStructured (jídla + trénink v HTML/JSON)
 *   → persist + e-mail (trénink v těle e-mailu dle lib/planOutputMode.js; výchozí nutrition_training)
 *
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */

import { supabaseServer } from './supabaseServer';
import { sanitizeRecipeMealMismatchesInPlan, normalizeWorkoutExerciseDurationsInPlan } from './planDataIntegrity';
import { applyWorkoutDurationMinutesToPlan } from './workoutPlanScaler';
import { generateStructuredPlan } from './services/planOrchestrator';
import { bodyMetricsToPlanInput } from './bodyMetricsToPlanInput';
import { renderPlanHtmlFromStructured } from './planRenderer';
import { validateStructuredPlan } from './validation/structuredPlanValidators';
import { sendPlanEmail } from './mail';
import { stripPlanMediaAttrsFromHtml } from './emailTemplates';
import { addCalendarDaysIsoPrague, calendarDateIsoInPrague } from './czechCalendar';
import { getDefaultLoginUrl } from './siteUrls.js';
import { safeLog } from './safeLog';
import { buildDayHeadingOverridesFromStructuredPlan } from './planDayHeadingFormat.js';
import { isSpoonacularRegistrationCompressEnabled } from './spoonacularQuotaGate';

/**
 * // FIX (a4e44f9+): konkrétní feedback pro GPT při retry po nízkých denních kcal (validátor v CS).
 * @param {string[]} errors
 * @returns {string|null}
 */
function buildCalorieRegenPromptExtraFromValidationErrors(errors) {
  const list = Array.isArray(errors) ? errors : [];
  const line = list.find((e) => typeof e === 'string' && e.includes('součet kalorií'));
  if (!line) return null;
  const dayMatch = line.match(/^(.+?): součet kalorií z jídel je (\d+) kcal/);
  if (!dayMatch) return null;
  const dayName = dayMatch[1].trim();
  const actualKcal = parseInt(dayMatch[2], 10);
  const targetMatch = line.match(/cíle (\d+) kcal/);
  const targetKcal = targetMatch ? parseInt(targetMatch[1], 10) : NaN;
  if (!Number.isFinite(actualKcal) || !Number.isFinite(targetKcal) || targetKcal < 800) return null;
  const minK = Math.round(targetKcal * 0.85);
  const maxK = Math.round(targetKcal * 1.1);
  const deficit = Math.max(0, minK - actualKcal);
  return [
    `PŘEDCHOZÍ POKUS SELHAL: ${dayName} měl jen ${actualKcal} kcal (cíl ${targetKcal} kcal, minimum 85 % = ${minK} kcal).`,
    deficit > 0 ? `Chybí zhruba ${deficit} kcal do minima dne.` : 'Součet je těsně pod prahem — uprav porce.',
    `OPRAVA: (1) Přidej ${dayName} silný snack 350–500 kcal (např. Greek jogurt + ořechy + med; toast + avokádo + vejce), NEBO (2) zvětši hlavní jídla o 30–50 % (více masa/obilovin).`,
    `Cíl pro ${dayName}: celkem ${minK}–${maxK} kcal ze Spoonacular součtu po celý den.`,
  ].join(' ');
}

/**
 * Jediný vstupní bod pro generování plánu.
 *
 * @param {object} input - { bm: body_metrics, user_id?, email?, validFrom?, validUntil?, mealsOnly?, useOpenAI?, allowLiveSpoonacular? } — živý Spoonacular jen při `allowLiveSpoonacular: true` (nastavuje pipeline u úkolu initial_plan).
 * Vždy plné ověření Spoonacular/wger (žádný „rychlý“ režim – shoda s reálnými daty).
 * @returns {Promise<{
 *   ok: boolean,
 *   planJson?: object,
 *   planHtml?: string,
 *   valid_from?: string,
 *   valid_until?: string,
 *   generation_source?: string,
 *   _diagnostics?: object,
 *   validation?: object,
 *   error?: string
 * }>}
 */
export async function runUnifiedPlanPipeline(input) {
  const bm = input?.bm ?? input?.body_metrics ?? input;
  if (!bm || typeof bm !== 'object') {
    return { ok: false, error: 'Chybí body_metrics' };
  }

  const planNorm = bodyMetricsToPlanInput(bm);
  const validFromOverride = input?.validFrom ?? input?.valid_from ?? null;
  const validUntilOverride = input?.validUntil ?? input?.valid_until ?? null;
  const useOpenAI = input?.useOpenAI !== false;
  const mealsOnly = input?.mealsOnly === true;
  safeLog('unified_pipeline_start', {
    userId: bm?.user_id ?? null,
    useOpenAI,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    meals_only: mealsOnly,
  });
  const pipeT0 = Date.now();

  let memoryCtx = { summary: '', itemsUsed: 0, truncated: false };
  if (bm?.user_id) {
    const { buildPlanMemoryContext } = await import('./services/planMemoryContext');
    memoryCtx = await buildPlanMemoryContext(String(bm.user_id));
  }

  /** Plné bm + planNorm; _coach_memory_* jen pro GPT / logy, nepersistovat do DB jako součást bm. */
  const orchestratorBody = { ...bm, ...planNorm };
  orchestratorBody._coach_memory_meta = {
    itemsUsed: memoryCtx.itemsUsed,
    truncated: memoryCtx.truncated === true,
  };
  if (memoryCtx.summary) {
    orchestratorBody._coach_memory_summary = memoryCtx.summary;
  }

  const genOpts = {
    useOpenAI,
    requestId: input?.requestId ?? `req_${Date.now()}`,
    validFrom: validFromOverride,
    validUntil: validUntilOverride,
    mealsOnly,
    allowLiveSpoonacular: input?.allowLiveSpoonacular === true,
  };

  const postProcessStructuredPlan = (p) => {
    sanitizeRecipeMealMismatchesInPlan(p);
    normalizeWorkoutExerciseDurationsInPlan(p);
    applyWorkoutDurationMinutesToPlan(p, Number(bm?.workout_duration_min) || 60);
  };

  try {
    // 1) Structured plan (OpenAI → Spoonacular → wger)
    let planResult = await generateStructuredPlan(orchestratorBody, genOpts);

    if (!planResult?.ok || !planResult.days) {
      return {
        ok: false,
        error: 'Structured plan generation failed',
        _diagnostics: planResult?._diagnostics,
      };
    }

    postProcessStructuredPlan(planResult);

    // 2) Structured validation (JSON-level); při příliš nízkých denních kcal jeden nový pokus s přísným promptem
    let validation = await validateStructuredPlan(planResult, bm);
    const calorieTooLow = (validation?.errors ?? []).some(
      (e) => typeof e === 'string' && e.includes('součet kalorií')
    );
    if (
      calorieTooLow &&
      !orchestratorBody._calorie_regen_attempted &&
      !isSpoonacularRegistrationCompressEnabled()
    ) {
      orchestratorBody._calorie_regen_attempted = true;
      const specific = buildCalorieRegenPromptExtraFromValidationErrors(validation?.errors);
      orchestratorBody._plan_prompt_extra =
        specific ||
        'Předchozí výstup: alespoň jeden den měl součet kalorií ze Spoonacular jídel pod 72 % calories_per_day. Znovu sestav meal_plan tak, aby každý den měl součet kalorií mezi 85 % a 115 % cíle. Přidej type snack tam, kde jsou jen 3 jídla a cíl je vysoký; vol kaloričtější dotazy (např. beef stew, pasta chicken, grilled chicken rice).';
      planResult = await generateStructuredPlan(orchestratorBody, genOpts);
      delete orchestratorBody._plan_prompt_extra;
      if (!planResult?.ok || !planResult.days) {
        return {
          ok: false,
          error: 'Structured plan generation failed (calorie retry)',
          _diagnostics: planResult?._diagnostics,
        };
      }
      postProcessStructuredPlan(planResult);
      validation = await validateStructuredPlan(planResult, bm);
    } else {
      delete orchestratorBody._plan_prompt_extra;
    }

    if (validation && !validation.ok && validation.hardFail) {
      return {
        ok: false,
        error: validation.reason ?? 'Plan validation failed',
        validation,
      };
    }

    // 3) Render HTML from structured JSON
    const planHtml = renderPlanHtmlFromStructured(planResult, bm);

    safeLog('unified_pipeline_ok', {
      userId: bm?.user_id ?? null,
      duration_ms: Date.now() - pipeT0,
      generation_source: planResult._diagnostics?.generation_source ?? null,
      meals_only: planResult._diagnostics?.meals_only === true,
      workouts_resolve_source: planResult._diagnostics?.workouts_resolve_source ?? null,
      spoonacular_requests_total: planResult._diagnostics?.spoonacular_requests_total ?? null,
      memory_items_used: memoryCtx.itemsUsed,
      memory_context_chars: memoryCtx.summary ? memoryCtx.summary.length : 0,
      memory_truncated: memoryCtx.truncated === true,
    });

    return {
      ok: true,
      planJson: planResult,
      planHtml,
      valid_from: planResult.valid_from,
      valid_until: planResult.valid_until,
      targets: planResult.targets,
      generation_source: planResult._diagnostics?.generation_source ?? 'openai',
      _diagnostics: planResult._diagnostics,
      validation: validation ?? null,
    };
  } catch (err) {
    const msg = err?.message ?? String(err);
    safeLog('unified_pipeline_error', {
      userId: bm?.user_id ?? null,
      duration_ms: Date.now() - pipeT0,
      error: msg.slice(0, 240),
    });
    console.error('[unifiedPlanPipeline]', msg, err?.stack?.slice?.(0, 300));
    return {
      ok: false,
      error: msg,
    };
  }
}

function buildPlanType(goal) {
  if (goal === 'redukce') return 'redukce';
  if (goal === 'nabirani_svaly') return 'nabirani';
  return 'udrzovani';
}

/**
 * Persistuje plán z unified pipeline do ai_generated_plans.
 * @param {object} pipelineResult - výstup runUnifiedPlanPipeline
 * @param {object} bm - body_metrics
 * @param {object} [opts] - { generatedBy?, planType?, deactivateOld? }
 * @returns {Promise<{ plan_id?: string, valid_from?: string, valid_until?: string, error?: string }>}
 */
export async function persistPlanFromUnified(pipelineResult, bm, opts = {}) {
  if (!pipelineResult?.ok || !pipelineResult.planHtml) {
    return { error: `Invalid pipeline result: ${pipelineResult?.error ?? 'no html'}` };
  }
  const userId = bm?.user_id ?? null;
  const email = bm?.email ?? null;
  const planType = opts.planType ?? buildPlanType(bm?.goal);
  const targets = pipelineResult.targets ?? pipelineResult.planJson?.targets ?? {};
  const generatedBy = opts.generatedBy ?? 'unified-pipeline';

  const macros = {
    // Bez zaokrouhlení na 50: daily_calories musí přesně odpovídat calories_target z registrace.
    calories: Math.round(Number(targets.calories_per_day) || 2200),
    protein_g: Number(targets.protein_g) || 120,
    fat_g: Number(targets.fat_g) || 65,
    carbs_g: Number(targets.carbs_g) || 220,
  };

  const planHtmlClean = stripPlanMediaAttrsFromHtml(String(pipelineResult.planHtml || '').trim());
  const insertPayload = {
    user_id: userId,
    email,
    plan_type: planType,
    plan_html: planHtmlClean,
    daily_calories: macros.calories,
    macros: { protein_g: macros.protein_g, fat_g: macros.fat_g, carbs_g: macros.carbs_g },
    workout_plan: {},
    exercises_data: {},
    meal_plan: {},
    generated_by: generatedBy,
    generation_prompt: 'Unified structured pipeline (OpenAI → Spoonacular → wger)',
    user_context: bm,
    valid_from: pipelineResult.valid_from ?? calendarDateIsoInPrague(new Date()),
    valid_until:
      pipelineResult.valid_until ??
      addCalendarDaysIsoPrague(pipelineResult.valid_from ?? calendarDateIsoInPrague(new Date()), 6),
    is_active: true,
  };
  if (pipelineResult.planJson && typeof pipelineResult.planJson === 'object') {
    insertPayload.structured_plan_json = pipelineResult.planJson;
  }

  if (opts.deactivateOld !== false && userId) {
    await supabaseServer.from('ai_generated_plans').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);
  }

  const upsertOpts = { onConflict: 'user_id,valid_from', ignoreDuplicates: false };
  const { data, error } = await supabaseServer
    .from('ai_generated_plans')
    .upsert(insertPayload, upsertOpts)
    .select('id')
    .maybeSingle();
  if (error) {
    if (/structured_plan_json|does not exist/i.test(error.message)) {
      delete insertPayload.structured_plan_json;
      const retry = await supabaseServer
        .from('ai_generated_plans')
        .upsert(insertPayload, upsertOpts)
        .select('id')
        .maybeSingle();
      if (retry.error) return { error: retry.error.message };
      return { plan_id: retry.data?.id, valid_from: insertPayload.valid_from, valid_until: insertPayload.valid_until };
    }
    return { error: error.message };
  }
  return { plan_id: data?.id, valid_from: insertPayload.valid_from, valid_until: insertPayload.valid_until };
}

/**
 * Kompletní flow: generate + persist + email.
 * Thin wrapper pro profile-preferences, generate-plan-next-week, assistant-intake.
 *
 * @param {string} email - e-mail uživatele
 * @param {object} [options] - { bmOverride?, validFrom?, validUntil?, skipEmail?, planChangeContext?, loginUrl?, generatedBy?, deactivateOld?, ... }
 * @returns {Promise<{ ok: boolean, message?: string, plan_id?: string, valid_from?: string, valid_until?: string, days_count?: number, plan_html_length?: number }>}
 */
export async function generatePlanForEmailViaUnified(email, options = {}) {
  let bm = options.bmOverride ?? null;
  if (!bm) {
    const { data: rows, error } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !rows?.length) return { ok: false, message: 'Žádné metriky pro tento e-mail.' };
    bm = { ...rows[0], email };
  } else {
    bm = { ...bm, email: bm.email ?? email };
  }

  const pipelineResult = await runUnifiedPlanPipeline({
    bm,
    validFrom: options.validFromOverride ?? options.validFrom ?? null,
    validUntil: options.validUntilOverride ?? options.validUntil ?? null,
    mealsOnly: options.mealsOnly === true,
    useOpenAI: true,
  });

  if (!pipelineResult?.ok) {
    return { ok: false, message: pipelineResult?.error ?? 'Nepodařilo vygenerovat plán.' };
  }

  const persistResult = await persistPlanFromUnified(pipelineResult, bm, {
    generatedBy: options.generatedBy ?? 'unified-pipeline-email',
    deactivateOld: options.deactivateOld !== false,
  });
  if (persistResult?.error) {
    return { ok: false, message: `Chyba při ukládání: ${persistResult.error}` };
  }

  if (!options.skipEmail && email) {
    const sendOpts = {
      loginPassword: options.loginPassword ?? null,
      loginUrl: options.loginUrl ?? getDefaultLoginUrl(),
      existingAccount: options.existingAccount === true,
      loginUnavailable: options.loginUnavailable === true,
      userChosePassword: options.userChosePassword === true,
      planChangeContext: options.planChangeContext === true,
      firstName: bm?.name ?? null,
      planOutputMode: options.planOutputMode,
      bodyMetrics: bm,
      dayHeadingOverrides: buildDayHeadingOverridesFromStructuredPlan(
        pipelineResult.planJson,
        pipelineResult.valid_from
      ),
      structuredPlanJson: pipelineResult.planJson ?? null,
      validFrom: pipelineResult.valid_from ?? persistResult.valid_from ?? null,
      planId: persistResult?.plan_id ?? persistResult?.planId ?? null,
    };
    const sendResult = await sendPlanEmail(email, pipelineResult.planHtml, sendOpts);
    if (!sendResult?.ok) {
      return { ok: false, message: sendResult?.message ?? 'Odeslání e-mailu selhalo.' };
    }
    if (sendResult?.ok && persistResult?.plan_id) {
      const { error: emailFlagErr } = await supabaseServer
        .from('ai_generated_plans')
        .update({ email_sent: true })
        .eq('id', persistResult.plan_id);
      if (emailFlagErr) {
        console.warn('[generatePlanForEmailViaUnified] email_sent flag update failed', {
          plan_id: persistResult.plan_id,
          error: emailFlagErr.message,
        });
      }
    }
  }

  const daysCount = Array.isArray(pipelineResult.planJson?.days)
    ? pipelineResult.planJson.days.length
    : null;
  const planHtmlLen = pipelineResult.planHtml ? String(pipelineResult.planHtml).length : 0;

  return {
    ok: true,
    message: options.skipEmail ? 'Plán přegenerován.' : 'Plán vygenerován a odeslán.',
    plan_id: persistResult.plan_id ?? null,
    valid_from: persistResult.valid_from ?? null,
    valid_until: persistResult.valid_until ?? null,
    days_count: daysCount,
    plan_html_length: planHtmlLen,
  };
}
