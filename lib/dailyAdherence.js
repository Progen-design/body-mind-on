/**
 * Daily plan adherence — derived from meal completions, workout, Apple Watch.
 * Backed by public.get_daily_adherence(user_id, date).
 */
import { supabaseServer } from './supabaseServer';
import { calendarDateIsoInPrague, addCalendarDaysIsoPrague } from './czechCalendar';

export const HODNOCENI_UI = Object.freeze({
  skvele: { label: 'Skvěle', emoji: '🌟' },
  dobre: { label: 'Dobře', emoji: '✅' },
  castecne: { label: 'Částečně', emoji: '🟡' },
  slabe: { label: 'Slabě', emoji: '🟠' },
  zadna_data: { label: 'Zatím nic', emoji: '—' },
});

const HODNOCENI_TO_CHECKIN_RATING = Object.freeze({
  skvele: 'great',
  dobre: 'good',
  castecne: 'partial',
  slabe: 'none',
  zadna_data: null,
});

/**
 * @param {object|null|undefined} row
 * @returns {object|null}
 */
export function normalizeAdherenceRow(row) {
  if (!row || typeof row !== 'object') return null;
  const hodnoceni = String(row.hodnoceni || 'zadna_data').toLowerCase().trim();
  return {
    planovanych_jidel: Number(row.planovanych_jidel) || 0,
    splnenych_jidel: Number(row.splnenych_jidel) || 0,
    treninkovy_den: row.treninkovy_den === true,
    trenink_splnen: row.trenink_splnen === true,
    pohyb_min: Number(row.pohyb_min) || 0,
    adherence_pct: Number(row.adherence_pct) || 0,
    hodnoceni: HODNOCENI_UI[hodnoceni] ? hodnoceni : 'zadna_data',
    watch_workout_count: Number(row.watch_workout_count) || 0,
    manual_workout_count: Number(row.manual_workout_count) || 0,
  };
}

/**
 * @param {string} hodnoceni
 * @returns {string|null}
 */
export function hodnoceniToCheckinRating(hodnoceni) {
  const key = String(hodnoceni || '').toLowerCase().trim();
  return HODNOCENI_TO_CHECKIN_RATING[key] ?? null;
}

/**
 * @param {string} userId
 * @param {string} [dateIso] YYYY-MM-DD (Prague calendar)
 * @returns {Promise<{ date: string, adherence: object|null }>}
 */
export async function fetchDailyAdherenceForUser(userId, dateIso = calendarDateIsoInPrague()) {
  const date = String(dateIso || '').slice(0, 10) || calendarDateIsoInPrague();
  if (!userId) {
    return { date, adherence: null };
  }

  const [{ data: rpcRows, error: rpcErr }, { data: watchRow }] = await Promise.all([
    supabaseServer.rpc('get_daily_adherence', {
      p_user_id: userId,
      p_date: date,
    }),
    supabaseServer
      .from('apple_health_daily')
      .select('workout_count, exercise_min')
      .eq('user_id', userId)
      .eq('local_date', date)
      .maybeSingle(),
  ]);

  if (rpcErr) {
    throw rpcErr;
  }

  const base = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  const watchWorkoutCount = Number(watchRow?.workout_count) || 0;
  const exerciseMin = Number(watchRow?.exercise_min) || Number(base?.pohyb_min) || 0;

  let manualWorkoutCount = 0;
  if (base?.trenink_splnen === true && watchWorkoutCount === 0 && exerciseMin < 30) {
    const { count } = await supabaseServer
      .from('daily_activity_completions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('activity_type', 'workout')
      .gte('completed_at', `${date}T00:00:00`)
      .lt('completed_at', `${addCalendarDaysIsoPrague(date, 1)}T00:00:00`);
    manualWorkoutCount = count || 0;
  }

  const adherence = normalizeAdherenceRow({
    ...base,
    pohyb_min: Number(base?.pohyb_min) || exerciseMin,
    watch_workout_count: watchWorkoutCount,
    manual_workout_count: manualWorkoutCount,
  });

  return { date, adherence };
}

/**
 * Average adherence_pct over recent days with a meal plan (planovanych_jidel > 0).
 * @param {string} userId
 * @param {number} [days]
 * @returns {Promise<number|null>}
 */
export async function fetchRecentAdherenceAverage(userId, days = 7) {
  if (!userId || days < 1) return null;

  const scores = [];
  const today = calendarDateIsoInPrague();

  for (let i = 0; i < days; i += 1) {
    const date = addCalendarDaysIsoPrague(today, -i);
    try {
      const { adherence } = await fetchDailyAdherenceForUser(userId, date);
      if (adherence && adherence.planovanych_jidel > 0) {
        scores.push(adherence.adherence_pct);
      }
    } catch {
      /* skip day */
    }
  }

  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
