// /lib/mail.js
import nodemailer from "nodemailer";

<<<<<<< HEAD
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
=======
function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d

/** Odstraní potenciálně nebezpečné tagy z HTML (script, style, iframe, on* atributy). */
function sanitizePlanHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
  return s.trim();
}

export async function sendPlanEmail(email, planHtml, options = {}) {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('Chybí GMAIL_USER nebo GMAIL_APP_PASSWORD v env. Nastav je ve Vercelu (Settings → Environment Variables).');
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

<<<<<<< HEAD
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
=======
    const safePlanHtml = sanitizePlanHtml(String(planHtml || '').trim());
    const loginPassword = options.loginPassword || null;
    const loginUrl = (options.loginUrl || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
    const existingAccount = options.existingAccount === true;
    const loginUnavailable = options.loginUnavailable === true;

    const loginBlock =
      loginUnavailable
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#2d2a1e;border:1px solid #4a4530;border-radius:12px;" bgcolor="#2d2a1e"><tr><td style="padding:16px 20px;color:#eaeaea;font-size:14px;">🔐 <strong>Přihlášení do profilu</strong> je u nás dočasně v údržbě. Údaje a plán jsme ti odeslali – přihlášení zkus později na <a href="${loginUrl}" style="color:#818cf8;">${loginUrl}</a>, nebo nás kontaktuj na info@bodyandmindon.cz.</td></tr></table>`
        : existingAccount
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#1e1e2e;border:1px solid #3b3b52;border-radius:12px;" bgcolor="#1e1e2e"><tr><td style="padding:16px 20px;color:#eaeaea;font-size:14px;">🔐 <strong>Přihlášení:</strong> Účet s tímto e-mailem už máš. Přihlas se na <a href="${loginUrl}" style="color:#818cf8;">${loginUrl}</a> – použij heslo z předchozí registrace, nebo obnov heslo.</td></tr></table>`
          : loginPassword
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#1e1e2e;border:1px solid #3b3b52;border-radius:12px;" bgcolor="#1e1e2e"><tr><td style="padding:16px 20px;color:#eaeaea;font-size:14px;">🔐 <strong>Přihlašovací údaje</strong> (ulož si je):<br>E-mail: <strong>${escapeHtml(email)}</strong><br>Heslo: <strong>${escapeHtml(loginPassword)}</strong><br>Přihlásit se můžeš na <a href="${loginUrl}" style="color:#818cf8;">${loginUrl}</a> – tam uvidíš svůj profil, údaje a plán.</td></tr></table>`
            : '';

    // Šablona: tabulky + inline styly + bgcolor pro Gmail/Outlook. Vizuál sjednocený s webem.
    const htmlTemplate = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark light" />
  <title>Tvůj osobní plán Body &amp; Mind ON</title>
  <style type="text/css">
    .plan-content h2{ margin:0 0 16px; font-size:20px; color:#eaeaea; font-weight:600; }
    .plan-content h3{ margin:20px 0 10px; font-size:16px; color:#c4b5fd; font-weight:600; }
    .plan-content h4{ margin:14px 0 8px; font-size:15px; color:#eaeaea; font-weight:600; }
    .plan-content ul{ margin:0 0 12px; padding-left:20px; color:#d4d4d8; }
    .plan-content li{ margin:4px 0; }
    .plan-content p{ margin:0 0 12px; color:#d4d4d8; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;color:#eaeaea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0f;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#12121a;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);" bgcolor="#12121a">
        <!-- Hlavička -->
        <tr>
          <td align="center" style="padding:32px 24px;background-color:#1a0a2e;border-bottom:1px solid #2a2a3d;" bgcolor="#1a0a2e">
            <p style="margin:0 0 8px;font-size:14px;color:#a78bfa;text-transform:uppercase;letter-spacing:0.1em;">Osobní plán</p>
            <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Body &amp; Mind ON</h1>
            <p style="margin:8px 0 0;font-size:14px;color:#c4b5fd;">Síla těla, klid mysli, rovnováha života</p>
          </td>
        </tr>
        <!-- Úvod -->
        <tr>
          <td style="padding:28px 24px 16px;background-color:#12121a;color:#eaeaea;" bgcolor="#12121a">
            <p style="margin:0 0 8px;font-size:16px;color:#eaeaea;">Ahoj,</p>
            <p style="margin:0 0 12px;font-size:15px;color:#b4b4c4;">Tvůj AI trenér právě připravil osobní plán. Najdeš ho níže.</p>
            ${loginBlock}
            <!-- Blok s plánem -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:#181824;border:1px solid #2e2e42;border-radius:12px;" bgcolor="#181824">
              <tr><td style="padding:24px;color:#eaeaea;font-size:15px;line-height:1.6;">
                <div class="plan-content" style="color:#eaeaea;">
${safePlanHtml}
                </div>
              </td></tr>
            </table>
            <p style="margin:0 0 12px;font-size:14px;color:#a78bfa;">Recepty i jídelníček můžeš v aplikaci upravit nebo doplnit s AI asistentem.</p>
            <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;font-style:italic;">„Každý krok se počítá. I ten nejmenší tě posouvá vpřed.“</p>
            <p style="text-align:center;margin:0 0 24px;">
              <a href="https://app.bodyandmindon.cz" style="display:inline-block;padding:16px 32px;border-radius:12px;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;background-color:#7c3aed;" bgcolor="#7c3aed">Otevřít svůj plán</a>
            </p>
            <p style="margin:0;font-size:14px;color:#a1a1aa;">S respektem<br><strong style="color:#eaeaea;">Tým Body &amp; Mind ON</strong></p>
          </td>
        </tr>
        <!-- Patička -->
        <tr>
          <td style="padding:20px 24px;text-align:center;font-size:13px;color:#6b7280;border-top:1px solid #2a2a3d;background-color:#0d0d12;" bgcolor="#0d0d12">
            &copy; ${new Date().getFullYear()} Body &amp; Mind ON &middot; <a href="https://www.bodyandmindon.cz" style="color:#818cf8;text-decoration:none;">www.bodyandmindon.cz</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // 3) Odeslání e-mailu
    const info = await transporter.sendMail({
      from: `Body & Mind ON <${process.env.EMAIL_FROM || process.env.GMAIL_USER}>`,
      to: email,
      subject: "💙 Tvůj osobní plán Body & Mind ON",
      html: htmlTemplate,
    });

    console.log("📧 Odesláno:", email, "messageId:", info.messageId);
    return { ok: true };
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d
  } catch (err) {
    console.error("❌ sendPlanEmail ERROR:", err);
    return { ok: false, message: err.message };
  }
}
