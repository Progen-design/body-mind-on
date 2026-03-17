// /pages/api/body-metrics.js
// CORE FLOW: Registrace musí vést k reálnému AI výsledku (body_metrics → ai_tasks → ai_generated_plans → zobrazení + e-mail).
// ASYNC-ONLY: insert body_metrics → createInitialAITasks → enqueueAIEvent → triggerImmediateDecision → trigger scheduler (fire-and-forget).
// Registrace NIKDY nečeká na AI – vždy vrátí processing. Plán generuje scheduler (cron nebo triggered fetch).
// Viz docs/CORE_FLOW_REGISTRACE_AI_PLAN.md, docs/PLAN_ALWAYS_FROM_AI_REFACTOR.md
import { supabaseServer } from '../../lib/supabaseServer';
import {
  PROGRAMS,
  validateHeightCm,
  validateWeightKg,
  validateAge,
  validatePassword,
} from '../../lib/registrationRules';
import { createAuthUserIfNew } from '../../lib/authHelpers';
import { createInitialAITasks } from '../../lib/createInitialAITasks';
import { isValidHabitId, POSITIVE_HABITS } from '../../lib/habits';
import { normalizeOccupation, normalizeActivity, normalizeStress, normalizeGoal, normalizeFrequency, getWeeklySessions } from '../../lib/preferenceConstants';
import { enqueueAIEvent, triggerImmediateDecision } from '../../lib/aiEvents';
import { writeOnboardingEvent } from '../../lib/onboardingMetrics';

