// /lib/membershipHelpers.js
// Kontrola členství (trial / aktivní předplatné) pro API

import { supabaseServer } from './supabaseServer.js';

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
 * ON_CLUB / VIP: status active, nebo trial do trial_ends_at (upgrade během
 * trialu STARTu — Stripe trial běží dál). Nikdy pending_payment.
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function isAccessAllowed(membership, now = new Date()) {
  if (!membership) {
    return { allowed: false, reason: 'Členství nenalezeno.' };
  }
  const tier = String(membership.tier || 'START').toUpperCase();
  const { status, trial_ends_at: trialEndsAt } = membership;

  if (status === 'pending_payment') {
    return { allowed: false, reason: 'Čekáme na dokončení platby. Aktivuj předplatné v profilu.' };
  }
  if (status === 'past_due') {
    return { allowed: false, reason: 'Platba předplatného je po splatnosti. Aktualizuj platbu v profilu.' };
  }

  if (tier === 'START' || status === 'trial') {
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

// ── KOMUNITA ─────────────────────────────────────────────────────────────
//
// ČÍST smí každý s aktivním členstvím (trial i placené, START i ON CLUB) —
// stejné pravidlo jako pro plán (`isAccessAllowed`). Prošlý trial nebo
// zrušené předplatné komunitu nevidí.
//
// PSÁT (příspěvek, komentář, lajk) jen ON CLUB s aktivním členstvím. START
// komunitu čte, psaní je důvod přejít na ON CLUB. Admin (tým) projde vždy —
// to řeší `overPravaKomunity` v lib/community.js, tady se o adminech neví.

export const KOMUNITA_BEZ_PREDPLATNEHO = 'Komunita je dostupná s aktivním předplatným.';
export const KOMUNITA_PSANI_JEN_ON_CLUB = 'Psát do komunity můžeš v ON CLUBU.';

/**
 * Co smí člen v komunitě. Čistá funkce — žádné IO.
 * @param {{ tier?: string, status?: string, trial_ends_at?: string|null } | null} membership
 * @param {Date} [now]
 * @returns {{ cist: boolean, psat: boolean }}
 */
export function pravaKomunity(membership, now = new Date()) {
  const cist = isAccessAllowed(membership, now).allowed;
  const tier = String(membership?.tier || '').toUpperCase();
  return { cist, psat: cist && tier === 'ON_CLUB' };
}

/**
 * Serverová brána komunity pro jednoho uživatele.
 * @param {string} userId
 * @param {{ psani?: boolean }} [opts] psani = POST příspěvku, komentáře, lajku
 * @returns {Promise<{ allowed: true, prava: { cist: boolean, psat: boolean } } | { allowed: false, status: 403, error: string }>}
 */
export async function requireCommunityAccess(userId, { psani = false } = {}) {
  const prava = pravaKomunity(await getMembership(userId));
  if (!prava.cist) return { allowed: false, status: 403, error: KOMUNITA_BEZ_PREDPLATNEHO };
  if (psani && !prava.psat) return { allowed: false, status: 403, error: KOMUNITA_PSANI_JEN_ON_CLUB };
  return { allowed: true, prava };
}
