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
 * Vytvoří Supabase Auth uživatele (e-mail + heslo). E-mail je automaticky potvrzen.
 * @param {string} email
 * @param {string} name
 * @param {string} [userPassword] - vlastní heslo od uživatele; pokud chybí, vygeneruje se náhodné
 * @returns {{ userId: string, password: string|null, existing?: boolean, userChosePassword?: boolean } | { error: string }}
 */
export async function createAuthUserIfNew(email, name, userPassword) {
  const password = (userPassword && userPassword.length >= 6) ? userPassword : generateRandomPassword();
  const userChosePassword = !!(userPassword && userPassword.length >= 6);

  const { data, error } = await supabaseServer.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });

  if (!error && data?.user) {
    return { userId: data.user.id, password: userChosePassword ? null : password, userChosePassword };
  }

  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('already') || msg.includes('registered') || error?.status === 422) {
    const existingUserId = await getUserIdByEmail(email.trim());
    if (existingUserId) {
      if (userChosePassword) {
        const { error: updateErr } = await supabaseServer.auth.admin.updateUserById(existingUserId, { password: userPassword });
        if (!updateErr) {
          return { userId: existingUserId, password: null, existing: true, userChosePassword: true };
        }
      } else {
        const newPassword = generateRandomPassword();
        const { error: updateErr } = await supabaseServer.auth.admin.updateUserById(existingUserId, { password: newPassword });
        if (!updateErr) {
          return { userId: existingUserId, password: newPassword, existing: true };
        }
      }
      return { userId: existingUserId, password: null, existing: true };
    }
  }

  return { error: error?.message || 'Nepodařilo se vytvořit účet.' };
}

/** Najde auth user id podle e-mailu (pro existující účty). Omezení: max 1000 uživatelů na stránku. */
async function getUserIdByEmail(email) {
  try {
    const { data, error } = await supabaseServer.auth.admin.listUsers({ perPage: 1000 });
    if (error || !data?.users) return null;
    const user = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    return user ? user.id : null;
  } catch {
    return null;
  }
}
