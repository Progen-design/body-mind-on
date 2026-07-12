/**
 * Vytvoření membership záznamu při registraci (bez aktivní platby pro placené tiery).
 */

const TRIAL_DAYS = 7;

/**
 * @param {string} program - START | ON_CLUB | VIP
 * @param {string} [startedAt] ISO timestamp
 * @returns {{ tier: string, status: string, trial_ends_at: string|null, started_at: string }}
 */
export function membershipFromRegistration(program, startedAt = new Date().toISOString()) {
  const normalized = String(program || 'START').toUpperCase();
  const tier = normalized === 'ON_CLUB' || normalized === 'VIP' ? normalized : 'START';

  if (tier === 'START') {
    const trialEndsAt = new Date(new Date(startedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return {
      tier: 'START',
      status: 'trial',
      trial_ends_at: trialEndsAt,
      started_at: startedAt,
    };
  }

  return {
    tier,
    status: 'pending_payment',
    trial_ends_at: null,
    started_at: startedAt,
  };
}

/**
 * @param {string} program
 * @returns {boolean}
 */
export function isPaidProgram(program) {
  const p = String(program || '').toUpperCase();
  return p === 'ON_CLUB' || p === 'VIP';
}
