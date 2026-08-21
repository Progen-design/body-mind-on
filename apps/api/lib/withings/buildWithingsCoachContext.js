// /lib/withings/buildWithingsCoachContext.js
import { stripRawPayload } from './normalizeWithingsMeasures.js';

function normalizeGoal(userGoal) {
  const g = String(userGoal || '').toLowerCase();
  if (/reduk|hubn|tuk|cut|loss/.test(g)) return 'reduction';
  if (/sval|gain|bulk|nárůst/.test(g)) return 'muscle_gain';
  return 'maintenance';
}

/**
 * Bezpečný kontext pro budoucí TED/AI coach — bez tokenů a raw payloadů.
 */
export function buildWithingsCoachContext(user, latest, trends, options = {}) {
  const safeLatest = latest ? stripRawPayload(latest) : null;
  const goal = normalizeGoal(options.userGoal || user?.user_metadata?.goal || user?.goal);

  return {
    source: 'withings',
    latest: safeLatest,
    trend7d: trends?.trend7d || {},
    trend30d: trends?.trend30d || {},
    goal,
    notes: [
      'values are consumer scale estimates',
      'do not provide medical diagnosis',
    ],
  };
}
