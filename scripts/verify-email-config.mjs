#!/usr/bin/env node
/**
 * Read-only: ověří e-mail config (default bez odeslání).
 *   npm run verify:email-config
 *   npm run verify:email-config -- --send-test   # volitelný smoke send
 */
import { loadLocalEnv, envPresent, auditLine } from './audit-utils.mjs';

loadLocalEnv();

const sendTest = process.argv.includes('--send-test');

console.log('=== EMAIL ===');

const gmailUser = envPresent('GMAIL_USER');
const gmailPass = envPresent('GMAIL_APP_PASSWORD');
const emailFrom = envPresent('EMAIL_FROM');

if (!gmailUser) auditLine('WARN', 'GMAIL_USER is missing');
else auditLine('PASS', 'GMAIL_USER is set');

if (!gmailPass) auditLine('WARN', 'GMAIL_APP_PASSWORD is missing');
else auditLine('PASS', 'GMAIL_APP_PASSWORD is set');

if (!emailFrom) auditLine('WARN', 'EMAIL_FROM is missing');
else auditLine('PASS', 'EMAIL_FROM is set');

if (!gmailUser || !gmailPass || !emailFrom) {
  auditLine('WARN', 'email SMTP config incomplete (registration/plan emails may fail)');
  if (!sendTest) {
    process.exit(0);
  }
}

if (!sendTest) {
  auditLine('PASS', 'config-only mode (use --send-test to send a message)');
  process.exit(0);
}

if (!gmailUser || !gmailPass) {
  auditLine('FAIL', 'cannot send test — SMTP credentials missing');
  process.exit(1);
}

try {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const recipient = process.env.E2E_EMAIL || process.env.TEST_PLAN_RECIPIENT || 'janprikopa@gmail.com';

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
    to: recipient,
    subject: 'Body & Mind ON — audit test',
    text: 'Read-only audit test message. No action required.',
  });

  auditLine('PASS', `test email sent to ${recipient}`);
  process.exit(0);
} catch (err) {
  auditLine('FAIL', `SMTP send failed: ${err?.message || 'unknown error'}`);
  process.exit(1);
}
