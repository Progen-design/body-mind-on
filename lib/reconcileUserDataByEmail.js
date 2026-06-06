import { supabaseServer } from './supabaseServer';

const USER_ID_TABLES = [
  'ai_generated_plans',
  'ai_tasks',
  'memberships',
  'user_habits',
  'habit_logs',
  'workouts',
  'user_ai_memory',
  'user_checkins',
  'ai_messages',
  'ai_content_drafts',
  'user_meal_pins',
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function safeUpdate(table, fromUserId, toUserId) {
  try {
    const { error } = await supabaseServer
      .from(table)
      .update({ user_id: toUserId })
      .eq('user_id', fromUserId);

    if (error) {
      console.warn('[reconcileUserDataByEmail] update skipped', {
        table,
        reason: error.message,
      });
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[reconcileUserDataByEmail] update failed', {
      table,
      reason: err?.message,
    });
    return false;
  }
}

export async function reconcileUserDataByEmail({ userId, email }) {
  const normalizedEmail = normalizeEmail(email);

  if (!userId || !normalizedEmail) {
    return { ok: false, reason: 'missing_user_or_email', movedFromUserIds: [] };
  }

  const { data: metricRows, error } = await supabaseServer
    .from('body_metrics')
    .select('id, user_id, email, created_at')
    .eq('email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.warn('[reconcileUserDataByEmail] body_metrics lookup failed', {
      reason: error.message,
    });
    return { ok: false, reason: 'body_metrics_lookup_failed', movedFromUserIds: [] };
  }

  const rows = Array.isArray(metricRows) ? metricRows : [];

  const oldUserIds = [
    ...new Set(
      rows
        .map((row) => row.user_id)
        .filter((id) => id && id !== userId)
    ),
  ];

  const hasNullMetricRows = rows.some((row) => !row.user_id);

  if (oldUserIds.length === 0 && !hasNullMetricRows) {
    return { ok: true, reason: 'nothing_to_reconcile', movedFromUserIds: [] };
  }

  await supabaseServer
    .from('body_metrics')
    .update({ user_id: userId })
    .eq('email', normalizedEmail)
    .is('user_id', null);

  for (const oldUserId of oldUserIds) {
    await supabaseServer
      .from('body_metrics')
      .update({ user_id: userId })
      .eq('user_id', oldUserId)
      .eq('email', normalizedEmail);

    for (const table of USER_ID_TABLES) {
      await safeUpdate(table, oldUserId, userId);
    }
  }

  console.info('[reconcileUserDataByEmail] completed', {
    userId,
    email: normalizedEmail,
    movedFromUserIds: oldUserIds,
    hadNullMetrics: hasNullMetricRows,
  });

  return {
    ok: true,
    reason: 'reconciled',
    movedFromUserIds: oldUserIds,
    hadNullMetrics: hasNullMetricRows,
  };
}
