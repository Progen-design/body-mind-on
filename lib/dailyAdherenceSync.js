/**
 * Nightly sync: write derived hodnoceni from get_daily_adherence into daily_checkins (compat).
 */
import { supabaseServer } from './supabaseServer';
import {
  fetchDailyAdherenceForUser,
  hodnoceniToCheckinRating,
} from './dailyAdherence';
import { calendarDateIsoInPrague, addCalendarDaysIsoPrague } from './czechCalendar';

/**
 * Sync one user's derived check-in for a calendar date.
 * @param {string} userId
 * @param {string} dateIso
 * @returns {Promise<'synced'|'skipped'|'failed'>}
 */
export async function syncDailyCheckinFromAdherence(userId, dateIso) {
  try {
    const { adherence } = await fetchDailyAdherenceForUser(userId, dateIso);
    const rating = hodnoceniToCheckinRating(adherence?.hodnoceni);
    if (!rating || !adherence || adherence.planovanych_jidel <= 0) {
      return 'skipped';
    }

    const now = new Date().toISOString();
    const { error } = await supabaseServer
      .from('daily_checkins')
      .upsert(
        {
          user_id: userId,
          checkin_date: dateIso,
          rating,
          blocker: null,
          updated_at: now,
        },
        { onConflict: 'user_id,checkin_date' },
      );

    if (error) return 'failed';
    return 'synced';
  } catch {
    return 'failed';
  }
}

/**
 * Sync yesterday's derived check-ins for users with an active plan.
 */
export async function runDailyAdherenceSyncBatch() {
  const targetDate = addCalendarDaysIsoPrague(calendarDateIsoInPrague(), -1);

  const { data: planRows, error } = await supabaseServer
    .from('ai_generated_plans')
    .select('user_id')
    .eq('is_active', true);

  if (error) throw error;

  const userIds = [...new Set((planRows || []).map((r) => r.user_id).filter(Boolean))];
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await syncDailyCheckinFromAdherence(userId, targetDate);
    if (result === 'synced') synced += 1;
    else if (result === 'skipped') skipped += 1;
    else failed += 1;
  }

  return {
    target_date: targetDate,
    users_total: userIds.length,
    synced,
    skipped,
    failed,
  };
}
