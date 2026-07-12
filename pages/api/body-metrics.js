// /pages/api/body-metrics.js
// CORE FLOW: Registrace musí vést k reálnému AI výsledku (body_metrics → ai_tasks → ai_generated_plans → zobrazení + e-mail).
// SYNC: Registrace musí doručit plán (katalog nebo last-resort) v rámci Vercel 60s limitu.
// Viz docs/CORE_FLOW_REGISTRACE_AI_PLAN.md
import { supabaseServer } from '../../lib/supabaseServer';
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
import { enqueueAIEvent, triggerImmediateDecision } from '../../lib/aiEvents';
import { writeOnboardingEvent } from '../../lib/onboardingMetrics';
import { getDefaultLoginUrl } from '../../lib/siteUrls.js';
import { enforcePublicEndpointRateLimit } from '../../lib/rateLimit';
import {
  parseAndValidateRegistrationBody,
  createRegistrationAuthUser,
  applyRegistrationUserMetadata,
  persistBodyMetricsRow,
  buildRegistrationApiResponse,
} from '../../lib/registration/bodyMetricsRegistration';
import { membershipFromRegistration } from '../../lib/membershipRegistration';
import { isTierCheckoutEnabled } from '../../lib/salesFeatureFlags';

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

    const rateLimit = await enforcePublicEndpointRateLimit(req, {
      scope: 'body-metrics',
      email: b.email,
      limit: 8,
      windowMs: 15 * 60 * 1000,
    });
    if (rateLimit.limited) {
      if (rateLimit.retryAfterSec) res.setHeader('Retry-After', String(rateLimit.retryAfterSec));
      return res.status(429).json({ error: rateLimit.message });
    }

    const parsed = parseAndValidateRegistrationBody(b);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }

    const { payload, password, birthDateRaw, smartScaleBody } = parsed;

    const normalizedProgram = String(payload.program || 'START').toUpperCase();
    if ((normalizedProgram === 'ON_CLUB' || normalizedProgram === 'VIP') && !isTierCheckoutEnabled(normalizedProgram)) {
      return res.status(403).json({
        error: 'Tento produkt zatím není k dispozici. Připravujeme — přidej se na waitlist.',
      });
    }

    const auth = await createRegistrationAuthUser(payload, password);
    if (auth.authError === 'existing_account') {
      return res.status(400).json({
        error:
          'Účet s tímto e-mailem už existuje. Přihlas se nebo si nech poslat odkaz k obnově hesla — registraci START se stejným e-mailem nelze opakovat.',
      });
    }

    let loginPassword = null;
    let existingAccount = false;
    let userChosePassword = false;

    if (auth.authError) {
      console.info('[body-metrics] Auth failed (no user_id), saving body_metrics without user_id');
      payload.user_id = null;
    } else {
      payload.user_id = auth.userId;
      loginPassword = auth.loginPassword;
      existingAccount = auth.existingAccount;
      userChosePassword = auth.userChosePassword;
      await applyRegistrationUserMetadata(payload, { birthDateRaw, smartScaleBody, existingAccount });
    }

    if (payload.user_id && existingAccount) {
      return res.status(400).json({
        error:
          'Účet s tímto e-mailem už existuje. Přihlas se nebo si nech poslat odkaz k obnově hesla — registraci START se stejným e-mailem nelze opakovat.',
      });
    }

    const persist = await persistBodyMetricsRow(payload);
    if (persist.error) {
      console.error('[body-metrics] DB insert failed:', persist.error);
      throw new Error(persist.error);
    }
    const bodyMetricsId = persist.bodyMetricsId;
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
      const membership = membershipFromRegistration(program, startedAt);
      const { error: memErr } = await supabaseServer
        .from('memberships')
        .upsert([{
          user_id: payload.user_id,
          tier: membership.tier,
          status: membership.status,
          started_at: membership.started_at,
          trial_ends_at: membership.trial_ends_at,
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

    const response = buildRegistrationApiResponse({
      accountCreated,
      plan_state,
      planSent,
      planPending,
      message,
      initialPlanTaskStatus,
      initialPlanSummary,
      initialPlanValidationWarning,
      initialPlanTaskId,
      initialPlanTaskCreatedAt,
      initialPlanTaskCompletedAt,
      finalResponseReason,
      onboardingResult,
      savedPlanId,
      savedPlanExists,
      generationSource,
      trainerResult,
      lastResortRan,
      lastResortFailed,
      lastResortError,
    });

    return res.status(200).json(response);

  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(500).json({
      error: e.message || 'Neočekávaná chyba při zpracování požadavku.'
    });
  }
}
