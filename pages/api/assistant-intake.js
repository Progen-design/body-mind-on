import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const config = {
  api: {
    bodyParser: true, // <-- nutné pro čtení JSON dat
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Pouze metoda POST je povolena" });
  }

  try {
    // ✅ Bezpečné načtení těla požadavku
    const data = req.body;

    console.log("📩 Přijatá data:", data);

    if (!data || !data.email) {
      return res
        .status(400)
        .json({ success: false, message: "Chybí povinné údaje (např. e-mail)" });
    }

    // ✅ 1. Uložení do Supabase
    const { error: insertError } = await supabase.from("registrations").insert([
      {
        name: data.name,
        email: data.email,
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

    // ✅ 2. Odeslání potvrzovacího e-mailu
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Body & Mind ON" <${process.env.SMTP_USER}>`,
      to: data.email,
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

    console.log("✅ E-mail odeslán na:", data.email);

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
