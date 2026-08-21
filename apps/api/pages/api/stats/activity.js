/**
 * GET /api/stats/activity?days=7|30|90|3650
 * Calls public.get_user_activity_stats(user.id, days) via service_role.
 * User id always from JWT — never from query.
 */
import { getAuthUser } from '../../../lib/health/apiAuth';
import { supabaseServer } from '../../../lib/supabaseServer';
import {
  parseActivityStatsDays,
  normalizeActivityStatsRow,
} from '../../../lib/stats/activityStats';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await getAuthUser(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const days = parseActivityStatsDays(req.query?.days);
    const userId = auth.user.id;

    const { data, error } = await supabaseServer.rpc('get_user_activity_stats', {
      p_user_id: userId,
      p_days: days,
    });

    if (error) {
      console.error('[stats/activity] rpc', error.message || error);
      return res.status(500).json({ error: 'Nepodařilo se načíst statistiky aktivity.' });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const stats = normalizeActivityStatsRow(row);

    // Match SQL: local_date >= current_date - p_days
    const since = new Date();
    since.setHours(12, 0, 0, 0);
    since.setDate(since.getDate() - days);
    const y = since.getFullYear();
    const m = String(since.getMonth() + 1).padStart(2, '0');
    const d = String(since.getDate()).padStart(2, '0');
    const sinceStr = `${y}-${m}-${d}`;

    const { data: daily, error: dailyErr } = await supabaseServer
      .from('apple_health_daily')
      .select('local_date, steps, exercise_min, active_kcal, workout_count, workout_min, workout_types, workout_labels')
      .eq('user_id', userId)
      .gte('local_date', sinceStr)
      .order('local_date', { ascending: true });

    if (dailyErr) {
      console.error('[stats/activity] daily', dailyErr.message || dailyErr);
      return res.status(500).json({ error: 'Nepodařilo se načíst denní data aktivity.' });
    }

    return res.status(200).json({
      days,
      stats,
      daily: daily || [],
    });
  } catch (err) {
    console.error('[stats/activity]', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Nepodařilo se načíst statistiky.' });
  }
}
