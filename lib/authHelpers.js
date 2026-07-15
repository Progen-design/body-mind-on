// /lib/authHelpers.js
// Pomocné funkce pro vytvoření účtu při registraci ze START formuláře

import { supabaseServer } from './supabaseServer';

/** Vygeneruje náhodné heslo (12 znaků: písmena + číslice, bez záměnných znaků 0/O, 1/l). */
export function generateRandomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let password = '';
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 12; i++) password += chars[bytes[i] % chars.length];
  return password;
}

/**
 * Najde auth user id podle e-mailu.
 * Nejdřív public.profiles (trigger při vytvoření účtu), pak stránkované listUsers.
 * @param {string} email
 * @returns {Promise<string|null>}
 */
export async function getUserIdByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  try {
    const { data: profile } = await supabaseServer
      .from('profiles')
      .select('id')
      .ilike('email', normalized)
      .limit(1)
      .maybeSingle();
    if (profile?.id) return profile.id;
  } catch {
    // continue to auth admin fallback
  }

  try {
    const perPage = 200;
    for (let page = 1; page <= 50; page += 1) {
      const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage });
      if (error || !data?.users?.length) return null;
      const user = data.users.find((u) => (u.email || '').toLowerCase() === normalized);
      if (user) return user.id;
      if (data.users.length < perPage) return null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * True pokud e-mail už má auth účet. Nevrací žádná další data o účtu.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isAuthEmailRegistered(email) {
  const id = await getUserIdByEmail(email);
  return !!id;
}

/**
 * Vytvoří Supabase Auth uživatele (e-mail + heslo). E-mail je automaticky potvrzen.
 * @param {string} email
 * @param {string} name
 * @param {string} [userPassword] - vlastní heslo od uživatele; pokud chybí, vygeneruje se náhodné
 * @returns {{ userId: string, password: string|null, existing?: boolean, userChosePassword?: boolean } | { error: string, existing?: boolean }}
 */
export async function createAuthUserIfNew(email, name, userPassword) {
  const password = (userPassword && userPassword.length >= 6) ? userPassword : generateRandomPassword();
  const userChosePassword = !!(userPassword && userPassword.length >= 6);
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabaseServer.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  });

  if (!error && data?.user) {
    return { userId: data.user.id, password: userChosePassword ? null : password, userChosePassword };
  }

  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('already') || msg.includes('registered') || error?.status === 422) {
    const existingUserId = await getUserIdByEmail(normalizedEmail);
    if (existingUserId) {
      // Bezpečnost: u existujícího účtu nikdy automaticky neměníme heslo.
      return { userId: existingUserId, password: null, existing: true, userChosePassword: false };
    }
    // Auth říká „už existuje“, ale lookup selhal — nepokračovat bez user_id (žádné orphan řádky).
    return { error: 'already_registered', existing: true };
  }

  return { error: error?.message || 'Nepodařilo se vytvořit účet.' };
}

/**
 * Smaže právě vytvořený auth účet (rollback při selhání persistu).
 * @param {string} userId
 */
export async function deleteAuthUserBestEffort(userId) {
  if (!userId) return;
  try {
    await supabaseServer.auth.admin.deleteUser(userId);
  } catch (err) {
    console.warn('[authHelpers] deleteUser rollback failed:', err?.message || err);
  }
}