export default async function handler(req, res) {
  const registrationStartedAt = new Date().toISOString();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const b = req.body || {};

    // Strava a omezení – volitelná pole (null při prázdných)
    const dietType = b.diet_type?.trim() || null;
    const dietaryRestrictions = b.dietary_restrictions?.trim() || null;
    const foodsToAvoid = b.foods_to_avoid?.trim() || null;
    const dietLabels = {
      vegetarian: 'Vegetarián',
      vegan: 'Vegan',
      gluten_free: 'Bez lepku',
      lactose_free: 'Bez laktózy',
      paleo: 'Paleo',
      low_carb: 'Nízkosacharidová',
      other: 'Jiné',
    };
    const dietLabel = dietType && dietLabels[dietType] ? dietLabels[dietType] : '';
    const notesParts = [];
    if (dietLabel) notesParts.push('Typ stravy: ' + dietLabel);
    if (dietaryRestrictions) notesParts.push('Co nejí: ' + dietaryRestrictions);
    if (foodsToAvoid) notesParts.push('Potraviny k vynechání: ' + foodsToAvoid);
    const notesFinal = notesParts.length ? notesParts.join('. ') : (b.notes?.trim() || null);

    const wd = b.workout_days;
    const workoutDaysStr = Array.isArray(wd) && wd.length > 0
      ? wd.filter((n) => Number.isFinite(Number(n)) && n >= 0 && n <= 6).join(',')
      : null;
    const payload = {
      email: b.email?.trim()?.toLowerCase() || null,
      name: b.name?.trim() || null,
      gender: normalizeGender(b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height || b.height_cm),
      weight_kg: toNum(b.weight || b.weight_kg),
      activity: normalizeActivity(b.activity),
      stress_level: normalizeStress(b.stress || b.stress_level),
      occupation: normalizeOccupation(b.worktype || b.occupation),
      goal: normalizeGoal(b.goal),
      freq_choice: normalizeFrequency(b.frequency || b.freq_choice),
      weekly_sessions_user: getWeeklySessions(b.frequency || b.freq_choice),
      workout_days: workoutDaysStr,
      diet_type: dietType || null,
      dietary_restrictions: dietaryRestrictions || null,
      foods_to_avoid: foodsToAvoid || null,
      notes: notesFinal,
      program: PROGRAMS.includes(b.program) ? b.program : 'START',
      created_at: new Date().toISOString(),
      user_id: null,
    };

    if (!payload.email) {
      return res.status(400).json({ error: 'E-mail je povinný.' });
    }
    const password = typeof b.password === 'string' ? b.password.trim() : '';
    const passwordValidation = validatePassword(password);
    if (password && !passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error || 'Heslo musí mít alespoň 6 znaků.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      return res.status(400).json({ error: 'Zadej platnou e-mailovou adresu.' });
    }

    if (!payload.height_cm || !payload.weight_kg) {
      return res.status(400).json({ error: 'Chybí výška nebo váha.' });
    }
    const heightCheck = validateHeightCm(payload.height_cm);
    if (!heightCheck.valid) return res.status(400).json({ error: heightCheck.error });
    const weightCheck = validateWeightKg(payload.weight_kg);
    if (!weightCheck.valid) return res.status(400).json({ error: weightCheck.error });
    const ageCheck = validateAge(payload.age);
    if (!ageCheck.valid) return res.status(400).json({ error: ageCheck.error });

    const authResult = await createAuthUserIfNew(payload.email, payload.name, password || undefined);
    let loginPassword = null;
    let existingAccount = false;
    let userChosePassword = authResult.userChosePassword === true;

    if (authResult.error) {
      const isAlready = authResult.error.toLowerCase().includes('already') || authResult.error.toLowerCase().includes('registered');
      if (isAlready) {
        return res.status(400).json({
          error: 'S tímto e-mailem už máš účet. Přihlas se nebo obnov heslo na app.bodyandmindon.cz.',
        });
      }
      // Auth selhalo, ale registraci nefailujeme – uložíme data bez user_id a vrátíme loginUnavailable
      console.info('[body-metrics] Auth failed (no user_id), saving body_metrics without user_id');
      payload.user_id = null;
      loginPassword = null;
      existingAccount = false;
      userChosePassword = false;
    } else {
      payload.user_id = authResult.userId;
      loginPassword = authResult.password ?? null;
      existingAccount = authResult.existing === true;
      userChosePassword = authResult.userChosePassword === true;
    }

    const { data: insertedRows, error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([payload])
      .select('id');

    if (dbErr) {
      console.error('[body-metrics] DB insert failed:', dbErr.message);
      throw new Error(dbErr.message);
    }

    const bodyMetricsId = insertedRows?.[0]?.id ?? null;
    console.info('[body-metrics] body_metrics inserted', payload.user_id ? `user_id=${payload.user_id} body_metrics_id=${bodyMetricsId}` : `body_metrics_id=${bodyMetricsId} (no user_id)`);

    const loginUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '') + '/login';
    const emailOptions = {
      loginPassword,
      loginUrl,
      existingAccount,
      loginUnavailable: payload.user_id == null,
      userChosePassword,
    };

    let planSent = false;
    const planPending = true; // ASYNC-ONLY: vždy processing – plán dokončí scheduler
    let schedulerTriggered = false;
    let initialPlanTaskStatus = 'pending';
    let initialPlanSummary = null;
    let initialPlanValidationWarning = null;
    const accountCreated = payload.user_id != null;

    // ASYNC-ONLY: vytvoř tasky, spusť scheduler (fire-and-forget), vždy vrať processing
    if (payload.user_id) {
      try {
        const taskResult = await createInitialAITasks(payload.user_id, emailOptions);
        console.info('[body-metrics] initial tasks', { user_id: payload.user_id, tasksCreated: taskResult?.tasksCreated ?? true });
      } catch (taskErr) {
        console.error('[body-metrics] createInitialAITasks failed', { user_id: payload.user_id, error: taskErr?.message });
        throw taskErr;
      }
      await enqueueAIEvent('user_registered', payload.user_id, { program: payload.program || 'START' });
      await triggerImmediateDecision(payload.user_id);

      // Načtení tasku pro diagnostiku (status bude vždy pending v tomto bodu)
      const { data: taskRow } = await supabaseServer
        .from('ai_tasks')
        .select('id, status, result')
        .eq('user_id', payload.user_id)
        .eq('agent_slug', 'trainer')
        .eq('task_type', 'initial_plan')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      initialPlanTaskStatus = taskRow?.status ?? 'pending';

      // Trigger scheduler – AWAIT s timeoutem (Vercel serverless zamrzne po response;
      // fire-and-forget fetch NENÍ garantován – request může být nikdy neodeslán)
      const runSchedulerUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '') + '/api/ai/run-scheduler';
      const cronSecret = process.env.CRON_SECRET || process.env.AI_SCHEDULER_SECRET;
      if (cronSecret && runSchedulerUrl) {
        schedulerTriggered = true;
        const SCHEDULER_TRIGGER_TIMEOUT_MS = 2500; // 2.5 s – stačí na odeslání requestu; run-scheduler běží v samostatné invokaci
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SCHEDULER_TRIGGER_TIMEOUT_MS);
        try {
          const triggerRes = await fetch(runSchedulerUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cronSecret}` },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (triggerRes.ok) {
            console.info('[body-metrics] scheduler triggered ok', { status: triggerRes.status });
          } else {
            console.warn('[body-metrics] scheduler trigger non-ok', { status: triggerRes.status, url: runSchedulerUrl });
          }
        } catch (triggerErr) {
          clearTimeout(timeoutId);
          const isAbort = triggerErr?.name === 'AbortError' || /aborted|abort/i.test(triggerErr?.message || '');
          if (isAbort) {
            console.info('[body-metrics] scheduler trigger sent (timeout – run-scheduler běží na pozadí)');
          } else {
            console.warn('[body-metrics] scheduler trigger fetch failed:', triggerErr?.message);
          }
        }
      } else {
        console.warn('[body-metrics] CRON_SECRET missing – scheduler nebude spuštěn. Cron /api/ai/run-scheduler zpracuje pending tasky.');
      }
    }

    // Uložit tier členství do tabulky memberships (upsert – aktualizovat pokud existuje)
    if (payload.user_id) {
      const program = payload.program || 'START';
      const startedAt = payload.created_at || new Date().toISOString();
      const isStart = program === 'START';
      const trialEndsAt = isStart
        ? new Date(new Date(startedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const { error: memErr } = await supabaseServer
        .from('memberships')
        .upsert([{
          user_id: payload.user_id,
          tier: program,
          status: isStart ? 'trial' : 'active',
          started_at: startedAt,
          trial_ends_at: trialEndsAt,
          notes: `Registrace přes ${program} formulář`,
          updated_at: new Date().toISOString(),
        }], { onConflict: 'user_id' });
      if (memErr) {
        console.warn('[body-metrics] memberships upsert:', memErr.message);
      } else {
        console.info('[body-metrics] membership tier saved', `user_id=${payload.user_id}`);
      }
    }

    if (payload.user_id && Array.isArray(b.selected_habits) && b.selected_habits.length > 0) {
      const validHabits = b.selected_habits
        .filter((id) => typeof id === 'string' && isValidHabitId(id.trim()))
        .map((id, i) => ({
          user_id: payload.user_id,
          habit_id: String(id).trim(),
          is_positive: POSITIVE_HABITS.some((p) => p.id === String(id).trim()),
          sort_order: i,
        }));
      if (validHabits.length > 0) {
        const { error: uhErr } = await supabaseServer.from('user_habits').insert(validHabits);
        if (uhErr) console.warn('[body-metrics] user_habits insert:', uhErr.message);
      }
    }

    const pendingMsg = 'Účet je vytvořen. Plán se dokončuje na pozadí – za chvíli přijde e-mail a v profilu uvidíš plán.';
    // ASYNC-ONLY: vždy processing – plán dokončí scheduler, uživatel nikdy nevidí fail z registrace
    const plan_state = accountCreated ? 'processing' : 'unknown';
    const message = accountCreated ? pendingMsg : 'Údaje byly uloženy. Vytvoření přihlašovacího účtu se nezdařilo – pro přístup do profilu nás kontaktuj na info@bodyandmindon.cz.';
    const finalResponseReason = 'plan_still_processing';
    const onboardingResult = 'processing';

    let initialPlanTaskId = null;
    let initialPlanTaskCreatedAt = null;
    let initialPlanTaskCompletedAt = null;
    let savedPlanId = null;
    let generationSource = null;
    let trainerResult = null;
    if (payload.user_id) {
      const { data: taskRow } = await supabaseServer
        .from('ai_tasks')
        .select('id, status, created_at, processed_at, result, last_error')
        .eq('user_id', payload.user_id)
        .eq('agent_slug', 'trainer')
        .eq('task_type', 'initial_plan')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (taskRow) {
        initialPlanTaskId = taskRow.id;
        initialPlanTaskCreatedAt = taskRow.created_at ?? null;
        initialPlanTaskCompletedAt = taskRow.processed_at ?? null;
        generationSource = taskRow.result?.generation_source ?? taskRow.result?.final_publish_source ?? null;
        trainerResult = taskRow.result;
      }
    }
    const savedPlanExists = false; // ASYNC-ONLY: plán ještě neexistuje v okamžiku odpovědi

    if (payload.user_id) {
      writeOnboardingEvent({
        userId: payload.user_id,
        bodyMetricsId,
        registrationStartedAt,
        registrationCompletedAt: new Date().toISOString(),
        initialPlanTaskId,
        initialPlanTaskCreatedAt,
        initialPlanTaskCompletedAt,
        onboardingResult,
        finalPublishSource: generationSource ?? null,
        generationSource,
        lastResortRan: false,
        lastResortFailed: false,
        savedPlanId,
        savedPlanExists,
        planState: plan_state,
        planSent: false,
        planPending: true,
        finalResponseReason,
      }).catch((err) => console.warn('[body-metrics] writeOnboardingEvent failed:', err?.message));
    }

    const response = {
      ok: true,
      planSent: false,
      planPending: true,
      plan_state,
      loginUnavailable: !accountCreated,
      message,
    };
    if (accountCreated) {
      response.hasUserId = true;
      response.schedulerTriggered = schedulerTriggered;
      response.initialPlanTaskStatus = initialPlanTaskStatus;
      response.initialPlanSummary = initialPlanSummary ?? undefined;
      response.initialPlanValidationWarning = initialPlanValidationWarning ?? undefined;
      response._diagnostics = {
        task_created: accountCreated,
        async_only: true,
        scheduler_triggered: schedulerTriggered,
        initial_plan_task_status: initialPlanTaskStatus ?? undefined,
        initial_plan_task_id: initialPlanTaskId ?? undefined,
        initial_plan_task_created_at: initialPlanTaskCreatedAt ?? undefined,
        initial_plan_task_completed_at: initialPlanTaskCompletedAt ?? undefined,
        plan_state,
        plan_sent: false,
        plan_pending: true,
        final_response_reason: finalResponseReason,
        onboarding_result: onboardingResult,
        saved_plan_id: savedPlanId ?? undefined,
        saved_plan_exists: savedPlanExists ?? undefined,
        generation_source: generationSource ?? undefined,
        trainer_task_created: !!initialPlanTaskId,
        trainer_task_completed: false,
        trainer_task_failed: false,
        trainer_task_dlq: false,
        trainer_generation_source: trainerResult?.generation_source ?? trainerResult?.final_publish_source ?? undefined,
        trainer_output_exists: !!(trainerResult?.plan_id),
        fallback_used: undefined,
        email_sent: false,
        plan_saved: false,
        plan_saved_id: savedPlanId ?? undefined,
      };
    } else {
      response.hasUserId = false;
    }
    return res.status(200).json(response);

  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(500).json({
      error: e.message || 'Neočekávaná chyba při zpracování požadavku.'
    });
  }
}

/* ==============================
   Pomocné funkce
============================== */

/** Převádí chyby z auth (Supabase) na srozumitelné české hlášky pro uživatele. */
function toUserFriendlyAuthError(message) {
  if (!message || typeof message !== 'string') return 'Nepodařilo se vytvořit účet. Zkontroluj údaje a zkus to znovu.';
  const m = message.toLowerCase();
  if (m.includes('password') && (m.includes('least') || m.includes('6') || m.includes('length')))
    return 'Heslo je příliš slabé. Zadej alespoň 6 znaků, lépe kombinaci písmen a číslic.';
  if (m.includes('weak') || m.includes('strength') || m.includes('secure'))
    return 'Heslo je příliš slabé. Zkus kombinaci písmen a číslic, alespoň 6 znaků.';
  if (m.includes('email') && (m.includes('invalid') || m.includes('valid')))
    return 'Zadej platnou e-mailovou adresu.';
  if (m.includes('already') || m.includes('registered')) return 'S tímto e-mailem už máš účet. Přihlas se nebo obnov heslo na app.bodyandmindon.cz.';
  if (isServerAuthConfigError(message))
    return 'Registrace je teď dočasně nedostupná kvůli nastavení serveru. Zkus to prosím za chvíli znovu.';
  return 'Nepodařilo se vytvořit účet. Zkontroluj údaje a zkus to znovu.';
}

function isServerAuthConfigError(message) {
  if (!message || typeof message !== 'string') return false;
  const m = message.toLowerCase();
  return (
    m.includes('invalid api key') ||
    m.includes('unauthorized') ||
    m.includes('not authorized') ||
    m.includes('service_role') ||
    m.includes('service role') ||
    m.includes('jwt') ||
    m.includes('permission denied') ||
    m.includes('user not allowed')
  );
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeGender(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  if (t === 'male' || t === 'female') return t;
  if (t.includes('muž') || t === 'm') return 'male';
  if (t.includes('žena') || t === 'f') return 'female';
  return null;
}
