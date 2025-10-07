// /lib/mail.js
import { Resend } from 'resend';

const key = process.env.RESEND_API_KEY;
export const resend = key ? new Resend(key) : null;

export async function sendPlanEmail({ to, html }) {
  if (!resend) return { skipped: true };
  const from = process.env.EMAIL_FROM || 'Body & Mind ON <noreply@example.com>';
  return await resend.emails.send({
    from,
    to,
    subject: 'Váš týdenní plán – Body & Mind ON',
    html
  });
}
