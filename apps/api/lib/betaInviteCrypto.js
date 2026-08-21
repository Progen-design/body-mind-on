/**
 * Beta invite code hashing — plain codes never persisted.
 */
import { createHash, randomBytes } from 'crypto';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * @returns {string} URL-safe random invite code (16 chars)
 */
export function generateInviteCode() {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += INVITE_ALPHABET[bytes[i % bytes.length] % INVITE_ALPHABET.length];
  }
  return out;
}

/**
 * @param {string} plainCode
 * @returns {string}
 */
export function hashInviteCode(plainCode) {
  return createHash('sha256').update(String(plainCode || '').trim().toUpperCase()).digest('hex');
}

/**
 * @param {string} code
 * @returns {boolean}
 */
export function isValidInviteCodeFormat(code) {
  const c = String(code || '').trim().toUpperCase();
  return /^[A-Z0-9]{12,24}$/.test(c);
}
