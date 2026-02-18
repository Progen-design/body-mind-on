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
 * @returns {{ userId: string, password: string } | { userId: string, password: null, existing: true } | { error: string }}
 */
export async function createAuthUserIfNew(email, name) {
  const password = generateRandomPassword();
  // Nepředáváme user_metadata – v auth.users není sloupec full_name, jinak by to způsobilo "column full_name does not exist"
  const { data, error } = await supabaseServer.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });

  if (!error && data?.user) {
    return { userId: data.user.id, password };
  }

  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('already') || msg.includes('registered') || error?.status === 422) {
    const existingUserId = await getUserIdByEmail(email.trim());
    if (existingUserId) {
      return { userId: existingUserId, password: null, existing: true };
    }
  }

  return { error: error?.message || 'Nepodařilo se vytvořit účet.' };
}

/** Najde auth user id podle e-mailu (pro existující účty). */
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
