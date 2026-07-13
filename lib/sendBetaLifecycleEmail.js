/**
 * Send beta lifecycle email via existing Gmail sender (no new provider).
 */
import nodemailer from 'nodemailer';
import { getBetaLifecycleEmailContent } from './betaLifecycleEmailCopy.js';

const SEND_TIMEOUT_MS = 25000;

function maskEmailForLog(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at < 1) return s ? '***' : '';
  return `${s.slice(0, Math.min(2, at))}***@${s.slice(at + 1)}`;
}

function logBetaEmailEvent(payload) {
  try {
    console.log(JSON.stringify({
      event: 'beta_lifecycle_email',
      timestamp: new Date().toISOString(),
      ...payload,
    }));
  } catch {
    /* ignore */
  }
}

function getFromHeader() {
  const fromAddr = process.env.EMAIL_FROM || process.env.GMAIL_FROM || process.env.GMAIL_USER || 'noreply@bodyandmindon.cz';
  return `Body & Mind ON <${fromAddr}>`;
}

/**
 * @param {string} toEmail
 * @param {string} triggerKey
 * @returns {Promise<{ok: boolean, provider?: string, message_id?: string, error_code?: string}>}
 */
export async function sendBetaLifecycleEmail(toEmail, triggerKey) {
  const recipientMasked = maskEmailForLog(toEmail);
  const startTs = Date.now();

  const to = String(toEmail || '').trim();
  if (!to || !to.includes('@')) {
    return { ok: false, error_code: 'invalid_recipient' };
  }

  const content = getBetaLifecycleEmailContent(triggerKey);
  if (!content) {
    return { ok: false, error_code: 'unknown_trigger' };
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    logBetaEmailEvent({ status: 'failed', trigger: triggerKey, recipient: recipientMasked, error_code: 'gmail_not_configured' });
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
    const sendPromise = transporter.sendMail({
      from: getFromHeader(),
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('send_timeout')), SEND_TIMEOUT_MS);
    });

    const info = await Promise.race([sendPromise, timeoutPromise]);
    logBetaEmailEvent({
      status: 'sent',
      trigger: triggerKey,
      recipient: recipientMasked,
      provider: 'gmail',
      duration_ms: Date.now() - startTs,
      message_id: info?.messageId ?? null,
    });
    return { ok: true, provider: 'gmail', message_id: info?.messageId ?? null };
  } catch (err) {
    const code = err?.message === 'send_timeout' ? 'send_timeout' : 'send_failed';
    logBetaEmailEvent({
      status: 'failed',
      trigger: triggerKey,
      recipient: recipientMasked,
      error_code: code,
      duration_ms: Date.now() - startTs,
    });
    return { ok: false, error_code: code };
  }
}
