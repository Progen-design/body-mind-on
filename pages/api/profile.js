// /pages/api/profile.js - Vrací data přihlášeného uživatele
import { supabaseServer } from '../../lib/supabaseServer';
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../../lib/habits';

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

    const now = new Date();
    const regDate = user.created_at ? new Date(user.created_at) : null;
    const regDow = regDate != null ? regDate.getDay() : 1;
    const daysSinceWeekStart = (now.getDay() - regDow + 7) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceWeekStart);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const [metricsRes, plansRes, workoutsRes, userHabitsRes, membershipRes, habitLogsRes, profileRes, coachMessagesRes] = await Promise.allSettled([
      supabaseServer
        .from('body_metrics')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseServer
        .from('ai_generated_plans')
        .select('id, plan_type, daily_calories, macros, valid_from, valid_until, created_at, plan_html, is_active')
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
    ]);

    const bodyMetrics = (metricsRes.status === 'fulfilled' && metricsRes.value?.data) ? metricsRes.value.data : [];
    let plansData = (plansRes.status === 'fulfilled' && plansRes.value?.data) ? plansRes.value.data : [];
    const activePlan = plansData.find((p) => p.is_active === true);
    const hasActivePlan = !!activePlan;
    const currentPlanForDiagnostics = activePlan || plansData.find((p) => p.plan_html && typeof p.plan_html === 'string' && p.plan_html.length > 0);
    const currentPlanHtmlLength = currentPlanForDiagnostics?.plan_html?.length ?? 0;
    const hasValidPlan = currentPlanHtmlLength >= 1000;
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

    const workoutsThisWeek = workouts.filter(w => (w.workout_date || '') >= weekStartStr).length;

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

    const trainerEmail = (process.env.TRAINER_EMAIL || '').toLowerCase().trim();
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
        plans_count: plansData.length,
        has_active_plan: hasActivePlan,
        current_plan_html_length: currentPlanHtmlLength,
        has_valid_plan: hasValidPlan,
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
