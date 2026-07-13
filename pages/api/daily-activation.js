// GET/POST /api/daily-activation — meal/workout completion toggles
import { supabaseServer } from '../../lib/supabaseServer';
import { createSupabaseUserClient } from '../../lib/supabaseUserClient';
import { requireActiveMembership } from '../../lib/membershipHelpers';
import { calendarDateIsoInPrague } from '../../lib/czechCalendar';
import { recordProductEvent } from '../../lib/recordProductEvent';
import { markFirstAction, markActivityDay } from '../../lib/betaParticipantMilestones';

const ALLOWED_TYPES = new Set(['meal', 'workout', 'habit']);

async function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Nejste přihlášen', status: 401 };
  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user?.id) return { error: 'Neplatná session', status: 401 };
  return { user, token };
}

export default async function handler(req, res) {
  const authResult = await getAuthUser(req);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error });
  }
  const { user, token } = authResult;

  const access = await requireActiveMembership(user.id);
  if (!access.allowed) {
    return res.status(403).json({ error: 'Členství není aktivní.' });
  }

  const db = createSupabaseUserClient(token);
  const todayIso = calendarDateIsoInPrague();

  if (req.method === 'GET') {
    const planId = req.query?.plan_id ? String(req.query.plan_id) : null;
    const planDay = Number(req.query?.plan_day);
    if (!Number.isFinite(planDay)) {
      return res.status(400).json({ error: 'Chybí plan_day.' });
    }

    let q = db
      .from('daily_activity_completions')
      .select('activity_type, activity_key, completed_at')
      .eq('user_id', user.id)
      .eq('plan_day', planDay);
    if (planId) q = q.eq('plan_id', planId);
    else q = q.is('plan_id', null);

    const { data, error } = await q;
    if (error) {
      return res.status(500).json({ error: 'Nepodařilo se načíst dokončení.' });
    }
    return res.status(200).json({ ok: true, completions: data || [], today: todayIso });
  }

  if (req.method === 'POST') {
    const action = String(req.body?.action || 'complete').trim();
    const activityType = String(req.body?.activity_type || '').trim();
    const activityKey = String(req.body?.activity_key || '').trim().slice(0, 120);
    const planId = req.body?.plan_id ? String(req.body.plan_id) : null;
    const planDay = Number(req.body?.plan_day);
    const sourceComponent = String(req.body?.source_component || 'BetaTodaySection').slice(0, 80);

    if (!ALLOWED_TYPES.has(activityType)) {
      return res.status(400).json({ error: 'Neplatný typ aktivity.' });
    }
    if (!activityKey) {
      return res.status(400).json({ error: 'Chybí activity_key.' });
    }
    if (!Number.isFinite(planDay) || planDay < 0 || planDay > 6) {
      return res.status(400).json({ error: 'Neplatný plan_day.' });
    }

    if (action === 'uncomplete') {
      let del = db
        .from('daily_activity_completions')
        .delete()
        .eq('user_id', user.id)
        .eq('plan_day', planDay)
        .eq('activity_type', activityType)
        .eq('activity_key', activityKey);
      if (planId) del = del.eq('plan_id', planId);
      else del = del.is('plan_id', null);
      const { error } = await del;
      if (error) return res.status(500).json({ error: 'Nepodařilo se zrušit dokončení.' });
      return res.status(200).json({ ok: true, completed: false });
    }

    const row = {
      user_id: user.id,
      plan_id: planId,
      plan_day: planDay,
      activity_type: activityType,
      activity_key: activityKey,
      completed_at: new Date().toISOString(),
    };

    const { error: insErr } = await db.from('daily_activity_completions').insert(row);
    if (insErr && insErr.code !== '23505') {
      return res.status(500).json({ error: 'Nepodařilo se uložit dokončení.' });
    }

    const eventMap = {
      meal: 'meal_completed',
      workout: 'workout_completed',
      habit: 'habit_completed',
    };
    await recordProductEvent({
      user_id: user.id,
      event_name: eventMap[activityType],
      properties: {
        day_number: planDay + 1,
        source_component: sourceComponent,
        success: true,
      },
    });
    markFirstAction(user.id).catch(() => {});
    markActivityDay(user.id).catch(() => {});

    return res.status(200).json({ ok: true, completed: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
