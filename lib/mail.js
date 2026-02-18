// /lib/mail.js
import nodemailer from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz';

function buildEmailHtml(planHtml, isNewUser, email) {
  const accountSection = isNewUser ? `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px; margin-bottom: 32px; color: white;">
      <h2 style="margin: 0 0 16px 0; font-size: 20px;">Tvůj účet byl vytvořen</h2>
      <p style="margin: 0 0 12px 0; opacity: 0.9;">Pro přihlášení použij:</p>
      <p style="margin: 0 0 16px 0;"><strong>Email:</strong> ${email}</p>
      <a href="${APP_URL}/login" style="display: inline-block; background: white; color: #667eea; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Přihlásit se do aplikace
      </a>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html lang="cs">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tvůj osobní plán - Body & Mind ON</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 680px; margin: 0 auto; padding: 32px 16px;">
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #ffffff; font-size: 28px; margin: 0;">
            <span style="background: linear-gradient(90deg, #9b5cff, #2ECC71); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
              Body & Mind ON
            </span>
          </h1>
          <p style="color: #888888; margin: 8px 0 0 0;">Tvůj osobní fitness a nutriční plán</p>
        </div>

        ${accountSection}

        <!-- Plan Content -->
        <div style="background: #111111; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; color: #ffffff;">
          ${planHtml}
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #2a2a2a;">
          <p style="color: #666666; font-size: 14px; margin: 0;">
            Tento email byl automaticky vygenerován systémem Body & Mind ON.
          </p>
          <p style="color: #666666; font-size: 14px; margin: 8px 0 0 0;">
            <a href="${APP_URL}" style="color: #9b5cff; text-decoration: none;">bodyandmindon.cz</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendPlanEmail(to, planHtml, isNewUser = false) {
  if (!to) {
    console.error("❌ Chybí e-mailová adresa příjemce");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const fullHtml = buildEmailHtml(planHtml, isNewUser, to);
    const subject = isNewUser 
      ? "Vítej v Body & Mind ON - Tvůj osobní plán je připraven!"
      : "Váš osobní plán Body & Mind ON";

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html: fullHtml,
    });

    console.log(`✅ E-mail odeslán na ${to}${isNewUser ? ' (nový uživatel)' : ''}`);
  } catch (err) {
    console.error("❌ Chyba při odesílání e-mailu:", err);
  }
}
