// /lib/secretBox.js
/**
 * ŠIFROVÁNÍ TAJEMSTVÍ V DATABÁZI — jedna implementace pro všechno.
 *
 * Vzniklo vytažením z `withingsServer.js`, kde AES-256-GCM box žil jako
 * `encryptWithingsToken()` / `decryptWithingsToken()`. S admin stránkou pro
 * OAuth přihlašovací údaje (22. 9. 2026) přibyl druhý druh tajemství —
 * Client ID a Secret v `integration_credentials` — a druhá šifrovací
 * implementace je přesně to, co se jednou rozejde. Název funkcí byl navíc
 * historický: s tokenem ten kód nemá nic společného, šifruje řetězce.
 *
 * `withingsServer.js` obě původní jména dál re-exportuje, takže volající
 * kód se měnit nemusel.
 *
 * KOŘENOVÝ KLÍČ ZŮSTÁVÁ V ENV, NAVŽDY. `WITHINGS_TOKEN_ENCRYPTION_KEY` je
 * to, čím se šifruje všechno ostatní — do databáze ho přesunout nelze,
 * šifroval by sám sebe. Jméno proměnné je taky historické; přejmenovat ji
 * znamená rozšifrovat a znovu zašifrovat všechno uložené, což se nevyplatí.
 */
import crypto from 'node:crypto';

function envValue(...parts) {
  return process.env[parts.join('')];
}

/**
 * Kořenový klíč jako 32bajtový Buffer.
 *
 * Bere 64 hex znaků nebo 32 bajtů v base64 — obojí je stejný klíč, jen
 * jinak zapsaný, a obojí se v praxi generuje (`openssl rand -hex 32`
 * vs. `-base64 32`).
 */
export function getEncryptionKey() {
  const raw = String(envValue('WITHINGS_TOKEN_', 'ENCRYPTION_KEY') || '').trim();
  if (!raw) {
    const err = new Error('Chybí šifrovací klíč pro bezpečné uložení Withings tokenů.');
    err.statusCode = 500;
    throw err;
  }

  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');

  try {
    const base64 = Buffer.from(raw, 'base64');
    if (base64.length === 32) return base64;
  } catch (_) {
    // pokračujeme na poslední validaci níže
  }

  const err = new Error('Withings šifrovací klíč musí mít 32 bajtů v base64 nebo 64 hex znaků.');
  err.statusCode = 500;
  throw err;
}

/**
 * Zašifruje řetězec. Tvar výstupu je součást datového kontraktu — takhle
 * leží v `withings_connections` i v `integration_credentials`.
 *
 * @param {string} hodnota
 * @returns {{ v: number, alg: string, iv: string, tag: string, data: string }}
 */
export function encryptSecret(hodnota) {
  const text = String(hodnota || '');
  if (!text) throw new Error('Nelze uložit prázdné tajemství.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

/**
 * @param {{ v?: number, alg?: string, iv?: string, tag?: string, data?: string }} payload
 * @returns {string}
 */
export function decryptSecret(payload) {
  if (!payload || payload.v !== 1 || payload.alg !== 'aes-256-gcm') {
    throw new Error('Neplatný formát uloženého Withings tokenu.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
