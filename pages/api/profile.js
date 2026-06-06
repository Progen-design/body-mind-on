// /pages/api/profile.js - Vrací data přihlášeného uživatele
import { supabaseServer } from '../../lib/supabaseServer';
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../../lib/habits';
import { validatePublishedPlanHtml } from '../../lib/validatePlanHtml';
import { ensureInitialPlanTask } from '../../lib/ensureInitialPlanTask';
import { getRegistrationAnchoredWeek } from '../../lib/profileWeekRange';
import { reconcileUserDataByEmail } from '../../lib/reconcileUserDataByEmail';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const userId = user.id;
    const email = user.email?.toLowerCase();

    const reconciliation = await reconcileUserDataByEmail({ userId, email });
    if (reconciliation?.reason === 'reconciled') {
      console.info('[profile] user data reconciled by email', {
        userId,
        movedFromUserIds: reconciliation.movedFromUserIds,
        hadNullMetrics: reconciliation.hadNullMetrics,
      });
    }

    const now = new Date();
    const { weekStartStr, weekEndStr } = getRegistrationAnchoredWeek(now, user.created_at);

    const [metricsRes, plansRes, workoutsRes, userHabitsRes, membershipRes, habitLogsRes, profileRes, coachMessagesRes, initialPlanTaskRes] = await Promise.allSettled([
      supabaseServer
        .from('body_metrics')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseServer
        .from('ai_generated_plans')
        .select('id, plan_type, daily_calories, macros, valid_from, valid_until, created_at, plan_html, structured_plan_json, is_active, generated_by')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseServer
        .from('workouts')
        .select('*')
        .eq('user_id', userId)
        .order('workout_date', { ascending: false })
        .limit(100),
      supabaseServer
        .from('user_habits')
        .select('*')
        .eq('user_id', userId)
        .order('is_positive', { ascending: false })
        .order('sort_order', { ascending: true }),
      supabaseServer
        .from('memberships')
        .select('tier, status, started_at, trial_ends_at')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle(),
      supabaseServer
        .from('habit_logs')
        .select('log_date, habit_id, completed')
        .eq('user_id', userId)
        .gte('log_date', weekStartStr)
        .lte('log_date', weekEndStr),
      supabaseServer.from('profiles').select('avatar_url, daily_email').eq('id', userId).maybeSingle(),
      supabaseServer
        .from('ai_messages')
        .select('id, title, content, created_at, task_type')
        .eq('user_id', userId)
        .eq('agent_slug', 'coach')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseServer
        .from('ai_tasks')
        .select('id, status, created_at, processed_at, result, last_error, attempts')
        .eq('user_id', userId)
        .eq('agent_slug', 'trainer')
        .eq('task_type', 'initial_plan')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const bodyMetrics = (metricsRes.status === 'fulfilled' && metricsRes.value?.data) ? metricsRes.value.data : [];
    let plansData = (plansRes.status === 'fulfilled' && plansRes.value?.data) ? plansRes.value.data : [];
    // PRAVIDLO AI-FIRST: Plány z fallbacku nesmí být vráceny jako produkční – pouze AI plány.
    const isPublishablePlan = (p) => !(p.generated_by || '').toLowerCase().includes('fallback');
    plansData = plansData.filter(isPublishablePlan);
    const initialPlanTaskQueryFailed = initialPlanTaskRes?.status === 'rejected';
    let initialPlanTask = (initialPlanTaskRes?.status === 'fulfilled' && initialPlanTaskRes?.value?.data) ? initialPlanTaskRes.value.data : null;
    let initialPlanTaskExists = !!initialPlanTask;

    const body_metrics_exists = bodyMetrics.length > 0;
    const body_metrics_count = bodyMetrics.length;
    let recovery_task_created = false;
    let recovery_reason = undefined;

    let recovery_attempted = false;
    if (!initialPlanTaskExists && !bodyMetrics.length) {
      recovery_reason = 'no_body_metrics_skip_recovery';
    } else if (!initialPlanTaskExists && bodyMetrics.length > 0) {
      recovery_attempted = true;
      const earlyPlanRow = plansData.find((p) => p.plan_html && typeof p.plan_html === 'string');
      const planValidationEarly = validatePublishedPlanHtml(earlyPlanRow?.plan_html ?? '', {
        structured_plan_json: earlyPlanRow?.structured_plan_json,
        generation_source: initialPlanTask?.result?.generation_source ?? null,
      });
      if (planValidationEarly.ok) {
        recovery_reason = 'valid_plan_exists_skip_recovery';
      } else {
        const ensure = await ensureInitialPlanTask(userId, {});
        recovery_reason = ensure.reason ?? (ensure.created ? 'recovery_task_created' : 'recovery_skipped');
        if (ensure.created) {
          recovery_task_created = true;
          const { data: refetchedTask } = await supabaseServer
            .from('ai_tasks')
            .select('id, status, created_at, processed_at, result, last_error, attempts')
            .eq('user_id', userId)
            .eq('agent_slug', 'trainer')
            .eq('task_type', 'initial_plan')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (refetchedTask) {
            initialPlanTask = refetchedTask;
            initialPlanTaskExists = true;
          }
        }
      }
    }
    const activePlan = plansData.find((p) => p.is_active === true);
    const hasActivePlan = !!activePlan;
    const currentPlanForDiagnostics = activePlan || plansData.find((p) => p.plan_html && typeof p.plan_html === 'string' && p.plan_html.length > 0);
    const currentPlanHtml = currentPlanForDiagnostics?.plan_html ?? '';
    const currentPlanHtmlLength = currentPlanHtml.length;
    const initialPlanResult = initialPlanTask?.result;
    const generation_source = initialPlanResult?.generation_source ?? null;
    const planValidation = validatePublishedPlanHtml(currentPlanHtml, {
      structured_plan_json: currentPlanForDiagnostics?.structured_plan_json,
      generation_source,
    });
    const hasValidPlan = planValidation.ok;
    const currentPlanMissingSections = planValidation.missingCoreSections ?? [];
    const currentPlanStructure = planValidation.structure ?? null;
    const fallback_used = initialPlanResult?.fallback_used ?? null;
    const truth_check = initialPlanResult?.truth_check ?? null;
    const last_task_status = initialPlanTask?.status ?? null;
    const last_task_reason = initialPlanTask?.result?.reason ?? initialPlanTask?.last_error ?? null;

    const initialPlanPending =
      initialPlanTask?.status === 'pending' || initialPlanTask?.status === 'processing';
    const initialPlanFailed =
      initialPlanTask?.status === 'failed' || initialPlanTask?.status === 'dlq';
    const initialPlanCompleted = initialPlanTask?.status === 'completed';
    let plan_state = 'missing';
    let plan_state_reason = '';
    if (hasValidPlan) {
      plan_state = 'ready';
      plan_state_reason = 'valid_plan_exists';
    } else if (initialPlanTaskQueryFailed && plansData.length === 0) {
      plan_state = 'processing';
      plan_state_reason = 'task_query_failed_assume_processing';
    } else if (initialPlanPending) {
      plan_state = 'processing';
      plan_state_reason = 'task_pending_or_processing';
    } else if (initialPlanFailed) {
      plan_state = 'failed';
      plan_state_reason = 'task_failed_or_dlq';
    } else if (plansData.length > 0) {
      plan_state = 'invalid';
      plan_state_reason = 'plan_exists_but_invalid';
    } else if (initialPlanCompleted) {
      plan_state = 'invalid';
      plan_state_reason = 'task_completed_but_no_valid_plan';
    } else if (initialPlanTaskExists) {
      plan_state = 'invalid';
      plan_state_reason = 'task_exists_unknown_status';
    } else {
      plan_state = 'missing';
      plan_state_reason = 'no_task_no_plan';
    }

    // Self-healing: task completed but no valid plan → mark task failed so state is truthful
    let selfHealApplied = false;
    if (plan_state === 'invalid' && plan_state_reason === 'task_completed_but_no_valid_plan' && initialPlanTask?.id) {
      try {
        const { error: healErr } = await supabaseServer
          .from('ai_tasks')
          .update({
            status: 'failed',
            result: {
              ...(typeof initialPlanTask.result === 'object' && initialPlanTask.result !== null ? initialPlanTask.result : {}),
              self_heal_reason: 'completed_without_valid_plan',
            },
            last_error: 'Self-healed: completed without valid plan',
          })
          .eq('id', initialPlanTask.id);
        if (!healErr) {
          plan_state = 'failed';
          plan_state_reason = 'task_completed_but_no_valid_plan_self_healed';
          selfHealApplied = true;
        }
      } catch (_) {
        // non-fatal: response still returns invalid
      }
    }

    const saved_plan_exists = plansData.some((p) => p.plan_html && typeof p.plan_html === 'string' && p.plan_html.length > 0);
    const rendered_plan_exists = hasValidPlan;
    if (!hasActivePlan && plansData.length > 0) {
      plansData = plansData.filter((p) => p.plan_html && typeof p.plan_html === 'string' && p.plan_html.length > 0);
    }
    const workouts = (workoutsRes.status === 'fulfilled' && workoutsRes.value?.data) ? workoutsRes.value.data : [];
    const userHabits = (userHabitsRes.status === 'fulfilled' && userHabitsRes.value?.data) ? userHabitsRes.value.data : [];
    const membershipData = (membershipRes.status === 'fulfilled' && membershipRes.value?.data) ? membershipRes.value.data : null;

    // Priorita: tabulka memberships > body_metrics.program > fallback START
    const program = (() => {
      if (membershipData?.tier) return membershipData.tier;
      const reg = bodyMetrics.find(m => m.program) || bodyMetrics[bodyMetrics.length - 1];
      return reg?.program || 'START';
    })();
    const membershipStatus = membershipData?.status || 'active';
    const membershipSince = membershipData?.started_at || null;
    const trialEndsAt = membershipData?.trial_ends_at || null;
    const isTrialExpired = program === 'START' && trialEndsAt && new Date(trialEndsAt) < now;
    const daysUntilTrialEnd = program === 'START' && trialEndsAt
      ? Math.ceil((new Date(trialEndsAt) - now) / (24 * 60 * 60 * 1000))
      : null;
    if (workoutsRes.status === 'rejected') {
      console.warn('[profile] workouts fetch failed (table may not exist):', workoutsRes.reason?.message);
    }

    const weightByDate = {};
    bodyMetrics
      .filter(m => m.weight_kg != null && m.created_at)
      .forEach(m => {
        const d = m.created_at.split('T')[0];
        if (!(d in weightByDate)) weightByDate[d] = m.weight_kg;
      });
    const weightHistory = Object.entries(weightByDate)
      .map(([date, weight]) => ({ date, weight }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const wd = (w) => String(w.workout_date || '').slice(0, 10);
    const workoutsThisWeek = workouts.filter(
      (w) => wd(w) >= weekStartStr && wd(w) <= weekEndStr
    ).length;

    const positiveIds = new Set(POSITIVE_HABITS.map((h) => h.id));
    const negativeIds = new Set(NEGATIVE_HABITS.map((h) => h.id));
    const habitLogs = (habitLogsRes.status === 'fulfilled' && habitLogsRes.value?.data) ? habitLogsRes.value.data : [];
    const profileRow = (profileRes.status === 'fulfilled' && profileRes.value?.data) ? profileRes.value.data : null;
    const coachMessages = (coachMessagesRes.status === 'fulfilled' && coachMessagesRes.value?.data) ? coachMessagesRes.value.data : [];
    let positiveDone = 0;
    let negativeDone = 0;
    const byHabit = {};
    habitLogs.forEach((log) => {
      if (log.completed !== true) return;
      if (positiveIds.has(log.habit_id)) {
        positiveDone += 1;
        byHabit[log.habit_id] = (byHabit[log.habit_id] || 0) + 1;
      } else if (negativeIds.has(log.habit_id)) {
        negativeDone += 1;
        byHabit[log.habit_id] = (byHabit[log.habit_id] || 0) + 1;
      }
    });

    const trainerEmail = (process.env.TRAINER_EMAIL || process.env.TRAINER_GMAIL || '').toLowerCase().trim();
    const canCreateCalendarEvents = !!trainerEmail && email === trainerEmail;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    const meta = user.user_metadata || {};
    return res.status(200).json({
      program,
      membershipStatus,
      membershipSince,
      trialEndsAt: trialEndsAt || undefined,
      isTrialExpired: isTrialExpired || undefined,
      daysUntilTrialEnd: daysUntilTrialEnd != null ? daysUntilTrialEnd : undefined,
      can_create_calendar_events: canCreateCalendarEvents,
      user: {
        id: user.id,
        email: user.email,
        name: meta.name || null,
        avatar_url: profileRow?.avatar_url || null,
        daily_email: profileRow?.daily_email !== false,
        start_weight_kg: meta.start_weight_kg != null ? Number(meta.start_weight_kg) : null,
        goal_weight_kg: meta.goal_weight_kg != null ? Number(meta.goal_weight_kg) : null,
        height_cm: meta.height_cm != null ? Number(meta.height_cm) : null,
        created_at: user.created_at || null,
      },
      body_metrics: bodyMetrics,
      user_habits: userHabits,
      plans: plansData,
      coach_messages: coachMessages,
      workouts,
      _diagnostics: {
        body_metrics_exists: body_metrics_exists ?? undefined,
        body_metrics_count: body_metrics_count ?? undefined,
        recovery_attempted: recovery_attempted || undefined,
        recovery_task_created: recovery_task_created || undefined,
        recovery_reason: recovery_reason ?? undefined,
        recovery_task_triggered: recovery_task_created || undefined,
        plans_count: plansData.length,
        has_active_plan: hasActivePlan,
        has_valid_plan: hasValidPlan,
        current_plan_html_length: currentPlanHtmlLength,
        current_plan_missing_sections: currentPlanMissingSections,
        current_plan_structure: currentPlanStructure,
        generation_source,
        trainer_ai_attempted: initialPlanResult?.trainer_ai_attempted ?? undefined,
        trainer_ai_succeeded: initialPlanResult?.trainer_ai_succeeded ?? undefined,
        trainer_ai_failed: initialPlanResult?.trainer_ai_failed ?? undefined,
        trainer_ai_failure_reason: initialPlanResult?.trainer_ai_failure_reason ?? undefined,
        published_to_user: initialPlanResult?.published_to_user ?? undefined,
        email_attempted: initialPlanResult?.email_attempted ?? undefined,
        email_sent: initialPlanResult?.email_sent ?? undefined,
        email_error: initialPlanResult?.email_error ?? undefined,
        fallback_used,
        fallback_internal_only: initialPlanResult?.fallback_internal_only ?? undefined,
        profile_plan_returned: hasValidPlan ? true : (initialPlanTask?.status === 'completed' ? false : undefined),
        root_failure_stage: initialPlanResult?.root_failure_stage ?? undefined,
        plan_state,
        last_task_status: last_task_status ?? undefined,
        last_task_reason: last_task_reason ?? undefined,
        truth_check_passed: truth_check?.truth_check_passed ?? undefined,
        truth_check_reason: truth_check?.truth_check_reason ?? undefined,
        soft_gate_passed: truth_check?.soft_gate_passed ?? undefined,
        soft_gate_reason: truth_check?.soft_gate_reason ?? undefined,
        unpublishable_meals: truth_check?.unpublishable_meals ?? undefined,
        unpublishable_exercises: truth_check?.unpublishable_exercises ?? undefined,
        meals_exact_count: truth_check?.meals_exact_count ?? undefined,
        meals_illustrative_count: truth_check?.meals_illustrative_count ?? undefined,
        meals_none_count: truth_check?.meals_none_count ?? undefined,
        exercises_exact_count: truth_check?.exercises_exact_count ?? undefined,
        exercises_fallback_count: truth_check?.exercises_fallback_count ?? undefined,
        exercises_none_count: truth_check?.exercises_none_count ?? undefined,
        truth_retry_triggered: initialPlanResult?.truth_retry_triggered ?? undefined,
        truth_retry_reason: initialPlanResult?.truth_retry_reason ?? undefined,
        truth_retry_fixed: initialPlanResult?.truth_retry_fixed ?? undefined,
        final_publish_source: initialPlanResult?.final_publish_source ?? undefined,
        raw_ai_html_length: initialPlanResult?.raw_ai_html_length ?? undefined,
        final_html_length: initialPlanResult?.final_html_length ?? undefined,
        ai_output_was_used: initialPlanResult?.ai_output_was_used ?? undefined,
        retry_output_was_used: initialPlanResult?.retry_output_was_used ?? undefined,
        fallback_output_was_used: initialPlanResult?.fallback_output_was_used ?? undefined,
        weak_quality_flags: initialPlanResult?.weak_quality_flags ?? undefined,
        media_exact_count: initialPlanResult?.media_exact_count ?? undefined,
        media_none_count: initialPlanResult?.media_none_count ?? undefined,
        parse_success: hasValidPlan,
        rendering_mode: hasValidPlan ? 'parsed' : 'raw_fallback',
        prompt_source: initialPlanResult?.prompt_source ?? undefined,
        prompt_version: initialPlanResult?.prompt_version ?? undefined,
        supporting_documents_count: initialPlanResult?.supporting_documents_count ?? undefined,
        document_titles: initialPlanResult?.document_titles ?? undefined,
        source_ids: initialPlanResult?.source_ids ?? undefined,
        initialPlanTaskExists,
        initialPlanTaskStatus: initialPlanTask?.status ?? undefined,
        initialPlanTaskCreatedAt: initialPlanTask?.created_at ?? undefined,
        initialPlanTaskProcessedAt: initialPlanTask?.processed_at ?? undefined,
        initialPlanTaskLastError: initialPlanTask?.last_error ?? undefined,
        initialPlanTaskAttemptCount: initialPlanTask?.attempts ?? undefined,
        initialPlanTaskQueryFailed: initialPlanTaskQueryFailed ?? undefined,
        saved_plan_exists: saved_plan_exists ?? undefined,
        saved_plan_id: activePlan?.id ?? (plansData[0]?.id) ?? undefined,
        saved_plan_is_active: !!activePlan?.is_active,
        rendered_plan_exists: rendered_plan_exists ?? undefined,
        plan_state_reason: plan_state_reason || undefined,
        last_resort_inferred: initialPlanResult?.summary === 'deterministic_fallback_after_failure' || undefined,
        last_resort_plan_id: initialPlanResult?.summary === 'deterministic_fallback_after_failure' ? (initialPlanResult?.plan_id ?? activePlan?.id) : undefined,
        onboarding_result: hasValidPlan
          ? (initialPlanResult?.summary === 'deterministic_fallback_after_failure' ? 'fallback_success' : 'ai_success')
          : (initialPlanTask?.status === 'failed' || initialPlanTask?.status === 'dlq' ? 'failed' : undefined),
        self_heal_applied: selfHealApplied || undefined,
        required_modules: initialPlanResult?.required_modules ?? ['nutrition', 'training', 'habits'],
        completed_modules: initialPlanResult?.completed_modules ?? undefined,
        plan_scope: initialPlanResult?.plan_scope ?? 'initial_7_day_trial',
        missing_modules: initialPlanResult?.missing_modules ?? undefined,
      },
      weight_history: weightHistory,
      stats: {
        workouts_this_week: workoutsThisWeek,
        total_workouts: workouts.length
      },
      habit_summary_7d: {
        positiveDone,
        negativeDone,
        byHabit,
      },
    });
  } catch (err) {
    console.error('[profile] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
