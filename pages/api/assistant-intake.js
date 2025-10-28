import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const config = {
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  // ✅ 1. Povolení pouze POST
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Pouze POST metoda je povolena" });
  }

  try {
    // ✅ 2. Získání dat z těla
    const data = req.body;
    console.log("📨 Přijatá data:", data);

    if (!data.email || !data.name) {
      return res.status(400).json({ success: false, message: "Chybí jméno nebo e-mail" });
    }

    // ✅ 3. Připojení k Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ✅ 4. Uložení dat do tabulky
    const { error: dbError } = await supabase.from("registrations").insert([
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

    if (dbError) {
      console.error("❌ Supabase error:", dbError);
      throw new Error("Nepodařilo se uložit data do databáze.");
    }

    // ✅ 5. Odeslání e-mailu přes Gmail
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
      from: `"Body & Mind ON" <${process.env.GMAIL_USER}>`,
      to: data.email,
      subject: `Potvrzení registrace – ${data.program || "START"} program`,
      html: `
        <h2>Ahoj ${data.name},</h2>
        <p>Děkujeme za registraci do programu <b>${data.program || "START"}</b>.</p>
        <p>Tvůj osobní AI trenér právě připravuje tvůj první plán tréninku a jídelníček.</p>
        <p>Očekávej e-mail s přehledem do několika minut.</p>
        <hr />
        <p><small>Body & Mind ON © 2025</small></p>
      `,
    });

    console.log("✅ E-mail odeslán na:", data.email);

    // ✅ 6. Úspěch
    return res.status(200).json({
      success: true,
      message: "Formulář byl úspěšně přijat a e-mail odeslán.",
    });
  } catch (error) {
    console.error("💥 Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Chyba serveru: " + (error.message || "Neznámá chyba"),
    });
  }
}
