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

    // 2) Brandovaná HTML šablona – planHtml se vkládá dovnitř
    const htmlTemplate = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tvůj osobní plán Body & Mind ON</title>
  <style>
    body { background:#0b0b14; color:#eaeaea; font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif; line-height:1.6; margin:0; }
    .wrap { max-width:700px; margin:40px auto; background:#11111d; border-radius:16px; overflow:hidden; border:1px solid #1e1e2a; box-shadow:0 0 20px rgba(0,0,0,.3); }
    .head { padding:36px 24px 20px; text-align:center; background:linear-gradient(135deg,#0072ff,#00c6ff); color:#fff; }
    .head h1 { margin:0 0 6px; font-size:26px; }
    .head p { margin:0; font-size:15px; opacity:.95; }
    .content { padding:32px 36px; }
    .box { background:#181824; border:1px solid #2a2a3d; border-radius:12px; padding:20px; }
    .cta { display:inline-block; margin:24px 0 6px; padding:12px 22px; border-radius:28px; color:#fff; text-decoration:none;
           font-weight:600; background:linear-gradient(135deg,#0072ff,#00c6ff); }
    .footer { border-top:1px solid #1f1f2e; color:#8a8a9a; text-align:center; padding:20px; font-size:13px; }
    a { color:#00bfff; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h1>💙 Tvůj osobní plán Body & Mind ON</h1>
      <p>Síla těla, klid mysli, rovnováha života</p>
    </div>
    <div class="content">
      <p>Ahoj,</p>
      <p>Tvůj AI trenér právě připravil osobní plán. Najdeš ho níže:</p>

      <div class="box">
        ${planHtml}
      </div>

      <p><strong>„Každý krok se počítá. I ten nejmenší tě posouvá vpřed.“ 🌿</strong></p>
      <p style="text-align:center;">
        <a class="cta" href="https://app.bodyandmindon.cz">Otevřít svůj plán</a>
      </p>
      <p>S respektem 💙<br><b>Tým Body & Mind ON</b></p>
    </div>
    <div class="footer">
      © 2025 Body & Mind ON · <a href="https://www.bodyandmindon.cz">www.bodyandmindon.cz</a>
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
