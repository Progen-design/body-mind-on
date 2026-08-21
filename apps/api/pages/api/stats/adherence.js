/**
 * GET /api/stats/adherence?date=YYYY-MM-DD
 * Calls public.get_daily_adherence(user.id, date) via service_role.
 * User id always from JWT — never from query.
 */
import { getAuthUser } from '../../../lib/health/apiAuth';
import { calendarDateIsoInPrague } from '../../../lib/czechCalendar';
import { fetchDailyAdherenceForUser } from '../../../lib/dailyAdherence';

function parseDateParam(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : calendarDateIsoInPrague();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await getAuthUser(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const date = parseDateParam(req.query?.date);
    const { adherence } = await fetchDailyAdherenceForUser(auth.user.id, date);

    return res.status(200).json({
      ok: true,
      date,
      adherence,
    });
  } catch (err) {
    console.error('[stats/adherence]', err?.message || err);
    return res.status(500).json({ error: 'Nepodařilo se načíst stav dne.' });
  }
}
