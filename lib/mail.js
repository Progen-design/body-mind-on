// /lib/mail.js
import nodemailer from "nodemailer";

export async function sendPlanEmail(email, planHtml) {
  try {
    // 1) SMTP přes Gmail (nebo jiného poskytovatele)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // 2) Šablona s tabulkou a bgcolor – Gmail/mobil často ignorují CSS, bgcolor na <td> funguje
    const safePlanHtml = String(planHtml || '').trim();
    const htmlTemplate = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>Tvůj osobní plán Body & Mind ON</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0b14;color:#eaeaea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b0b14;">
    <tr><td align="center" style="padding:16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:700px;background-color:#11111d;" bgcolor="#11111d">
        <tr>
          <td align="center" style="padding:28px 20px;background:linear-gradient(135deg,#0072ff,#00c6ff);" bgcolor="#0072ff">
            <h1 style="margin:0 0 6px;font-size:22px;color:#ffffff;">💙 Tvůj osobní plán Body & Mind ON</h1>
            <p style="margin:0;font-size:14px;color:#ffffff;">Síla těla, klid mysli, rovnováha života</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 20px;background-color:#11111d;color:#eaeaea;" bgcolor="#11111d">
            <p style="color:#eaeaea;margin:0 0 12px;">Ahoj,</p>
            <p style="color:#eaeaea;margin:0 0 16px;">Tvůj AI trenér právě připravil osobní plán. Najdeš ho níže:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background-color:#181824;border:1px solid #2a2a3d;border-radius:12px;" bgcolor="#181824">
              <tr><td style="padding:20px;color:#eaeaea;background-color:#181824;" bgcolor="#181824">
                <div style="color:#eaeaea;background-color:#181824;">
                ${safePlanHtml}
                </div>
              </td></tr>
            </table>
            <p style="color:#eaeaea;margin:20px 0 12px;"><strong>„Každý krok se počítá. I ten nejmenší tě posouvá vpřed.“ 🌿</strong></p>
            <p style="text-align:center;margin:24px 0;">
              <a href="https://app.bodyandmindon.cz" style="display:inline-block;padding:14px 24px;border-radius:28px;color:#ffffff;text-decoration:none;font-weight:600;background:linear-gradient(135deg,#0072ff,#00c6ff);">Otevřít svůj plán</a>
            </p>
            <p style="color:#eaeaea;margin:0;">S respektem 💙<br><b>Tým Body & Mind ON</b></p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px;text-align:center;font-size:13px;color:#9ca3af;border-top:1px solid #2a2a3d;background-color:#0d0d12;" bgcolor="#0d0d12">
            © 2025 Body & Mind ON · <a href="https://www.bodyandmindon.cz" style="color:#00bfff;">www.bodyandmindon.cz</a>
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
