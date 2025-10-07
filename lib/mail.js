import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'info@bodyandmindon.cz';

export async function sendPlanEmail(to, html) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Tvůj jídelníček Body & Mind ON',
      html,
    });
  } catch (err) {
    console.error('[sendPlanEmail] Error:', err);
  }
}
