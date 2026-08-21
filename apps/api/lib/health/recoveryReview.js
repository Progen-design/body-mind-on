const LOW_RECOVERY_THRESHOLD = 50;
const LOW_RECOVERY_STREAK_DAYS = 2;

function addCalendarDay(isoDate, deltaDays) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function buildAggregatedRecoveryDay(row) {
  return {
    local_date: row.local_date,
    recovery_score: row.recovery_score,
    recovery_status: row.recovery_status,
    hrv_ms: row.hrv_ms,
    resting_hr: row.resting_hr,
    sleep_asleep_min: row.sleep_asleep_min,
    steps: row.steps,
    active_kcal: row.active_kcal,
    exercise_min: row.exercise_min,
    hrv_baseline7: row.hrv_baseline7,
    rhr_baseline7: row.rhr_baseline7,
    hrv_delta_pct: row.hrv_delta_pct,
    rhr_delta_bpm: row.rhr_delta_bpm,
    workout_count: row.workout_count,
    workout_labels: row.workout_labels,
  };
}

export function hasConsecutiveLowRecovery(
  rows,
  threshold = LOW_RECOVERY_THRESHOLD,
  needed = LOW_RECOVERY_STREAK_DAYS,
) {
  const eligible = (rows || [])
    .filter((row) => row?.recovery_status === 'ok' && Number.isFinite(Number(row?.recovery_score)))
    .map((row) => ({
      date: String(row.local_date).slice(0, 10),
      score: Number(row.recovery_score),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let streak = 0;
  let prevDate = null;

  for (const row of eligible) {
    if (row.score < threshold) {
      if (prevDate && addCalendarDay(prevDate, 1) === row.date) {
        streak += 1;
      } else {
        streak = 1;
      }
      prevDate = row.date;
      if (streak >= needed) return true;
    } else {
      streak = 0;
      prevDate = row.date;
    }
  }

  return false;
}

export function buildAggregatedRecoverySummary(rows, periodDays = 14) {
  const daily = (rows || []).map(buildAggregatedRecoveryDay);
  const latest = daily[0] || null;
  return {
    period_days: periodDays,
    generated_at: new Date().toISOString(),
    latest_recovery_score: latest?.recovery_score ?? null,
    latest_recovery_status: latest?.recovery_status ?? null,
    consecutive_low_recovery: hasConsecutiveLowRecovery(rows),
    daily,
  };
}
