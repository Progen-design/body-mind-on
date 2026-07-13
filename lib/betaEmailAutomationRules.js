/**
 * Pure beta email automation rules (no Supabase — safe for node verify scripts).
 */
import {
  BETA_EMAIL_TRIGGERS,
  BETA_EMAIL_COHORT_CODE,
  BETA_EMAIL_MAX_PER_7_DAYS,
  BETA_EMAIL_MIN_HOURS_BETWEEN,
  BETA_EMAIL_MS_24H,
  BETA_EMAIL_MS_48H,
  BETA_EMAIL_QUIET_START_HOUR,
  BETA_EMAIL_QUIET_END_HOUR,
} from './betaEmailAutomationConstants.js';
import { calendarDateIsoInPrague, addCalendarDaysIsoPrague } from './czechCalendar.js';

export function parseBetaEmailAutomationEnabled(raw) {
  return String(raw || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\r|\\n/g, '')
    .trim()
    .toLowerCase() === 'true';
}

export function isBetaEmailAutomationEnabled() {
  return parseBetaEmailAutomationEnabled(process.env.BETA_EMAIL_AUTOMATION_ENABLED);
}

export function isSyntheticBetaEmailUser(authUser) {
  if (!authUser) return true;
  const email = String(authUser.email || '').trim().toLowerCase();
  const meta = authUser.app_metadata || {};
  if (meta.synthetic_test_user === true) return true;
  if (email.includes('bm-smoke')) return true;
  if (email.includes('stripe-preview')) return true;
  if (email.includes('beta-join-') && email.endsWith('@bodyandmindon.cz')) return true;
  if (email.includes('beta-email-') && email.endsWith('@bodyandmindon.cz')) return true;
  return false;
}

const ELIGIBLE_PARTICIPANT_STATUSES = new Set(['registered', 'onboarding', 'active', 'completed']);
const ELIGIBLE_COHORT_STATUSES = new Set(['recruiting', 'active']);
const BLOCKED_COHORT_STATUSES = new Set(['paused', 'canceled', 'completed']);

export function isParticipantEligibleForAutomation(participant) {
  if (!participant?.user_id || !participant?.id) return false;
  if (!ELIGIBLE_PARTICIPANT_STATUSES.has(participant.participant_status || participant.status)) return false;
  if (participant.cohort_code !== BETA_EMAIL_COHORT_CODE) return false;
  if (!ELIGIBLE_COHORT_STATUSES.has(participant.cohort_status)) return false;
  if (BLOCKED_COHORT_STATUSES.has(participant.cohort_status)) return false;
  if (participant.automation_paused === true) return false;
  if (['dropped', 'excluded'].includes(participant.participant_status || participant.status)) return false;
  return true;
}

export function pragueHour(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour');
  return Number(h?.value ?? 0);
}

export function adjustToAllowedSendTime(date = new Date()) {
  const d = new Date(date.getTime());
  const hour = pragueHour(d);
  if (hour >= BETA_EMAIL_QUIET_START_HOUR || hour < BETA_EMAIL_QUIET_END_HOUR) {
    const iso = calendarDateIsoInPrague(d);
    let targetIso = iso;
    if (hour >= BETA_EMAIL_QUIET_START_HOUR) {
      targetIso = addCalendarDaysIsoPrague(iso, 1);
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetIso);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const da = Number(m[3]);
      return new Date(Date.UTC(y, mo - 1, da, 6, 0, 0));
    }
  }
  return d;
}

export function daysSinceRegistration(registeredAtIso, now = new Date()) {
  if (!registeredAtIso) return 0;
  const regDay = calendarDateIsoInPrague(new Date(registeredAtIso));
  const today = calendarDateIsoInPrague(now);
  const regMs = new Date(`${regDay}T12:00:00Z`).getTime();
  const todayMs = new Date(`${today}T12:00:00Z`).getTime();
  return Math.floor((todayMs - regMs) / (24 * 60 * 60 * 1000)) + 1;
}

