/**
 * Odeslání lifecycle e-mailu.
 * Používá stejný Gmail transport jako zbytek appky — nový provider nezavádíme.
 */
import nodemailer from 'nodemailer';
import { getLifecycleEmailContent } from './lifecycleEmailCopy.js';

const SEND_TIMEOUT_MS = 25000;

/** Do logu nikdy celý e-mail. */
function mask(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at < 1) return s ? '***' : '';
  return `${s.slice(0, Math.min(2, at))}***@${s.slice(at + 1)}`;
}

function log(payload) {
  try {
    console.log(JSON.stringify({
      event: 'lifecycle_email',
      timestamp: new Date().toISOString(),
      ...payload,
    }));
  } catch { /* ignore */ }
}

function fromHeader() {
  const addr = process.env.EMAIL_FROM
    || process.env.GMAIL_FROM
    || process.env.GMAIL_USER
    || 'noreply@bodyandmindon.cz';
  return `Body & Mind ON <${addr}>`;
}

/**
 * @param {string} toEmail
 * @param {string} triggerKey
 * @returns {Promise<{ok:boolean, message_id?:string, error_code?:string}>}
 */
export async function sendLifecycleEmail(toEmail, triggerKey) {
  const started = Date.now();
  const to = String(toEmail || '').trim();

  if (!to.includes('@')) return { ok: false, error_code: 'invalid_recipient' };

  const content = getLifecycleEmailContent(triggerKey);
  if (!content) return { ok: false, error_code: 'unknown_trigger' };

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    log({ status: 'failed', trigger: triggerKey, recipient: mask(to), error_code: 'gmail_not_configured' });
    return { ok: false, error_code: 'gmail_not_configured' };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    const info = await Promise.race([
      transporter.sendMail({
        from: fromHeader(),
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('send_timeout')), SEND_TIMEOUT_MS);
      }),
    ]);

    log({
      status: 'sent',
      trigger: triggerKey,
      recipient: mask(to),
      duration_ms: Date.now() - started,
      message_id: info?.messageId ?? null,
    });
    return { ok: true, message_id: info?.messageId ?? null };
  } catch (err) {
    const code = err?.message === 'send_timeout' ? 'send_timeout' : 'send_failed';
    log({
      status: 'failed',
      trigger: triggerKey,
      recipient: mask(to),
      error_code: code,
      duration_ms: Date.now() - started,
    });
    return { ok: false, error_code: code };
  }
}
