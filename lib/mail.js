import nodemailer from "nodemailer";

// 💌 Odeslání finálního e-mailu s HTML šablonou
export async function sendPlanEmail(email, planHtml) {
  try {
    // Transporter (Gmail)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // Kompletní e-mail šablona
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tvůj osobní plán – Body & Mind ON</title>
  <style>
    body {
      background: #f4f6fa;
      font-family: 'Inter', Arial, sans-serif;
      color: #222;
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }

    .container {
      max-width: 760px;
      background: #ffffff;
      margin: 40px auto;
      border-radius: 20px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.08);
      overflow: hidden;
      border: 1px solid #eaeaea;
    }

    .header {
      background: linear-gradient(135deg, #00BFFF 0%, #00BFA6 100%);
      padding: 30px;
      text-align: center;
      color: #fff;
    }

    .header h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 0.4px;
    }

    .content {
      padding: 30px;
    }

    h2 {
      color: #00BFFF;
      font-size: 22px;
      border-bottom: 2px solid #eaf6ff;
      padding-bottom: 5px;
    }

    h3 {
      color: #0077cc;
      margin-top: 25px;
      font-size: 18px;
    }

    ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    ul li {
      padding: 6px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .section {
      background: #f9fcff;
      border-radius: 12px;
      padding: 20px;
      margin-top: 20px;
      border: 1px solid #eef5fa;
    }

    .section.alt {
      background: #f3fdfb;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }

    table th {
      background: #00BFFF;
      color: white;
      padding: 10px;
      font-weight: 600;
    }

    table td {
      border: 1px solid #e6e6e6;
      padding: 10px;
      font-size: 14px;
      text-align: center;
    }

    .motivace {
      background: #fff7f0;
      border-left: 5px solid #FFA726;
      padding: 20px;
      border-radius: 10px;
      margin-top: 25px;
    }

    .motivace p {
      margin: 0;
      font-size: 15px;
      color: #7a4e00;
    }

    .footer {
      background: #fafafa;
      text-align: center;
      padding: 25px 20px;
      font-size: 14px;
      color: #555;
      border-top: 1px solid #eee;
    }

    .footer a {
      color: #00BFFF;
      text-decoration: none;
      font-weight: 600;
    }

    @media (max-width: 600px) {
      .container {
        margin: 10px;
        border-radius: 14px;
      }
      .header h1 {
        font-size: 22px;
      }
      .content {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💙 Tvůj osobní plán Body & Mind ON</h1>
      <p style="margin-top:10px; font-size:15px; opacity:0.9;">Síla těla, klid mysli, rovnováha života</p>
    </div>

    <div class="content">
      <p style="font-size:16px;">
        Díky, že jsi se svěřil do rukou našeho AI trenéra.  
        Tvůj osobní plán je připraven s respektem k tvému tělu, energii i tempu.  
        <b>Začínáme tam, kde jsi právě teď.</b> 🌱
      </p>

      ${planHtml}

      <div class="motivace">
        <p>
          „Každý krok se počítá. I ten nejmenší pohyb tě posouvá kupředu.  
          Věř svému tempu a zůstaň v pohybu – tělo i mysl ti poděkují.“ 🌿
        </p>
      </div>

      <p style="margin-top:30px;">S respektem a podporou 💙<br><b>Tým Body & Mind ON</b></p>
    </div>

    <div class="footer">
      <p>© 2025 Body & Mind ON | <a href="https://bodyandmindon.cz">www.bodyandmindon.cz</a></p>
    </div>
  </div>
</body>
</html>
`;

    // Odeslání e-mailu
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "💙 Tvůj osobní plán Body & Mind ON",
      html: htmlTemplate,
    });

    console.log(`✅ E-mail úspěšně odeslán: ${email}`);
  } catch (error) {
    console.error("❌ Chyba při odesílání e-mailu:", error);
  }
}
