// /lib/mail.js
import nodemailer from "nodemailer";

export async function sendPlanEmail(to, html) {
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

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: "Váš osobní plán Body & Mind ON",
      html,
    });

    console.log(`✅ E-mail odeslán na ${to}`);
  } catch (err) {
    console.error("❌ Chyba při odesílání e-mailu:", err);
  }
}
