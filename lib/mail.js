// /lib/mail.js
import nodemailer from "nodemailer";

export async function sendPlanEmail(email, planHtml) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const textFallback = `
Tvůj osobní plán Body & Mind ON
Pokud se e-mail nezobrazí správně, otevři ho v prohlížeči.
`;

    const htmlTemplate = `
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8" />
<style>
body{background:#f4f6fa;font-family:'Inter',sans-serif;color:#222;margin:0;padding:0;}
.container{max-width:760px;background:#fff;margin:40px auto;border-radius:20px;box-shadow:0 6px 20px rgba(0,0,0,0.08);overflow:hidden;border:1px solid #eaeaea;}
.header{background:linear-gradient(135deg,#00BFFF 0%,#00BFA6 100%);padding:30px;text-align:center;color:#fff;}
.header h1{margin:0;font-size:26px;font-weight:700;}
.content{padding:30px;}
.motivace{background:#fff7f0;border-left:5px solid #FFA726;padding:20px;border-radius:10px;margin-top:25px;}
.footer{background:#fafafa;text-align:center;padding:25px;font-size:14px;color:#555;border-top:1px solid #eee;}
.footer a{color:#00BFFF;text-decoration:none;font-weight:600;}
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💙 Tvůj osobní plán Body & Mind ON</h1>
      <p>Síla těla, klid mysli, rovnováha života</p>
    </div>
    <div class="content">
      <p>Ahoj,</p>
      <p>Tvůj AI trenér právě připravil osobní plán zaměřený na rovnováhu těla i mysli.</p>
      ${planHtml}
      <div class="motivace">
        <p>„Každý krok se počítá. I ten nejmenší tě posouvá vpřed.  
        Zůstaň v pohybu – tělo i mysl ti poděkují.“ 🌿</p>
      </div>
      <p style="margin-top:30px;">S respektem 💙<br><b>Tým Body & Mind ON</b></p>
    </div>
    <div class="footer">
      © 2025 Body & Mind ON | <a href="https://bodyandmindon.cz">www.bodyandmindon.cz</a>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "💙 Tvůj osobní plán Body & Mind ON",
      html: htmlTemplate,
      text: textFallback,
    });

    console.log(`✅ E-mail úspěšně odeslán na ${email}`);
  } catch (error) {
    console.error("❌ Chyba při odeslání e-mailu:", error);
  }
}
