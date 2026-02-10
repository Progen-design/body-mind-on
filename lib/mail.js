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

    // 2) Brandovaná HTML šablona – tmavé pozadí a inline styly kvůli mobilním klientům (Gmail apod.)
    const htmlTemplate = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>Tvůj osobní plán Body & Mind ON</title>
  <style>
    body, .wrap, .content, .box { background-color:#11111d !important; color:#eaeaea !important; }
    body { margin:0; padding:0; font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif; line-height:1.6; -webkit-text-size-adjust:100%; }
    .wrap { max-width:700px; margin:0 auto; padding:16px; box-sizing:border-box; }
    .head { padding:28px 20px; text-align:center; background:linear-gradient(135deg,#0072ff,#00c6ff); color:#fff !important; }
    .head h1 { margin:0 0 6px; font-size:22px; color:#fff !important; }
    .head p { margin:0; font-size:14px; opacity:.95; color:#fff !important; }
    .content { padding:24px 20px; background-color:#11111d !important; color:#eaeaea !important; }
    .content p, .content li { color:#eaeaea !important; }
    .box { background-color:#181824 !important; color:#eaeaea !important; border:1px solid #2a2a3d; border-radius:12px; padding:20px; margin:16px 0; }
    .box h2, .box h3, .box p, .box li { color:#eaeaea !important; }
    .cta { display:inline-block; margin:20px 0; padding:14px 24px; border-radius:28px; color:#fff !important; text-decoration:none; font-weight:600; background:linear-gradient(135deg,#0072ff,#00c6ff); }
    .footer { border-top:1px solid #2a2a3d; color:#9ca3af !important; text-align:center; padding:20px; font-size:13px; background-color:#0d0d12 !important; }
    a { color:#00bfff; }
    @media screen and (max-width:480px){ .wrap { padding:12px; } .content { padding:20px 16px; } .head h1 { font-size:20px; } }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0b0b14;color:#eaeaea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div class="wrap" style="max-width:700px;margin:0 auto;padding:16px;background-color:#11111d;color:#eaeaea;">
    <div class="head">
      <h1 style="margin:0 0 6px;font-size:22px;color:#fff;">💙 Tvůj osobní plán Body & Mind ON</h1>
      <p style="margin:0;font-size:14px;color:#fff;">Síla těla, klid mysli, rovnováha života</p>
    </div>
    <div class="content" style="padding:24px 20px;background-color:#11111d;color:#eaeaea;">
      <p style="color:#eaeaea;margin:0 0 12px;">Ahoj,</p>
      <p style="color:#eaeaea;margin:0 0 16px;">Tvůj AI trenér právě připravil osobní plán. Najdeš ho níže:</p>

      <div class="box" style="background-color:#181824;color:#eaeaea;border:1px solid #2a2a3d;border-radius:12px;padding:20px;">
        ${planHtml}
      </div>

      <p style="color:#eaeaea;margin:20px 0 12px;"><strong>„Každý krok se počítá. I ten nejmenší tě posouvá vpřed.“ 🌿</strong></p>
      <p style="text-align:center;margin:24px 0;">
        <a class="cta" href="https://app.bodyandmindon.cz" style="color:#fff;text-decoration:none;font-weight:600;">Otevřít svůj plán</a>
      </p>
      <p style="color:#eaeaea;margin:0;">S respektem 💙<br><b>Tým Body & Mind ON</b></p>
    </div>
    <div class="footer" style="background-color:#0d0d12;color:#9ca3af;border-top:1px solid #2a2a3d;">
      © 2025 Body & Mind ON · <a href="https://www.bodyandmindon.cz" style="color:#00bfff;">www.bodyandmindon.cz</a>
    </div>
  </div>
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
