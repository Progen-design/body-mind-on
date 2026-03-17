// /pages/api/body-metrics.js
// CORE FLOW: Registrace musí vést k reálnému AI výsledku (body_metrics → ai_tasks → ai_generated_plans → zobrazení + e-mail).
// Při refaktoru neměň pořadí: insert body_metrics → createInitialAITasks → enqueueAIEvent → triggerImmediateDecision → runAIScheduler.
// Viz docs/CORE_FLOW_REGISTRACE_AI_PLAN.md
// Registrace ve všech programech (START, ON Club, VIP) se chová dle pravidel ON Club – lib/registrationRules.js.
import { supabaseServer } from '../../lib/supabaseServer';
import {
  PROGRAMS,
  validateHeightCm,
  validateWeightKg,
  validateAge,
  validatePassword,
} from '../../lib/registrationRules';
import { createAuthUserIfNew } from '../../lib/authHelpers';
import { runAIScheduler } from '../../lib/aiScheduler';
import { createInitialAITasks } from '../../lib/createInitialAITasks';
import { executeAITask, persistFallbackPlanForUser } from '../../lib/taskExecutors';
import { sendPlanEmail } from '../../lib/mail';
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
    let planPending = false; // true když jsme kvůli timeoutu vrátili odpověď dřív – plán dokoční cron
    let schedulerTriggered = false;
    let directExecutionTriggered = false;
    let initialPlanTaskStatus = null;
    let initialPlanSummary = null;
    let initialPlanValidationWarning = null;
    const accountCreated = payload.user_id != null;
    // Musí skončit před Vercel maxDuration (120 s); při 60 s limitu stačí 48 s + ~10 s fallback
    const PLAN_GENERATION_TIMEOUT_MS = 48000; // 48 s
    const PLAN_WAIT_POLL_MS = 1000;
    const PLAN_WAIT_MAX_MS = 20000; // 20 s poll po scheduleru

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

      const runPlanGeneration = async () => {
      try {
        // 1. Načíst task tohoto uživatele
        const { data: taskRow } = await supabaseServer
          .from('ai_tasks')
          .select('id, status, result')
          .eq('user_id', payload.user_id)
          .eq('agent_slug', 'trainer')
          .eq('task_type', 'initial_plan')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        initialPlanTaskStatus = taskRow?.status ?? null;
        planSent = taskRow?.status === 'completed';
        initialPlanSummary = taskRow?.result?.summary ?? null;
        initialPlanValidationWarning = taskRow?.result?.validation_warning ?? null;
        if (initialPlanTaskStatus === 'failed') {
          console.warn('[body-metrics] trainer initial_plan failed – task result:', JSON.stringify(taskRow?.result ?? null));
        }

        // 2. PRIORITIZACE: pokud pending, spustit ihned; při selhání jeden retry
        const runDirectExecute = async (label) => {
          const { data: directTask } = await supabaseServer.from('ai_tasks').select('id, user_id, agent_slug, task_type, payload').eq('id', taskRow.id).eq('status', 'pending').eq('agent_slug', 'trainer').eq('task_type', 'initial_plan').maybeSingle();
          if (!directTask) return false;
          const exec = await executeAITask(directTask);
          const hasPlanId = exec?.result?.outcome_type === 'plan_generated' && (exec?.result?.plan_id != null && exec?.result?.plan_id !== '');
          const effectiveOk = exec?.ok && (hasPlanId || exec?.result?.outcome_type !== 'plan_generated');
          await supabaseServer.from('ai_tasks').update({
            status: effectiveOk ? 'completed' : 'failed',
            result: exec?.result ?? { error: 'Direct execution returned no result' },
            processed_at: new Date().toISOString(),
            last_error: effectiveOk ? null : (exec?.ok && !hasPlanId ? 'Completed without plan_id' : null),
          }).eq('id', directTask.id);
          if (effectiveOk) {
            initialPlanTaskStatus = 'completed';
            planSent = exec?.result?.email_sent === true;
            initialPlanSummary = exec?.result?.summary ?? null;
            initialPlanValidationWarning = exec?.result?.validation_warning ?? null;
            console.info('[body-metrics] ' + label + ' finished', { plan_sent: planSent });
            return true;
          }
          return false;
        };
        if (initialPlanTaskStatus === 'pending' && taskRow?.id) {
          directExecutionTriggered = true;
          console.info('[body-metrics] direct executeAITask started (priority for new user)');
          try {
            const ok = await runDirectExecute('direct executeAITask');
            if (!ok) {
              const { data: refetched } = await supabaseServer.from('ai_tasks').select('id, status').eq('id', taskRow.id).maybeSingle();
              if (refetched?.status === 'pending') {
                console.info('[body-metrics] direct execute retry (1x)');
                try {
                  await runDirectExecute('direct executeAITask retry');
                } catch (retryErr) {
                  console.warn('[body-metrics] direct execute retry failed:', retryErr?.message);
                }
              }
            }
          } catch (directErr) {
            console.warn('[body-metrics] direct executeAITask failed:', directErr?.message);
            const { data: refetched } = await supabaseServer.from('ai_tasks').select('id, status').eq('id', taskRow.id).maybeSingle();
            if (refetched?.status === 'pending') {
              console.info('[body-metrics] direct execute retry after throw (1x)');
              try {
                await runDirectExecute('direct executeAITask retry');
              } catch (retryErr) {
                console.warn('[body-metrics] direct execute retry failed:', retryErr?.message);
              }
            }
          }
        }

        // 3. Pokud stále pending, spustit scheduler (zpracuje i ostatní tasky)
        if (initialPlanTaskStatus === 'pending') {
          console.info('[body-metrics] scheduler run started', `user_id=${payload.user_id}`);
          const run = await runAIScheduler();
          schedulerTriggered = true;
          console.info('[body-metrics] scheduler run finished', `completed=${run.completed} failed=${run.failed}`);

          const { data: refetched } = await supabaseServer.from('ai_tasks').select('id, status, result').eq('id', taskRow.id).maybeSingle();
          if (refetched) {
            initialPlanTaskStatus = refetched.status;
            planSent = refetched.status === 'completed' && refetched?.result?.email_sent === true;
            initialPlanSummary = refetched?.result?.summary ?? null;
            initialPlanValidationWarning = refetched?.result?.validation_warning ?? null;
          }

          if (initialPlanTaskStatus === 'pending' && taskRow?.id) {
            directExecutionTriggered = true;
            const runFallbackDirect = async (label) => {
              const { data: directTask } = await supabaseServer.from('ai_tasks').select('id, user_id, agent_slug, task_type, payload').eq('id', taskRow.id).eq('status', 'pending').eq('agent_slug', 'trainer').eq('task_type', 'initial_plan').maybeSingle();
              if (!directTask) return false;
              const exec = await executeAITask(directTask);
              const hasPlanId = exec?.result?.outcome_type === 'plan_generated' && (exec?.result?.plan_id != null && exec?.result?.plan_id !== '');
              const effectiveOk = exec?.ok && (hasPlanId || exec?.result?.outcome_type !== 'plan_generated');
              await supabaseServer.from('ai_tasks').update({
                status: effectiveOk ? 'completed' : 'failed',
                result: exec?.result ?? { error: 'Direct execution returned no result' },
                processed_at: new Date().toISOString(),
                last_error: effectiveOk ? null : null,
              }).eq('id', directTask.id);
              if (effectiveOk) {
                initialPlanTaskStatus = 'completed';
                planSent = exec?.result?.email_sent === true;
                initialPlanSummary = exec?.result?.summary ?? null;
                initialPlanValidationWarning = exec?.result?.validation_warning ?? null;
                console.info('[body-metrics] ' + label + ' finished', { plan_sent: planSent });
                return true;
              }
              return false;
            };
            console.info('[body-metrics] direct executeAITask fallback (after scheduler)');
            try {
              let ok = await runFallbackDirect('direct executeAITask fallback');
              if (!ok) {
                const { data: refetched } = await supabaseServer.from('ai_tasks').select('id, status').eq('id', taskRow.id).maybeSingle();
                if (refetched?.status === 'pending') {
                  console.info('[body-metrics] direct fallback retry (1x)');
                  try { await runFallbackDirect('direct fallback retry'); } catch (e) { console.warn('[body-metrics] direct fallback retry failed:', e?.message); }
                }
              }
            } catch (directErr) {
              console.warn('[body-metrics] direct executeAITask fallback failed:', directErr?.message);
              const { data: refetched } = await supabaseServer.from('ai_tasks').select('id, status').eq('id', taskRow.id).maybeSingle();
              if (refetched?.status === 'pending') {
                console.info('[body-metrics] direct fallback retry after throw (1x)');
                try { await runFallbackDirect('direct fallback retry'); } catch (e) { console.warn('[body-metrics] direct fallback retry failed:', e?.message); }
              }
            }
          }
        }
        // Krátký wait/poll loop: pokud task stále pending, počkej max 12 s na dokončení (cron/scheduler může doběhnout)
        if (initialPlanTaskStatus === 'pending' && taskRow?.id) {
          const pollStart = Date.now();
          while (Date.now() - pollStart < PLAN_WAIT_MAX_MS) {
            await new Promise((r) => setTimeout(r, PLAN_WAIT_POLL_MS));
            const { data: polled } = await supabaseServer
              .from('ai_tasks')
              .select('status, result')
              .eq('id', taskRow.id)
              .maybeSingle();
            if (polled?.status === 'completed') {
              initialPlanTaskStatus = 'completed';
              planSent = polled?.result?.email_sent === true;
              initialPlanSummary = polled?.result?.summary ?? null;
              initialPlanValidationWarning = polled?.result?.validation_warning ?? null;
              console.info('[body-metrics] initial_plan completed during wait loop');
              break;
            }
            if (polled?.status === 'failed') {
              initialPlanTaskStatus = 'failed';
              console.info('[body-metrics] initial_plan failed during wait loop');
              break;
            }
          }
        }
        console.info('[body-metrics] initial_plan task final status', initialPlanTaskStatus);
      } catch (schedErr) {
        console.warn('[body-metrics] scheduler run failed (tasks remain pending):', schedErr?.message);
        // Fallback: i když scheduler spadl (timeout, výjimka), zkusíme dokončit initial_plan pro tohoto uživatele přímo
        try {
          const { data: fallbackTask } = await supabaseServer
            .from('ai_tasks')
            .select('id, user_id, agent_slug, task_type, payload')
            .eq('user_id', payload.user_id)
            .eq('agent_slug', 'trainer')
            .eq('task_type', 'initial_plan')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallbackTask?.id) {
            directExecutionTriggered = true;
            const runSchedFallback = async (label) => {
              const { data: task } = await supabaseServer.from('ai_tasks').select('id, user_id, agent_slug, task_type, payload').eq('id', fallbackTask.id).eq('status', 'pending').maybeSingle();
              if (!task) return false;
              const exec = await executeAITask(task);
              const hasPlanId = exec?.result?.outcome_type === 'plan_generated' && (exec?.result?.plan_id != null && exec?.result?.plan_id !== '');
              const effectiveOk = exec?.ok && (hasPlanId || exec?.result?.outcome_type !== 'plan_generated');
              await supabaseServer.from('ai_tasks').update({
                status: effectiveOk ? 'completed' : 'failed',
                result: exec?.result ?? { error: 'Fallback execution after scheduler error' },
                processed_at: new Date().toISOString(),
                last_error: effectiveOk ? null : null,
              }).eq('id', task.id);
              if (effectiveOk) {
                initialPlanTaskStatus = 'completed';
                planSent = exec?.result?.email_sent === true;
                initialPlanSummary = exec?.result?.summary ?? null;
                initialPlanValidationWarning = exec?.result?.validation_warning ?? null;
                console.info('[body-metrics] ' + label, { plan_sent: planSent });
                return true;
              }
              return false;
            };
            try {
              let ok = await runSchedFallback('fallback executeAITask after scheduler error');
              if (!ok) {
                const { data: refetched } = await supabaseServer.from('ai_tasks').select('id, status').eq('id', fallbackTask.id).maybeSingle();
                if (refetched?.status === 'pending') {
                  console.info('[body-metrics] scheduler fallback retry (1x)');
                  try { await runSchedFallback('scheduler fallback retry'); } catch (e) { console.warn('[body-metrics] scheduler fallback retry failed:', e?.message); }
                }
              }
            } catch (fallbackErr) {
              console.warn('[body-metrics] fallback executeAITask failed:', fallbackErr?.message);
              const { data: refetched } = await supabaseServer.from('ai_tasks').select('id, status').eq('id', fallbackTask.id).maybeSingle();
              if (refetched?.status === 'pending') {
                console.info('[body-metrics] scheduler fallback retry after throw (1x)');
                try { await runSchedFallback('scheduler fallback retry'); } catch (e) { console.warn('[body-metrics] scheduler fallback retry failed:', e?.message); }
              }
            }
          }
        } catch (fallbackErr) {
          console.warn('[body-metrics] fallback executeAITask outer failed:', fallbackErr?.message);
        }
      }
      }; // runPlanGeneration

      await Promise.race([
        runPlanGeneration(),
        new Promise((resolve) => setTimeout(() => {
          planPending = true;
          console.info('[body-metrics] plan generation timeout – returning success, cron will complete plan');
          resolve();
        }, PLAN_GENERATION_TIMEOUT_MS)),
      ]);
    }

    // Last-resort: pokud plán stále není hotový, uložit deterministický fallback – uživatel VŽDY dostane plán v profilu; e-mail jen když máme adresu
    let lastResortRan = false;
    let lastResortPlanId = null;
    if (payload.user_id && initialPlanTaskStatus !== 'completed') {
      let fallbackResult = await persistFallbackPlanForUser(payload.user_id);
      if (!fallbackResult?.plan_id) {
        console.warn('[body-metrics] last-resort persist failed, retry (1x)');
        fallbackResult = await persistFallbackPlanForUser(payload.user_id);
      }
      if (fallbackResult?.plan_id) {
        lastResortRan = true;
        lastResortPlanId = fallbackResult.plan_id;
        const { data: initialTask } = await supabaseServer
          .from('ai_tasks')
          .select('id')
          .eq('user_id', payload.user_id)
          .eq('agent_slug', 'trainer')
          .eq('task_type', 'initial_plan')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (initialTask?.id) {
          await supabaseServer.from('ai_tasks').update({
            status: 'completed',
            result: { outcome_type: 'plan_generated', plan_id: fallbackResult.plan_id, email_sent: false, summary: 'deterministic_fallback_after_failure' },
            processed_at: new Date().toISOString(),
            last_error: null,
          }).eq('id', initialTask.id);
        }
        initialPlanTaskStatus = 'completed';
        if (fallbackResult?.bm?.email) {
          const sendResult = await sendPlanEmail(fallbackResult.bm.email, fallbackResult.planHtml, {
            loginPassword: emailOptions.loginPassword ?? null,
            loginUrl: emailOptions.loginUrl ?? null,
            existingAccount: emailOptions.existingAccount === true,
            loginUnavailable: emailOptions.loginUnavailable === true,
            userChosePassword: emailOptions.userChosePassword === true,
          });
          planSent = sendResult?.ok === true;
          if (planSent && initialTask?.id) {
            await supabaseServer.from('ai_tasks').update({
              result: { outcome_type: 'plan_generated', plan_id: fallbackResult.plan_id, email_sent: true, summary: 'deterministic_fallback_after_failure' },
            }).eq('id', initialTask.id);
          }
        }
        console.info('[body-metrics] last-resort fallback: plan persisted', { plan_id: fallbackResult.plan_id, email_sent: planSent, user_id: payload.user_id });
      }
    }

    // P0 HOTFIX: planPending smí být true jen když plán má reálnou šanci se dokončit.
    // Po timeoutu vždy běží last-resort. Pokud last-resort selže, plán nevznikne a cron nepomůže.
    const lastResortFailed = payload.user_id && initialPlanTaskStatus !== 'completed' && !lastResortRan;
    if (planPending) {
      if (initialPlanTaskStatus === 'completed') planPending = false; // máme plán (AI nebo last-resort)
      else if (lastResortFailed) planPending = false; // last-resort selhal – plán nevznikne
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

    const successMsg = accountCreated
      ? 'Údaje byly úspěšně uloženy a plán byl odeslán na e-mail. V e-mailu najdeš přihlašovací údaje – s nimi se můžeš přihlásit a vidět svůj profil.'
      : 'Údaje a plán byly uloženy a odeslány na e-mail. Vytvoření přihlašovacího účtu se nezdařilo – pro přístup do profilu nás kontaktuj na info@bodyandmindon.cz.';
    const pendingMsg = 'Účet je vytvořen. Plán se dokončuje na pozadí – za chvíli přijde e-mail a v profilu uvidíš plán.';
    const emailFailedPlanReadyMsg = 'Účet je vytvořen a plán je hotový. Přihlas se – plán uvidíš v profilu. E-mail s plánem se nepodařilo odeslat – zkontroluj spam nebo napiš na info@bodyandmindon.cz.';
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
    const failMsg = `Údaje byly uloženy. Plán se nepodařilo dokončit – přihlas se na ${appUrl}, v profilu v sekci Můj plán zkus „Vygenerovat plán“, nebo napiš na info@bodyandmindon.cz.`;
    let plan_state = 'unknown';
    if (accountCreated) {
      if (initialPlanTaskStatus === 'completed') plan_state = 'ready';
      else if (initialPlanTaskStatus === 'pending' || initialPlanTaskStatus === 'processing') plan_state = 'processing';
      else if (initialPlanTaskStatus === 'failed' || initialPlanTaskStatus === 'dlq') plan_state = 'failed';
      else if (initialPlanTaskStatus != null) plan_state = 'processing'; // fallback pro jiný známý status (task může ještě běžet)
    }

    let message = successMsg;
    if (!planSent) {
      if (planPending) message = pendingMsg;
      else if (initialPlanTaskStatus === 'completed') message = emailFailedPlanReadyMsg;
      else message = failMsg;
    }

    const finalResponseReason =
      initialPlanTaskStatus === 'completed'
        ? (planSent ? 'plan_ready_email_sent' : 'plan_ready_email_not_sent')
        : planPending
          ? 'plan_still_processing'
          : lastResortFailed
            ? 'last_resort_failed'
            : 'plan_failed';

    const onboardingResult =
      initialPlanTaskStatus === 'completed'
        ? (lastResortRan ? 'fallback_success' : 'ai_success')
        : 'failed';

    let initialPlanTaskId = null;
    let initialPlanTaskCreatedAt = null;
    let initialPlanTaskCompletedAt = null;
    let savedPlanId = lastResortPlanId ?? null;
    let generationSource = null;

    let rootFailureStage = null;
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
        if (!lastResortRan && initialPlanTaskStatus !== 'completed') {
          if (taskRow.last_error?.includes('429') || taskRow.last_error?.includes('quota')) rootFailureStage = 'openai_quota';
          else if (taskRow.last_error?.includes('body_metrics') || taskRow.last_error?.includes('No body_metrics')) rootFailureStage = 'body_metrics_missing';
          else if (taskRow.status === 'dlq') rootFailureStage = 'trainer_dlq';
          else if (taskRow.status === 'failed') rootFailureStage = 'trainer_failed';
          else if (lastResortFailed) rootFailureStage = 'last_resort_failed';
          else rootFailureStage = 'trainer_' + (taskRow.status || 'unknown');
        } else if (lastResortRan) rootFailureStage = 'fallback_success';
        else rootFailureStage = 'ai_success';
      }
      if (!savedPlanId && plan_state === 'ready') {
        const { data: planRow } = await supabaseServer
          .from('ai_generated_plans')
          .select('id')
          .eq('user_id', payload.user_id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        savedPlanId = planRow?.id ?? null;
      }
    }

    const savedPlanExists = !!savedPlanId;

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
        finalPublishSource: lastResortRan ? 'deterministic_fallback_after_failure' : (generationSource ?? 'ai'),
        generationSource,
        lastResortRan: lastResortRan ?? false,
        lastResortFailed: lastResortFailed ?? false,
        savedPlanId,
        savedPlanExists,
        planState: plan_state,
        planSent,
        planPending: planPending || false,
        finalResponseReason,
      }).catch((err) => console.warn('[body-metrics] writeOnboardingEvent failed:', err?.message));
    }

    const response = {
      ok: true,
      planSent,
      planPending: planPending || false,
      plan_state,
      loginUnavailable: !accountCreated,
      message,
    };
    if (accountCreated) {
      response.hasUserId = true;
      response.schedulerTriggered = schedulerTriggered;
      response.initialPlanTaskStatus = initialPlanTaskStatus;
      response.initialPlanSummary = initialPlanSummary;
      response.initialPlanValidationWarning = initialPlanValidationWarning ?? undefined;
      response.directExecutionTriggered = directExecutionTriggered;
      response.planSent = planSent;
      response._diagnostics = {
        task_created: accountCreated,
        direct_execution_triggered: directExecutionTriggered,
        scheduler_triggered: schedulerTriggered,
        initial_plan_task_status: initialPlanTaskStatus ?? undefined,
        initial_plan_task_id: initialPlanTaskId ?? undefined,
        initial_plan_task_created_at: initialPlanTaskCreatedAt ?? undefined,
        initial_plan_task_completed_at: initialPlanTaskCompletedAt ?? undefined,
        plan_state,
        plan_sent: planSent,
        plan_pending: planPending || false,
        last_resort_ran: lastResortRan || undefined,
        last_resort_plan_id: lastResortPlanId ?? undefined,
        last_resort_failed: lastResortFailed || undefined,
        final_response_reason: finalResponseReason,
        onboarding_result: onboardingResult,
        saved_plan_id: savedPlanId ?? undefined,
        saved_plan_exists: savedPlanExists ?? undefined,
        generation_source: generationSource ?? undefined,
        root_failure_stage: rootFailureStage ?? undefined,
        trainer_task_created: !!initialPlanTaskId,
        trainer_task_completed: initialPlanTaskStatus === 'completed',
        trainer_task_failed: initialPlanTaskStatus === 'failed',
        trainer_task_dlq: initialPlanTaskStatus === 'dlq',
        trainer_generation_source: trainerResult?.generation_source ?? trainerResult?.final_publish_source ?? undefined,
        trainer_output_exists: !!(trainerResult?.plan_id || lastResortPlanId),
        fallback_used: lastResortRan || undefined,
        fallback_persisted: lastResortRan ? !!lastResortPlanId : undefined,
        email_sent: planSent,
        plan_saved: savedPlanExists,
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
