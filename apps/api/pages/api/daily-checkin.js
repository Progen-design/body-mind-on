// GET/POST /api/daily-checkin — one check-in per calendar day (Europe/Prague)
import { supabaseServer } from '../../lib/supabaseServer';
import { createSupabaseUserClient } from '../../lib/supabaseUserClient';
import { requireActiveMembership } from '../../lib/membershipHelpers';
import { calendarDateIsoInPrague } from '../../lib/czechCalendar';
import {
  CHECKIN_RATINGS,
  CHECKIN_BLOCKERS,
  CHECKIN_RATING_SCORE,
} from '../../lib/productEventAllowlist';
import { recordProductEvent } from '../../lib/recordProductEvent';
import { markActivityDay } from '../../lib/betaParticipantMilestones';

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
  const checkinDate = calendarDateIsoInPrague();

  if (req.method === 'GET') {
    const { data } = await db
      .from('daily_checkins')
      .select('rating, blocker, updated_at')
      .eq('user_id', user.id)
      .eq('checkin_date', checkinDate)
      .maybeSingle();
    return res.status(200).json({ ok: true, checkin: data || null, checkin_date: checkinDate });
  }

  if (req.method === 'POST') {
    const rating = String(req.body?.rating || '').trim();
    const blocker = req.body?.blocker ? String(req.body.blocker).trim() : null;

    if (!CHECKIN_RATINGS.includes(rating)) {
      return res.status(400).json({ error: 'Neplatné hodnocení.' });
    }
    if (blocker && !CHECKIN_BLOCKERS.includes(blocker)) {
      return res.status(400).json({ error: 'Neplatný důvod.' });
    }

    const now = new Date().toISOString();
    const row = {
      user_id: user.id,
      checkin_date: checkinDate,
      rating,
      blocker,
      updated_at: now,
    };

    const { error } = await db
      .from('daily_checkins')
      .upsert(row, { onConflict: 'user_id,checkin_date' });

    if (error) {
      return res.status(500).json({ error: 'Check-in se nepodařilo uložit.' });
    }

    await recordProductEvent({
      user_id: user.id,
      event_name: 'daily_checkin_completed',
      properties: {
        feedback_score: CHECKIN_RATING_SCORE[rating] || 1,
        source_component: 'DailyCheckin',
        success: true,
      },
    });
    markActivityDay(user.id).catch(() => {});

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
