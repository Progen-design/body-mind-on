import { supabaseServer } from '../../lib/supabaseServer';
import nodemailer from 'nodemailer';
import { getClientIp, isRateLimited } from '../../lib/rateLimit';

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Pouze metoda POST je povolena" });
  }

  try {
    const ip = getClientIp(req);
    if (isRateLimited(`assistant-intake:${ip}`, 5, 10 * 60 * 1000)) {
      return res.status(429).json({ success: false, message: 'Příliš mnoho požadavků. Zkus to prosím za chvíli znovu.' });
    }

    const data = req.body;

    if (!data || !data.email) {
      return res
        .status(400)
        .json({ success: false, message: "Chybí povinné údaje (např. e-mail)" });
    }

    const email = String(data.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Neplatná e-mailová adresa.' });
    }

    // ✅ 1. Uložení do Supabase
    const { error: insertError } = await supabaseServer.from('registrations').insert([
      {
        name: data.name,
        email,
        gender: data.gender,
        age: data.age,
        height: data.height,
        weight: data.weight,
        activity: data.activity,
        stress: data.stress,
        workType: data.workType,
        goal: data.goal,
        frequency: data.frequency,
        notes: data.notes,
        program: data.program || "START",
      },
    ]);

    if (insertError) {
      console.error("❌ Supabase error:", insertError);
      throw new Error("Nepodařilo se uložit data do databáze.");
    }

    // ✅ 2. Odeslání potvrzovacího e-mailu (GMAIL_* nebo SMTP_* fallback)
    const smtpUser = process.env.GMAIL_USER || process.env.SMTP_USER;
    const smtpPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: `"Body & Mind ON" <${smtpUser || process.env.EMAIL_FROM || 'info@bodyandmindon.cz'}>`,
      to: email,
      subject: `Potvrzení registrace – ${data.program || "START"} program`,
      html: `
        <h2>Ahoj ${data.name || "člene"},</h2>
        <p>Děkujeme za registraci do programu <b>${data.program || "START"}</b>.</p>
        <p>Tvůj osobní AI trenér právě připravuje tvůj první plán tréninku a jídelníček.</p>
        <p>Očekávej e-mail s přehledem do několika minut.</p>
        <hr />
        <p><small>Body & Mind ON © 2025</small></p>
      `,
    });

    console.log("✅ E-mail odeslán.");

    // ✅ 3. Úspěšná odpověď
    return res
      .status(200)
      .json({ success: true, message: "Formulář byl přijat a e-mail odeslán." });
  } catch (error) {
    console.error("💥 Server error:", error);
    // vždy vrať platný JSON, aby se neobjevila JSON.parse chyba
    return res.status(500).json({
      success: false,
      message: "Chyba serveru: " + (error.message || "Neznámá chyba"),
    });
  }
}
