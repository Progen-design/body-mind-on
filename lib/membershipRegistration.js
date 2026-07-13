/**
 * Vytvoření membership záznamu při registraci.
 *
 * ZMĚNA (varianta B): START už NEZAKLÁDÁ lokální 7denní trial.
 * Trial nově drží Stripe (trial_period_days v checkout session) a do naší
 * databáze se propíše webhookem až po dokončení platby.
 *
 * Registrace tedy končí ve stavu `pending_payment`:
 *   - účet existuje, plán je vygenerovaný
 *   - přístup je zamčený, dokud uživatel neprojde checkoutem
 *   - v checkoutu dostane 7 dní zdarma a platí až 8. den
 *
 * Proč takhle: lokální trial znamenal, že Stripe o uživateli nevěděl,
 * 8. den se nic nestrhlo a člověk tiše odešel. Jediný zdroj pravdy
 * o předplatném je teď Stripe.
 */

/**
 * @param {string} program - START | ON_CLUB | VIP
 * @param {string} [startedAt] ISO timestamp
 * @returns {{ tier: string, status: string, trial_ends_at: string|null, started_at: string }}
 */
export function membershipFromRegistration(program, startedAt = new Date().toISOString()) {
  const normalized = String(program || 'START').toUpperCase();
  const tier = normalized === 'ON_CLUB' || normalized === 'VIP' ? normalized : 'START';

  return {
    tier,
    status: 'pending_payment',
    trial_ends_at: null,
    started_at: startedAt,
  };
}

/**
 * Stavy, které se registrací NESMÍ přepsat.
 * Kdyby platící uživatel znovu prošel dotazníkem, nesmí spadnout
 * zpátky na pending_payment a přijít o přístup.
 */
const PROTECTED_STATUSES = new Set(['active', 'trial', 'past_due']);

/**
 * @param {{ status?: string } | null} existing
 * @returns {boolean}
 */
export function shouldPreserveMembership(existing) {
  if (!existing) return false;
  return PROTECTED_STATUSES.has(String(existing.status || '').toLowerCase());
}

/**
 * @param {string} program
 * @returns {boolean}
 */
export function isPaidProgram(program) {
  const p = String(program || '').toUpperCase();
  return p === 'ON_CLUB' || p === 'VIP';
}
