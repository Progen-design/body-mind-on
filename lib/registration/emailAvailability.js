/**
 * Server-side email availability for registration (auth only).
 * Response shape for clients must stay boolean-only — no role/status leakage.
 */

import { isAuthEmailRegistered } from '../authHelpers.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeRegistrationEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return null;
  return email;
}

/**
 * @param {unknown} rawEmail
 * @returns {Promise<{ available: boolean, invalid?: boolean }>}
 */
export async function checkRegistrationEmailAvailable(rawEmail) {
  const email = normalizeRegistrationEmail(rawEmail);
  if (!email) {
    return { available: false, invalid: true };
  }
  const taken = await isAuthEmailRegistered(email);
  return { available: !taken };
}
