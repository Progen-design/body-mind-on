/**
 * ČISTÁ PRAVIDLA OBNOVY PLÁNU — bez DB.
 *
 * PROČ SAMOSTATNÝ MODUL. `canRenewPlanForMembership` je čistá funkce, ale žila
 * v lib/planGenerationGate.js vedle `canRunPlanTask`, který sahá na Supabase
 * přes `import … from './supabaseServer.js'` BEZ PŘÍPONY. Next.js si to dořeší
 * bundlerem, holý Node ESM ne — takže si tu funkci nemohl naimportovat ani
 * skript, ani test, ani klient. A ona přitom vznikla právě k tomu, aby si
 * pravidla neopisovalo UI (profil) a ověřovací skripty.
 *
 * Tady je v listu závislostního grafu: nemá žádný import, takže ji smí použít
 * kdokoli. `planGenerationGate.js` ji importuje a re-exportuje, aby dosavadní
 * volající nemuseli měnit cestu.
 */

/** Typy úloh, které vyrábějí plán. */
export const PLAN_TASK_TYPES = Object.freeze([
  'initial_plan',
  'adjust_plan',
  'reduce_training_load',
  'weekly_plan_update',
  'next_week_plan',
  'regenerate_plan',
]);

const PLAN_TASK_TYPE_SET = new Set(PLAN_TASK_TYPES);

/**
 * @param {string|null|undefined} agentSlug
 * @param {string|null|undefined} taskType
 * @returns {boolean}
 */
export function isPlanTask(agentSlug, taskType) {
  return String(agentSlug || '').toLowerCase() === 'trainer'
    || PLAN_TASK_TYPE_SET.has(String(taskType || ''));
}

/**
 * @param {string|Date|null|undefined} dateValue
 * @returns {boolean}
 */
export function isExpired(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

/**
 * Má se uživateli uprostřed trialu říct, že týdenní plán je až za předplatné?
 *
 * Bydlí tady, ne v komponentě, ze dvou důvodů: je to pravidlo o obnově plánu
 * (patří k ostatním) a komponenta s JSX se nedá naimportovat do testu v holém
 * Node. Rozhoduje `reason` z `canRenewPlanForMembership()`, takže UI si expiraci
 * nedovozuje z datumů.
 *
 * @param {{ plan_renewal?: { reason?: string }|null }|null|undefined} profile
 * @returns {boolean}
 */
export function shouldShowTrialPlanScopeNote(profile) {
  return profile?.plan_renewal?.reason === 'start_trial_allows_initial_plan_only';
}

/**
 * Smí tomuhle členství vzniknout NÁSLEDNÝ plán (tj. jiný než initial_plan)?
 *
 * Čistá funkce nad už načteným řádkem z `memberships`. Existuje proto, aby UI
 * nemuselo pravidla opisovat: profil potřebuje uživateli po expiraci plánu říct,
 * jestli nový přijde, nebo nepřijde — a to je přesně tahle otázka. Kdyby si
 * odpověď UI odvozovalo samo, rozejde se to s bránou při první změně tarifu
 * a uživateli slíbíme plán, který mu scheduler nikdy nevygeneruje.
 *
 * Držet v souladu s canRunPlanTask() v planGenerationGate.js pro
 * taskType !== 'initial_plan'.
 *
 * @param {{ tier?: string, status?: string, trial_ends_at?: string|null }|null|undefined} membership
 * @returns {{ allowed: boolean, reason: string, trialEnded: boolean }}
 */
export function canRenewPlanForMembership(membership) {
  if (!membership) {
    return { allowed: false, reason: 'missing_membership_for_plan_task', trialEnded: false };
  }

  const tier = String(membership.tier || '').toUpperCase();
  const status = String(membership.status || '');
  const trialEnded = isExpired(membership.trial_ends_at);

  if (status === 'pending_payment') {
    return { allowed: false, reason: 'pending_payment_upgrade_required', trialEnded };
  }
  if (status === 'past_due') {
    return { allowed: false, reason: 'paid_membership_past_due', trialEnded };
  }

  if (tier === 'START') {
    if (status === 'active') return { allowed: true, reason: 'start_active', trialEnded };
    if (trialEnded) {
      return { allowed: false, reason: 'start_trial_expired_upgrade_required', trialEnded: true };
    }
    // Trial ještě běží, ale opakovaný plán do něj nepatří — dostane jen ten první.
    return { allowed: false, reason: 'start_trial_allows_initial_plan_only', trialEnded: false };
  }

  if (status === 'active') return { allowed: true, reason: `${tier}_active`, trialEnded };

  return { allowed: false, reason: 'paid_membership_inactive', trialEnded };
}
