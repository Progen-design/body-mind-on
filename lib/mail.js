// /lib/mail.js
import nodemailer from "nodemailer";

function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

    const safePlanHtml = sanitizePlanHtml(String(planHtml || '').trim());
    const loginPassword = options.loginPassword || null;
    const loginUrl = (options.loginUrl || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
    const existingAccount = options.existingAccount === true;
    const loginUnavailable = options.loginUnavailable === true;

    const loginBlock =
      loginUnavailable
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#2d2a1e;border:1px solid #4a4530;border-radius:12px;" bgcolor="#2d2a1e"><tr><td style="padding:16px 20px;color:#eaeaea;font-size:14px;">🔐 <strong>Přihlašovací účet</strong> se nepodařilo vytvořit. Údaje a plán jsme ti uložili – pro přístup do profilu nás kontaktuj na <a href="mailto:info@bodyandmindon.cz" style="color:#818cf8;">info@bodyandmindon.cz</a>.</td></tr></table>`
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
  } catch (err) {
    console.error("❌ sendPlanEmail ERROR:", err);
    return { ok: false, message: err.message };
  }
}