export function canSendAnotherEmail(state, messages, now = new Date()) {
  const lastSent = state?.last_email_sent_at ? new Date(state.last_email_sent_at).getTime() : 0;
  if (lastSent && now.getTime() - lastSent < BETA_EMAIL_MIN_HOURS_BETWEEN * 60 * 60 * 1000) {
    return false;
  }

  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const sentCount = (messages || []).filter((m) => {
    if (m.status !== 'sent' || !m.sent_at) return false;
    return new Date(m.sent_at).getTime() >= weekAgo;
  }).length;

  if (sentCount >= BETA_EMAIL_MAX_PER_7_DAYS) return false;
  return true;
}

export function evaluateBetaEmailActions(participant, context = {}) {
  const now = context.now || new Date();
  const actions = [];

  if (!isBetaEmailAutomationEnabled()) return actions;
  if (!isParticipantEligibleForAutomation(participant)) return actions;

  const state = {
    welcome_sent_at: participant.welcome_sent_at,
    plan_ready_sent_at: participant.plan_ready_sent_at,
    no_plan_view_sent_at: participant.no_plan_view_sent_at,
    no_first_action_sent_at: participant.no_first_action_sent_at,
    day3_feedback_sent_at: participant.day3_feedback_sent_at,
    day7_feedback_sent_at: participant.day7_feedback_sent_at,
    last_email_sent_at: participant.last_email_sent_at,
  };

  if (!canSendAnotherEmail(state, context.messages || [], now)) {
    return actions;
  }

  const planReadyAt = context.planGenerationCompletedAt
    || participant.onboarding_completed_at
    || null;

  if (participant.registered_at && !state.welcome_sent_at) {
    actions.push({ triggerKey: 'beta_welcome', scheduledAt: adjustToAllowedSendTime(now) });
  }

  if (planReadyAt && !state.plan_ready_sent_at) {
    actions.push({ triggerKey: 'beta_plan_ready', scheduledAt: adjustToAllowedSendTime(now) });
  }

  if (
    planReadyAt
    && !participant.first_plan_viewed_at
    && !state.no_plan_view_sent_at
    && now.getTime() - new Date(planReadyAt).getTime() >= BETA_EMAIL_MS_24H
  ) {
    actions.push({ triggerKey: 'beta_no_plan_view_24h', scheduledAt: adjustToAllowedSendTime(now) });
  }

  if (
    participant.first_plan_viewed_at
    && !participant.first_action_at
    && !state.no_first_action_sent_at
    && now.getTime() - new Date(participant.first_plan_viewed_at).getTime() >= BETA_EMAIL_MS_48H
  ) {
    actions.push({ triggerKey: 'beta_no_first_action_48h', scheduledAt: adjustToAllowedSendTime(now) });
  }

  const day = daysSinceRegistration(participant.registered_at, now);
  if (day >= 3 && !state.day3_feedback_sent_at) {
    actions.push({ triggerKey: 'beta_day3_feedback', scheduledAt: adjustToAllowedSendTime(now) });
  }
  if (day >= 7 && !state.day7_feedback_sent_at) {
    actions.push({ triggerKey: 'beta_day7_feedback', scheduledAt: adjustToAllowedSendTime(now) });
  }

  return actions.filter((a) => BETA_EMAIL_TRIGGERS.includes(a.triggerKey));
}

export function pickNextBetaEmailAction(participant, context = {}) {
  const actions = evaluateBetaEmailActions(participant, context);
  const priority = [
    'beta_welcome',
    'beta_plan_ready',
    'beta_no_plan_view_24h',
    'beta_no_first_action_48h',
    'beta_day3_feedback',
    'beta_day7_feedback',
  ];
  for (const key of priority) {
    const found = actions.find((a) => a.triggerKey === key);
    if (found) return found;
  }
  return null;
}
