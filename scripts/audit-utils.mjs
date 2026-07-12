/**
 * Shared helpers for read-only audit scripts (no secret values in output).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load .env.local then .env into process.env (without logging values).
 * @param {string} root
 */
export function loadLocalEnv(root = process.cwd()) {
  for (const rel of ['.env.local', '.env']) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] != null && String(process.env[key]).trim() !== '') continue;
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

/**
 * @param {string} name
 */
export function envPresent(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== '';
}

/**
 * Mask tokens, secrets, and sensitive env assignments in captured child output.
 * @param {string} text
 */
export function sanitizeOutput(text) {
  if (!text) return '';
  let s = String(text);

  s = s.replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, 'sk-[REDACTED]');
  s = s.replace(/\bsb_secret_[a-zA-Z0-9_-]+\b/g, 'sb_secret_[REDACTED]');
  s = s.replace(/\bsbp_[a-zA-Z0-9_-]+\b/g, 'sbp_[REDACTED]');
  s = s.replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+\b/g, 'eyJ[REDACTED]');
  s = s.replace(/postgres(?:ql)?:\/\/([^:\s]+):([^@\s]+)@/gi, 'postgresql://$1:[REDACTED]@');

  s = s.replace(
    /^(\s*)([A-Z0-9_]*(TOKEN|SECRET|PASSWORD|KEY|DATABASE_URL)[A-Z0-9_]*)=(.+)$/gim,
    '$1$2=[REDACTED]'
  );

  return s;
}

/**
 * @param {'PASS'|'WARN'|'FAIL'} level
 * @param {string} message
 */
export function auditLine(level, message) {
  console.log(`${level} ${message}`);
}

/**
 * @param {'PASS'|'WARN'|'FAIL'} level
 * @param {string} message
 * @returns {number} exit code hint: 0 pass/warn, 1 fail
 */
export function finishAudit(level, message) {
  auditLine(level, message);
  return level === 'FAIL' ? 1 : 0;
}
