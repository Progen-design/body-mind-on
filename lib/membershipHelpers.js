// /lib/membershipHelpers.js
// Kontrola členství (trial / aktivní předplatné) pro API

import { supabaseServer } from './supabaseServer';

/**
 * Načte záznam členství pro uživatele.
 * @returns {Promise<{ tier: string, status: string, trial_ends_at: string|null } | null>}
 */
export async function getMembership(userId) {
  const { data, error } = await supabaseServer
    .from('memberships')
    .select('tier, status, trial_ends_at')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

/**
 * Ověří, zda má uživatel platný přístup (aktivní předplatné nebo platný trial).
 * START: trial platí do trial_ends_at; po vypršení jen pokud status === 'active'.
 * Ostatní tiery (ON_CLUB, VIP): status === 'active'.
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function isAccessAllowed(membership) {
  if (!membership) {
    return { allowed: false, reason: 'Členství nenalezeno.' };
  }
  const { tier, status, trial_ends_at } = membership;
  const now = new Date();

  if (tier !== 'START') {
    // ON_CLUB, VIP – jen aktivní
    if (status === 'active') return { allowed: true };
    return { allowed: false, reason: 'Předplatné není aktivní.' };
  }

  // START – trial nebo aktivní platba
  if (status === 'active') return { allowed: true };
  if (status === 'trial' && trial_ends_at) {
    if (new Date(trial_ends_at) >= now) return { allowed: true };
  }
  return { allowed: false, reason: 'Tvůj 7denní trial vypršel. Obnov předplatné na profilu.' };
}

/**
 * Vyžaduje platné členství. Pro použití v API po ověření uživatele.
 * @param {string} userId
 * @returns {Promise<{ allowed: true } | { allowed: false, status: number, error: string }>}
 */
export async function requireActiveMembership(userId) {
  const membership = await getMembership(userId);
  const result = isAccessAllowed(membership);
  if (result.allowed) return { allowed: true };
  return {
    allowed: false,
    status: 403,
    error: result.reason || 'Přístup odepřen.',
  };
}
