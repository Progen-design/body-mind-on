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
 * Ověří, zda má uživatele platný přístup k placeným funkcím.
 * START: trial do trial_ends_at nebo status active.
 * ON_CLUB / VIP: pouze status active (nikdy pending_payment).
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function isAccessAllowed(membership) {
  if (!membership) {
    return { allowed: false, reason: 'Členství nenalezeno.' };
  }
  const tier = String(membership.tier || 'START').toUpperCase();
  const { status, trial_ends_at: trialEndsAt } = membership;
  const now = new Date();

  if (status === 'pending_payment') {
    return { allowed: false, reason: 'Čekáme na dokončení platby. Aktivuj předplatné v profilu.' };
  }
  if (status === 'past_due') {
    return { allowed: false, reason: 'Platba předplatného je po splatnosti. Aktualizuj platbu v profilu.' };
  }

  if (tier === 'START') {
    if (status === 'active') return { allowed: true };
    if (status === 'trial' && trialEndsAt) {
      if (new Date(trialEndsAt) >= now) return { allowed: true };
    }
    return { allowed: false, reason: 'Tvůj 7denní trial vypršel. Obnov předplatné na profilu.' };
  }

  if (status === 'active') return { allowed: true };
  if (status === 'canceled') {
    return { allowed: false, reason: 'Předplatné bylo zrušeno.' };
  }
  if (status === 'expired') {
    return { allowed: false, reason: 'Předplatné vypršelo.' };
  }
  return { allowed: false, reason: 'Předplatné není aktivní.' };
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
