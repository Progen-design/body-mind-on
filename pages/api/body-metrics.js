// /pages/api/body-metrics.js
// CORE FLOW: Registrace musí vést k reálnému AI výsledku (body_metrics → ai_tasks → ai_generated_plans → zobrazení + e-mail).
// SYNC: Registrace musí doručit plán (katalog nebo last-resort) v rámci Vercel 60s limitu.
// Viz docs/CORE_FLOW_REGISTRACE_AI_PLAN.md
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
import { runAIScheduler, runRegistrationCoachInline } from '../../lib/aiScheduler';
import {
  executeAITask,
  persistPublishableFallbackPlanForUser,
  isPlanEmailAlreadySent,
  tryClaimPlanEmailSend,
  releasePlanEmailSendClaim,
} from '../../lib/taskExecutors';
import { sendPlanEmail } from '../../lib/mail';
import { isValidHabitId, POSITIVE_HABITS } from '../../lib/habits';
import { normalizeOccupation, normalizeActivity, normalizeStress, normalizeGoal, normalizeFrequency, getWeeklySessions } from '../../lib/preferenceConstants';
import { enqueueAIEvent, triggerImmediateDecision } from '../../lib/aiEvents';
import { writeOnboardingEvent } from '../../lib/onboardingMetrics';
import { getDefaultLoginUrl } from '../../lib/siteUrls.js';
import { trainingEnvironmentNotesSuffix } from '../../lib/trainingEnvironment.js';
import { validateBirthDate } from '../../lib/bodyMetricsBirthDate.js';
import { calculateNutritionTargets } from '../../lib/nutritionTargets.js';

