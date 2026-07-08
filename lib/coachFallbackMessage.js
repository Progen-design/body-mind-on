/**
 * Deterministická coach zpráva při OpenAI quota / auth / rate limit — bez halucinací.
 */

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isOpenAIQuotaOrRateLimitError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = err?.status ?? err?.code ?? err?.statusCode;
  if (status === 429 || status === '429') return true;
  return /429|quota exceeded|insufficient_quota|rate_limit|rate limit|exceeded your current quota/.test(msg);
}

/**
 * OpenAI auth/config errors where coach should use deterministic fallback instead of DLQ.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isOpenAIAuthError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = err?.status ?? err?.code ?? err?.statusCode;
  if (status === 401 || status === '401' || status === 403 || status === '403') return true;
  return /incorrect api key|invalid api key|invalid_api_key|authentication|unauthorized|permission denied|api key provided/.test(msg);
}

/**
 * Coach task should fall back to deterministic message for transient OpenAI failures.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isOpenAICoachFallbackError(err) {
  return isOpenAIQuotaOrRateLimitError(err) || isOpenAIAuthError(err);
}

/**
 * @param {unknown} err
 * @returns {'openai_quota_or_rate_limit'|'openai_auth_error'|null}
 */
export function getOpenAICoachFallbackReason(err) {
  if (isOpenAIAuthError(err)) return 'openai_auth_error';
  if (isOpenAIQuotaOrRateLimitError(err)) return 'openai_quota_or_rate_limit';
  return null;
}

/**
 * @param {string|null|undefined} fullName
 * @returns {string|null}
 */
function firstNameFromMetrics(fullName) {
  const part = String(fullName || '').trim().split(/\s+/)[0];
  return part || null;
}

/**
 * @param {object} params
 * @param {object|null|undefined} params.bodyMetrics
 * @param {Array<{ id?: string, label?: string }>|null|undefined} params.userHabits
 * @param {object|null|undefined} params.latestPlan
 * @param {string|null|undefined} params.taskType
 * @returns {{ ok: true, message: string, coaching_plan: object, assumptions: string[] }}
 */
export function buildCoachFallbackMessage({ bodyMetrics, userHabits, latestPlan, taskType }) {
  const firstName = firstNameFromMetrics(bodyMetrics?.name);
  const greeting = firstName ? `Ahoj ${firstName}` : 'Ahoj';
  const habits = Array.isArray(userHabits) ? userHabits : [];
  const habitLabel = habits[0]?.label || habits[0]?.id || null;
  const habitTip = habitLabel
    ? `Splň aspoň návyk „${habitLabel}“ — klidně jen malý krok.`
    : 'Vyber si jeden jednoduchý návyk z plánu a splň ho dnes.';

  const hasPlan = Boolean(latestPlan?.id);
  const planRef = hasPlan ? 'plán máš připravený v aplikaci' : 'plán najdeš v aplikaci po přihlášení';

  let message;
  const type = String(taskType || 'onboarding_message');

  if (type === 'recovery_message') {
    message = `${greeting}, dnes je v pořádku jít na lehčí režim. Prioritou je spánek, voda a klid. ${habitTip} Pokud nestihneš všechno, nevadí — zítra navážeš.`;
  } else if (type === 'motivation_message') {
    message = `${greeting}, nemusíš mít všechno hned perfektní. Udělej dnes jeden malý krok podle plánu. ${habitTip} Důležité je udržet rytmus.`;
  } else if (type === 'positive_reinforcement') {
    message = `${greeting}, dobrá práce — drž se plánu i nadále. Dnes stačí plynule navázat dalším jídlem nebo tréninkem z aplikace.`;
  } else {
    message = `${greeting}, ${planRef}. Dnes neřeš dokonalost — začni prvním jídlem z plánu a jedním krátkým tréninkem, pokud ho dnes máš. ${habitTip} Pokud nestihneš všechno, nevadí. Důležité je rozjet rytmus a zítra navázat.`;
  }

  const words = message.split(/\s+/).filter(Boolean);
  if (words.length > 120) {
    message = `${words.slice(0, 120).join(' ')}…`;
  }

  return {
    ok: true,
    message,
    coaching_plan: {
      weekly_focus: 'První malý krok podle plánu — bez dokonalosti.',
      daily_actions: [
        'První jídlo z plánu',
        habitLabel ? `Návyk: ${habitLabel}` : 'Jeden jednoduchý návyk',
      ],
      obstacle_plan: ['Nestihneš vše? Splň aspoň jednu věc a zítra navázat.'],
      checkin_questions: ['Co dnes půjde nejlíž jako první krok?'],
    },
    assumptions: ['Fallback zpráva — OpenAI dočasně nedostupné (quota/auth).'],
  };
}
