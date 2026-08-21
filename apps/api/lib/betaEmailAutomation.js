/**
 * Beta lifecycle email automation — evaluation, queue, dispatch helpers.
 */
import { supabaseServer } from './supabaseServer';
import { BETA_EMAIL_COHORT_CODE, BETA_EMAIL_MAX_ATTEMPTS } from './betaEmailAutomationConstants';

export {
  isBetaEmailAutomationEnabled,
  isSyntheticBetaEmailUser,
  isParticipantEligibleForAutomation,
  pragueHour,
  adjustToAllowedSendTime,
  daysSinceRegistration,
  canSendAnotherEmail,
  evaluateBetaEmailActions,
  pickNextBetaEmailAction,
} from './betaEmailAutomationRules';

export async function queueBetaEmail(participantId, userId, triggerKey, scheduledAt) {
  const { data, error } = await supabaseServer.rpc('queue_beta_email_message', {
    p_participant_id: participantId,
    p_user_id: userId,
    p_trigger_key: triggerKey,
    p_scheduled_at: new Date(scheduledAt).toISOString(),
  });
  if (error) {
    console.error('[betaEmailAutomation] queue failed');
    return { ok: false, error_code: 'queue_failed' };
  }
  return data || { ok: false };
}

export async function claimQueuedEmails(limit = 20) {
  const { data, error } = await supabaseServer.rpc('claim_beta_email_batch', {
    p_limit: limit,
    p_stale_minutes: 15,
  });
  if (error) {
    console.error('[betaEmailAutomation] claim failed');
    return [];
  }
  return data || [];
}

export async function markEmailSent(messageId, providerMessageId = null) {
  const { data, error } = await supabaseServer.rpc('mark_beta_email_sent', {
    p_message_id: messageId,
    p_provider_message_id: providerMessageId,
  });
  if (error) {
    console.error('[betaEmailAutomation] mark sent failed');
    return false;
  }
  return data === true;
}

export async function markEmailFailed(messageId, errorCode, attemptCount = 1) {
  let retryAt = null;
  if (attemptCount < BETA_EMAIL_MAX_ATTEMPTS) {
    const backoffMs = Math.pow(2, attemptCount) * 15 * 60 * 1000;
    retryAt = new Date(Date.now() + backoffMs).toISOString();
  }
  const { error } = await supabaseServer.rpc('mark_beta_email_failed', {
    p_message_id: messageId,
    p_error_code: String(errorCode || 'send_failed').slice(0, 64),
    p_retry_at: retryAt,
  });
  if (error) {
    console.error('[betaEmailAutomation] mark failed failed');
    return false;
  }
  return true;
}

export async function cancelParticipantEmails(participantId) {
  const { data, error } = await supabaseServer.rpc('cancel_beta_participant_emails', {
    p_participant_id: participantId,
  });
  if (error) {
    console.error('[betaEmailAutomation] cancel failed');
    return 0;
  }
  return Number(data || 0);
}

export async function listEmailParticipants(cohortCode = BETA_EMAIL_COHORT_CODE) {
  const { data, error } = await supabaseServer.rpc('list_beta_email_participants', {
    p_cohort_code: cohortCode,
  });
  if (error) {
    console.error('[betaEmailAutomation] list participants failed');
    return [];
  }
  return Array.isArray(data) ? data : (data ? JSON.parse(JSON.stringify(data)) : []);
}

export async function getPlanGenerationCompletedAt(userId) {
  const { data } = await supabaseServer
    .from('product_events')
    .select('created_at')
    .eq('user_id', userId)
    .eq('event_name', 'plan_generation_completed')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.created_at || null;
}

export async function getParticipantMessages(participantId) {
  const { data } = await supabaseServer
    .from('beta_email_messages')
    .select('trigger_key, status, sent_at, scheduled_at, attempt_count')
    .eq('participant_id', participantId);
  return data || [];
}

export async function getUserEmailById(userId) {
  const { data, error } = await supabaseServer.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user;
}