/** Vercel Hobby = 60s. Krátký poll; last-resort hned po execute, ne až na konci handleru. */
const PLAN_WAIT_TIMEOUT_MS = 8000;
const PLAN_WAIT_POLL_MS = 1500;

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
    const trainingEnvironment = ['gym', 'home_bodyweight', 'home_equipment'].includes(String(b.training_environment || '').trim())
      ? String(b.training_environment).trim()
      : null;
    const availableEquipment = trainingEnvironment === 'home_equipment' && Array.isArray(b.available_equipment)
      ? b.available_equipment.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (trainingEnvironment) {
      notesParts.push(trainingEnvironmentNotesSuffix(trainingEnvironment, availableEquipment));
    }
    const notesFinal = notesParts.length ? notesParts.join('. ') : (b.notes?.trim() || null);

    const wd = b.workout_days;
    const workoutDaysStr = Array.isArray(wd) && wd.length > 0
      ? wd.filter((n) => Number.isFinite(Number(n)) && n >= 0 && n <= 6).join(',')
      : null;
    const birthDateRaw = typeof b.birth_date === 'string' ? b.birth_date.trim() : '';
    let calculatedAge = null;
    if (birthDateRaw) {
      const birthValidation = validateBirthDate(birthDateRaw);
      if (!birthValidation.valid) {
        return res.status(400).json({ error: birthValidation.error || 'Neplatné datum narození.' });
      }
      if (birthValidation.age < 13 || birthValidation.age > 90) {
        return res.status(400).json({ error: 'Věk musí být mezi 13 a 90 lety.' });
      }
      calculatedAge = birthValidation.age;
    } else if (b.age != null && b.age !== '') {
      const ageFallback = toNum(b.age);
      const ageCheck = validateAge(ageFallback);
      if (!ageCheck.valid) return res.status(400).json({ error: ageCheck.error });
      calculatedAge = ageFallback;
    }

    const payload = {
      email: b.email?.trim()?.toLowerCase() || null,
      name: b.name?.trim() || null,
      gender: normalizeGender(b.gender),
      age: calculatedAge,
      birth_date: birthDateRaw || null,
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

    const nutritionTargets = calculateNutritionTargets({
      bodyMetrics: payload,
      goal: payload.goal,
      activity: payload.activity,
      workoutDays: payload.workout_days ? String(payload.workout_days).split(',') : null,
      planAdjustmentSignal: null,
    });
    payload.calories_target = nutritionTargets.calories_target;

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
    if (payload.age == null) {
      return res.status(400).json({ error: 'Datum narození je povinné.' });
    }

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

    // Datum narození z registrace uložit i do auth user_metadata (stejný source čte profil/nastavení).
    if (payload.user_id && birthDateRaw && authResult.existing !== true) {
      try {
        const { data: freshUser } = await supabaseServer.auth.admin.getUserById(payload.user_id);
        const currentMeta = freshUser?.user?.user_metadata || {};
        await supabaseServer.auth.admin.updateUserById(payload.user_id, {
          user_metadata: { ...currentMeta, birth_date: birthDateRaw, ...(payload.name ? { name: currentMeta.name || payload.name } : {}) },
        });
      } catch (metaErr) {
        console.warn('[body-metrics] birth_date user_metadata update failed:', metaErr?.message);
      }
    }

    // Existující účet: veřejný START formulář nesmí znovu vložit metriky ani spustit initial_plan (ten by přeskočil generování
    // a uživatel by viděl starý plán s blízkým valid_until). Přihlášení / obnova hesla je jediná bezpečná cesta.
    if (!authResult.error && authResult.existing === true) {
      return res.status(400).json({
        error:
          'Účet s tímto e-mailem už existuje. Přihlas se nebo si nech poslat odkaz k obnově hesla — registraci START se stejným e-mailem nelze opakovat.',
      });
    }

    let insertPayload = { ...payload };
    let insertedRows = null;
    let dbErr = null;
    ({ data: insertedRows, error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([insertPayload])
      .select('id'));

    if (dbErr && /birth_date|does not exist|column/i.test(dbErr.message || '')) {
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.birth_date;
      ({ data: insertedRows, error: dbErr } = await supabaseServer
        .from('body_metrics')
        .insert([fallbackPayload])
        .select('id'));
    }

    if (dbErr) {
      console.error('[body-metrics] DB insert failed:', dbErr.message);
      throw new Error(dbErr.message);
    }

    const bodyMetricsId = insertedRows?.[0]?.id ?? null;
    console.info('[body-metrics] body_metrics inserted', payload.user_id ? `user_id=${payload.user_id} body_metrics_id=${bodyMetricsId}` : `body_metrics_id=${bodyMetricsId} (no user_id)`);

    const loginUrl = getDefaultLoginUrl();
    const emailOptions = {
      loginPassword,
      loginUrl,
      existingAccount,
      loginUnavailable: payload.user_id == null,
      userChosePassword,
    };

    let planSent = false;
    let planPending = false;
    let initialPlanTaskStatus = 'pending';
    let initialPlanSummary = null;
    let initialPlanValidationWarning = null;
    let lastResortRan = false;
    let lastResortFailed = false;
    let lastResortError = null;
    let savedPlanId = null;
    let savedPlanExists = false;
    const accountCreated = payload.user_id != null;

    // SYNC: Plán musí být vždy vygenerován před odpovědí – čekáme na AI v rámci requestu
    if (payload.user_id) {
      try {
        const taskResult = await createInitialAITasks(payload.user_id, emailOptions, {
          spoonacularRegistrationOnly: true,
        });
        console.info('[body-metrics] initial tasks', { user_id: payload.user_id, tasksCreated: taskResult?.tasksCreated ?? true });
      } catch (taskErr) {
        console.error('[body-metrics] createInitialAITasks failed', { user_id: payload.user_id, error: taskErr?.message });
        throw taskErr;
      }
      await enqueueAIEvent('user_registered', payload.user_id, { program: payload.program || 'START' });
      await triggerImmediateDecision(payload.user_id);

      const { data: taskRow } = await supabaseServer
        .from('ai_tasks')
        .select('id, status, result')
        .eq('user_id', payload.user_id)
        .eq('agent_slug', 'trainer')
        .eq('task_type', 'initial_plan')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const runDirectExecute = async () => {
        const claimNow = new Date().toISOString();
        let claimRes = await supabaseServer
          .from('ai_tasks')
          .update({ status: 'processing', processing_started_at: claimNow })
          .eq('id', taskRow.id)
          .eq('status', 'pending')
          .select('id, user_id, agent_slug, task_type, payload')
          .maybeSingle();
        if (claimRes.error && /processing_started_at|does not exist|neexistuje/i.test(claimRes.error.message || '')) {
          claimRes = await supabaseServer
            .from('ai_tasks')
            .update({ status: 'processing' })
            .eq('id', taskRow.id)
            .eq('status', 'pending')
            .select('id, user_id, agent_slug, task_type, payload')
            .maybeSingle();
        }
        const t = claimRes.data;
        if (!t?.id) return false;
        const exec = await executeAITask(t);
        const hasPlanId = exec?.result?.outcome_type === 'plan_generated' && (exec?.result?.plan_id != null && exec?.result?.plan_id !== '');
        const ok = exec?.ok && (hasPlanId || exec?.result?.outcome_type !== 'plan_generated');
        await supabaseServer.from('ai_tasks').update({
          status: ok ? 'completed' : 'failed',
          result: exec?.result ?? {},
          processed_at: new Date().toISOString(),
          last_error: ok ? null : (exec?.ok && !hasPlanId ? 'Completed without plan_id' : null),
        }).eq('id', t.id);
        if (ok) {
          initialPlanTaskStatus = 'completed';
          planSent = exec?.result?.email_sent === true;
          initialPlanSummary = exec?.result?.summary ?? null;
          initialPlanValidationWarning = exec?.result?.validation_warning ?? null;
          return true;
        }
        return false;
      };

      if (taskRow?.id && taskRow?.status === 'pending') {
        console.info('[body-metrics] executing trainer/initial_plan', { task_id: taskRow.id });
        try {
          const ok = await runDirectExecute();
          console.info('[body-metrics] runDirectExecute result', { ok, initialPlanTaskStatus });
          if (!ok) {
            const sched = await runAIScheduler();
            console.info('[body-metrics] scheduler ran (trainer retry + coach)', sched);
            const { data: refetched } = await supabaseServer.from('ai_tasks').select('status, result').eq('id', taskRow.id).maybeSingle();
            if (refetched) {
              initialPlanTaskStatus = refetched.status;
              planSent = refetched.status === 'completed' && refetched?.result?.email_sent === true;
              initialPlanSummary = refetched?.result?.summary ?? null;
              initialPlanValidationWarning = refetched?.result?.validation_warning ?? null;
            }
            if (initialPlanTaskStatus === 'pending') {
              await runDirectExecute().catch(() => {});
            }
          }
        } catch (execErr) {
          console.warn('[body-metrics] direct execute failed', { error: execErr?.message, stack: execErr?.stack?.slice?.(0, 300) });
          await runAIScheduler().catch((schedErr) => console.warn('[body-metrics] scheduler catch', schedErr?.message));
          await runDirectExecute().catch((retryErr) => console.warn('[body-metrics] retry direct execute', retryErr?.message));
          await runAIScheduler().catch(() => {});
        }
      }

      if (initialPlanTaskStatus === 'pending' && taskRow?.id) {
        const pollStart = Date.now();
        while (Date.now() - pollStart < PLAN_WAIT_TIMEOUT_MS) {
          await new Promise((r) => setTimeout(r, PLAN_WAIT_POLL_MS));
          const { data: polled } = await supabaseServer.from('ai_tasks').select('status, result').eq('id', taskRow.id).maybeSingle();
          if (polled?.status === 'completed') {
            initialPlanTaskStatus = 'completed';
            planSent = polled?.result?.email_sent === true;
            initialPlanSummary = polled?.result?.summary ?? null;
            initialPlanValidationWarning = polled?.result?.validation_warning ?? null;
            break;
          }
          if (polled?.status === 'failed') {
            initialPlanTaskStatus = 'failed';
            break;
          }
        }
      }
      console.info('[body-metrics] initial_plan final status', initialPlanTaskStatus);

      // Last-resort hned po execute (před membership) — vejde se do Vercel 60s limitu
      if (initialPlanTaskStatus !== 'completed') {
        const { data: existingPlanRow } = await supabaseServer
          .from('ai_generated_plans')
          .select('id')
          .eq('user_id', payload.user_id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingPlanRow?.id) {
          savedPlanId = existingPlanRow.id;
          savedPlanExists = true;
          console.info('[body-metrics] active plan exists after task', { plan_id: savedPlanId });
        } else {
          try {
            let fallbackResult = await persistPublishableFallbackPlanForUser(payload.user_id);
            lastResortError = fallbackResult?.plan_id ? null : (fallbackResult?.error ?? null);
            if (!fallbackResult?.plan_id) {
              fallbackResult = await persistPublishableFallbackPlanForUser(payload.user_id);
              if (!lastResortError && !fallbackResult?.plan_id) lastResortError = fallbackResult?.error ?? null;
            }
            if (fallbackResult?.plan_id) {
              lastResortRan = true;
              savedPlanId = fallbackResult.plan_id;
              savedPlanExists = true;
              const fallbackPlanId = fallbackResult.plan_id ?? null;
              if (fallbackPlanId && (await isPlanEmailAlreadySent(fallbackPlanId))) {
                planSent = true;
                console.info('[email-idempotency] skipped duplicate weekly plan email', {
                  plan_id: fallbackPlanId,
                  source: 'body_metrics_last_resort',
                  reason: 'already_sent',
                });
              } else if (fallbackResult.bm?.email && fallbackResult.planHtml) {
                const claimedFallback = fallbackPlanId ? await tryClaimPlanEmailSend(fallbackPlanId) : false;
                if (fallbackPlanId && !claimedFallback && (await isPlanEmailAlreadySent(fallbackPlanId))) {
                  planSent = true;
                  console.info('[email-idempotency] skipped duplicate weekly plan email', {
                    plan_id: fallbackPlanId,
                    source: 'body_metrics_last_resort',
                    reason: 'claim_lost_parallel_send',
                  });
                } else if (claimedFallback) {
                  try {
                    const sendRes = await sendPlanEmail(fallbackResult.bm.email, fallbackResult.planHtml, {
                      loginPassword,
                      loginUrl,
                      existingAccount,
                      loginUnavailable: payload.user_id == null,
                      userChosePassword,
                      firstName: fallbackResult.bm?.name ?? payload.name ?? null,
                      bodyMetrics: fallbackResult.bm,
                      planId: fallbackPlanId,
                    });
                    planSent = !!sendRes?.ok;
                    if (planSent && fallbackPlanId) {
                      console.info('[email-idempotency] sent weekly plan email', {
                        plan_id: fallbackPlanId,
                        source: 'body_metrics_last_resort',
                      });
                    }
                    if (!planSent && fallbackPlanId) {
                      await releasePlanEmailSendClaim(fallbackPlanId);
                    }
                  } catch (mailErr) {
                    if (fallbackPlanId) await releasePlanEmailSendClaim(fallbackPlanId);
                    console.warn('[body-metrics] last-resort sendPlanEmail failed:', mailErr?.message);
                  }
                }
              }
              console.info('[body-metrics] last-resort plan persisted', { plan_id: savedPlanId, email_sent: planSent });
            } else {
              lastResortFailed = true;
            }
          } catch (lrErr) {
            console.warn('[body-metrics] last-resort failed:', lrErr?.message);
            lastResortFailed = true;
            lastResortError = lrErr?.message ?? 'exception';
          }
        }
      } else {
        const { data: planRow } = await supabaseServer
          .from('ai_generated_plans')
          .select('id')
          .eq('user_id', payload.user_id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        savedPlanId = planRow?.id ?? null;
        savedPlanExists = !!savedPlanId;
      }

      try {
        const coachInline = await runRegistrationCoachInline(payload.user_id);
        console.info('[body-metrics] registration coach inline', coachInline);
      } catch (coachErr) {
        console.warn('[body-metrics] registration coach inline failed', { error: coachErr?.message });
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

    const successMsg = 'Údaje byly úspěšně uloženy a plán byl odeslán na e-mail. V e-mailu najdeš přihlašovací údaje.';
    const emailFailedPlanReadyMsg = 'Účet je vytvořen a plán je hotový. Přihlas se – plán uvidíš v profilu. E-mail s plánem se nepodařilo odeslat – zkontroluj spam nebo napiš na info@bodyandmindon.cz.';

    let plan_state = 'unknown';
    if (accountCreated) {
      if (savedPlanExists || initialPlanTaskStatus === 'completed') plan_state = 'ready';
      else plan_state = 'processing';
    }

    let message = successMsg;
    if (plan_state === 'ready' && !planSent) message = emailFailedPlanReadyMsg;
    else if (plan_state === 'processing') {
      message = savedPlanExists
        ? emailFailedPlanReadyMsg
        : 'Účet je vytvořen. Plán se dokončuje – za chvíli ho uvidíš v profilu.';
    }

    const finalResponseReason =
      plan_state === 'ready'
        ? (planSent ? 'plan_ready_email_sent' : 'plan_ready_email_not_sent')
        : lastResortFailed
          ? 'plan_processing_last_resort_failed'
          : 'plan_processing';

    const onboardingResult =
      plan_state === 'ready'
        ? (lastResortRan ? 'fallback_success' : 'ai_success')
        : 'processing';
    planPending = plan_state === 'processing';

    let initialPlanTaskId = null;
    let initialPlanTaskCreatedAt = null;
    let initialPlanTaskCompletedAt = null;
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
      if (lastResortRan) {
        generationSource = generationSource ?? 'reg_deterministic';
      }
    }

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
        lastResortRan,
        lastResortFailed,
        savedPlanId,
        savedPlanExists,
        planState: plan_state,
        planSent,
        planPending,
        finalResponseReason,
      }).catch((err) => console.warn('[body-metrics] writeOnboardingEvent failed:', err?.message));
    }

    const response = {
      ok: accountCreated && (plan_state === 'ready' || plan_state === 'processing'),
      planSent,
      planPending,
      plan_state,
      loginUnavailable: !accountCreated,
      message,
    };
    if (accountCreated) {
      response.hasUserId = true;
      response.initialPlanTaskStatus = initialPlanTaskStatus;
      response.initialPlanSummary = initialPlanSummary ?? undefined;
      response.initialPlanValidationWarning = initialPlanValidationWarning ?? undefined;
      response._diagnostics = {
        task_created: accountCreated,
        initial_plan_task_status: initialPlanTaskStatus ?? undefined,
        initial_plan_task_id: initialPlanTaskId ?? undefined,
        initial_plan_task_created_at: initialPlanTaskCreatedAt ?? undefined,
        initial_plan_task_completed_at: initialPlanTaskCompletedAt ?? undefined,
        plan_state,
        plan_sent: planSent,
        plan_pending: planPending,
        final_response_reason: finalResponseReason,
        onboarding_result: onboardingResult,
        saved_plan_id: savedPlanId ?? undefined,
        saved_plan_exists: savedPlanExists ?? undefined,
        generation_source: generationSource ?? undefined,
        trainer_task_created: !!initialPlanTaskId,
        trainer_task_completed: initialPlanTaskStatus === 'completed',
        trainer_task_failed: initialPlanTaskStatus === 'failed',
        trainer_generation_source: trainerResult?.generation_source ?? trainerResult?.final_publish_source ?? undefined,
        trainer_output_exists: !!(trainerResult?.plan_id),
        email_error: trainerResult?.email_error ?? undefined,
        email_sent: planSent,
        plan_saved: savedPlanExists,
        plan_saved_id: savedPlanId ?? undefined,
        last_resort_ran: lastResortRan,
        last_resort_failed: lastResortFailed,
        last_resort_error: lastResortError ?? undefined,
        required_modules: trainerResult?.required_modules ?? ['nutrition', 'training', 'habits'],
        completed_modules: trainerResult?.completed_modules ?? undefined,
        plan_scope: trainerResult?.plan_scope ?? 'initial_7_day_trial',
        missing_modules: trainerResult?.missing_modules ?? undefined,
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
