/**
 * Vytvoření membership záznamu při registraci.
 *
 * START → `trial` na 7 dní hned při registraci. ON_CLUB / VIP →
 * `pending_payment` (přístup se odemyká až checkoutem a webhookem).
 *
 * PRAVDA V PRODUKCI (ověřeno 21. 9. 2026): 10 z 10 START členství je `trial`
 * s `trial_ends_at`, žádné nemá Stripe subscription. Trial dává DB trigger
 * `trg_start_trial_on_signup` (migrace 20260715190725) — START vložený jako
 * `pending_payment` bez trialu z něj udělá `trial` +7 dní. Tahle funkce do
 * 21. 9. 2026 vracela `pending_payment` a spoléhala na trigger potichu;
 * komentář tvrdil „varianta B: trial drží Stripe“, což se nikdy nestalo.
 * Teď vrací totéž, co trigger, výslovně — výsledek nezávisí na skrytém
 * triggeru a trigger u takové řádky nemá co přepisovat.
 *
 * Trial přes Stripe (`trial_period_days` v checkout session) existuje pro
 * uživatele, kteří platí sami; do naší DB se propíše webhookem.
 */

const TRIAL_DNI = 7;

/**
 * @param {string} program - START | ON_CLUB | VIP
 * @param {string} [startedAt] ISO timestamp
 * @returns {{ tier: string, status: string, trial_ends_at: string|null, started_at: string }}
 */
export function membershipFromRegistration(program, startedAt = new Date().toISOString()) {
  const normalized = String(program || 'START').toUpperCase();
  const tier = normalized === 'ON_CLUB' || normalized === 'VIP' ? normalized : 'START';

  if (tier === 'START') {
    const konec = new Date(new Date(startedAt).getTime() + TRIAL_DNI * 86_400_000).toISOString();
    return { tier, status: 'trial', trial_ends_at: konec, started_at: startedAt };
  }

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
