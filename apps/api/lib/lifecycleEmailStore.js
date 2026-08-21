/** Supabase vrstva pro lifecycle e-maily. Jen service-role (cron). */
import { supabaseServer } from './supabaseServer';
import {
  LIFECYCLE_DISPATCH_BATCH,
  LIFECYCLE_MAX_ATTEMPTS,
} from './lifecycleEmailConstants';

/**
 * Členství, která mohou dostat lifecycle e-mail.
 * Jen dva stavy — kdo platí nebo odešel, toho neotravujeme.
 */
export async function listCandidateMemberships() {
  const { data, error } = await supabaseServer
    .from('memberships')
    .select('user_id, tier, status, started_at, trial_ends_at')
    .in('status', ['pending_payment', 'trial'])
    .limit(500);
  if (error) {
    console.error('[lifecycle-email] listCandidateMemberships:', error.message);
    return [];
  }
  return data || [];
}

/**
 * @param {string} userId
 * @returns {Promise<{ sentKeys: string[], allKeys: string[], lastSentAt: string|null }>}
 */
export async function getUserEmailHistory(userId) {
  const { data, error } = await supabaseServer
    .from('lifecycle_emails')
    .select('trigger_key, status, sent_at')
    .eq('user_id', userId);

  if (error || !data) return { sentKeys: [], allKeys: [], lastSentAt: null };

  // Do „už posláno" počítáme i queued/processing — jinak by cron při každém
  // běhu zařadil ten samý trigger znovu, než se stihne odeslat.
  const allKeys = data
    .filter((r) => ['queued', 'processing', 'sent', 'skipped'].includes(r.status))
    .map((r) => r.trigger_key);

  const sentRows = data.filter((r) => r.status === 'sent' && r.sent_at);
  const lastSentAt = sentRows.length
    ? sentRows.map((r) => r.sent_at).sort().at(-1)
    : null;

  return { sentKeys: sentRows.map((r) => r.trigger_key), allKeys, lastSentAt };
}

/**
 * @param {string} userId
 * @param {string} triggerKey
 * @param {Date} scheduledAt
 */
export async function queueLifecycleEmail(userId, triggerKey, scheduledAt) {
  const { error } = await supabaseServer
    .from('lifecycle_emails')
    .insert([{
      user_id: userId,
      trigger_key: triggerKey,
      status: 'queued',
      scheduled_at: scheduledAt.toISOString(),
    }]);

  // 23505 = unikátní index — někdo to zařadil dřív. Není to chyba.
  if (error) {
    if (error.code === '23505') return { queued: false, already_exists: true };
    console.error('[lifecycle-email] queue failed:', error.message);
    return { queued: false, error: error.message };
  }
  return { queued: true };
}

/** Vybere dávku k odeslání a rovnou ji označí jako processing. */
export async function claimQueuedEmails(limit = LIFECYCLE_DISPATCH_BATCH) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from('lifecycle_emails')
    .select('id, user_id, trigger_key, attempt_count')
    .eq('status', 'queued')
    .lte('scheduled_at', nowIso)
    .lt('attempt_count', LIFECYCLE_MAX_ATTEMPTS)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error || !data?.length) return [];

  const ids = data.map((r) => r.id);
  const { error: claimErr } = await supabaseServer
    .from('lifecycle_emails')
    .update({ status: 'processing', updated_at: nowIso })
    .in('id', ids)
    .eq('status', 'queued'); // znovu ověřit — kdyby běžel druhý cron

  if (claimErr) {
    console.error('[lifecycle-email] claim failed:', claimErr.message);
    return [];
  }
  return data;
}

export async function markSent(id, providerMessageId) {
  const now = new Date().toISOString();
  await supabaseServer
    .from('lifecycle_emails')
    .update({
      status: 'sent',
      sent_at: now,
      updated_at: now,
      provider_message_id: providerMessageId || null,
    })
    .eq('id', id);
}

export async function markFailed(id, errorCode, attemptCount) {
  const next = Number(attemptCount || 0) + 1;
  const now = new Date().toISOString();
  await supabaseServer
    .from('lifecycle_emails')
    .update({
      // Ještě zbývají pokusy → zpátky do fronty. Jinak končíme.
      status: next >= LIFECYCLE_MAX_ATTEMPTS ? 'failed' : 'queued',
      attempt_count: next,
      error_code: errorCode || 'send_failed',
      updated_at: now,
    })
    .eq('id', id);
}

export async function markSkipped(id, errorCode) {
  const now = new Date().toISOString();
  await supabaseServer
    .from('lifecycle_emails')
    .update({ status: 'skipped', error_code: errorCode || 'skipped', updated_at: now })
    .eq('id', id);
}

/** @returns {Promise<string|null>} */
export async function getUserEmail(userId) {
  const { data, error } = await supabaseServer.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}
