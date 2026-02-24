// /pages/api/profile.js - Vrací data přihlášeného uživatele
import { supabaseServer } from '../../lib/supabaseServer';

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

    const [metricsRes, plansRes, workoutsRes, userHabitsRes] = await Promise.allSettled([
      supabaseServer
        .from('body_metrics')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseServer
        .from('ai_generated_plans')
        .select('id, plan_type, daily_calories, macros, valid_from, valid_until, created_at, plan_html')
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
        .order('sort_order', { ascending: true })
    ]);

    const bodyMetrics = (metricsRes.status === 'fulfilled' && metricsRes.value?.data) ? metricsRes.value.data : [];
    const plansData = (plansRes.status === 'fulfilled' && plansRes.value?.data) ? plansRes.value.data : [];
    const workouts = (workoutsRes.status === 'fulfilled' && workoutsRes.value?.data) ? workoutsRes.value.data : [];
    const userHabits = (userHabitsRes.status === 'fulfilled' && userHabitsRes.value?.data) ? userHabitsRes.value.data : [];
    const program = (() => {
      const reg = bodyMetrics.find(m => m.program) || bodyMetrics[bodyMetrics.length - 1];
      return reg?.program || 'START';
    })();
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

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const workoutsThisWeek = workouts.filter(w => (w.workout_date || '') >= weekStartStr).length;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    const meta = user.user_metadata || {};
    return res.status(200).json({
      program,
      user: {
        id: user.id,
        email: user.email,
        name: meta.name || null,
        start_weight_kg: meta.start_weight_kg != null ? Number(meta.start_weight_kg) : null,
        goal_weight_kg: meta.goal_weight_kg != null ? Number(meta.goal_weight_kg) : null,
        height_cm: meta.height_cm != null ? Number(meta.height_cm) : null,
        created_at: user.created_at || null,
      },
      body_metrics: bodyMetrics,
      user_habits: userHabits,
      plans: plansData,
      workouts,
      weight_history: weightHistory,
      stats: {
        workouts_this_week: workoutsThisWeek,
        total_workouts: workouts.length
      }
    });
  } catch (err) {
    console.error('[profile] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
