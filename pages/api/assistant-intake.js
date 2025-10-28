import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// ✅ Inicializace Supabase klienta
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ✅ Handler API endpointu
export default async function handler(req, res) {
  // Povolená je pouze metoda POST
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Pouze metoda POST je povolena." });
  }

  try {
    const data = req.body;

    // Kontrola povinných polí
    if (!data.email) {
      return res
        .status(400)
        .json({ success: false, message: "Chybí povinný e-mail." });
    }

    // ✅ Zápis do Supabase
    const { error } = await supabase.from("registrations").insert([
      {
        name: data.name || "",
        email: data.email,
        gender: data.gender || "",
        age: data.age || "",
        height: data.height || "",
        weight: data.weight || "",
        activity: data.activity || "",
        stress: data.stress || "",
        worktype: data.worktype || "", // ✅ správně lowercase
        goal: data.goal || "",
        frequency: data.frequency || "",
        notes: data.notes || "",
        program: data.program || "START",
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({
        success: false,
        message: "Chyba při zápisu do databáze: " + error.message,
      });
    }

    // ✅ Odeslání potvrzovacího e-mailu
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: data.email,
      subject: "✅ Registrace – Body & Mind ON",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#333;">
          <h2>Vítej v programu <strong>${data.program}</strong> 👋</h2>
          <p>Děkujeme za registraci! Tvoje osobní AI asistentka už připravuje tvůj plán.</p>
          <h3>Rekapitulace údajů:</h3>
          <ul>
            <li><strong>Jméno:</strong> ${data.name || "Neuvedeno"}</li>
            <li><strong>Pohlaví:</strong> ${data.gender || "Neuvedeno"}</li>
            <li><strong>Věk:</strong> ${data.age || "Neuvedeno"}</li>
            <li><strong>Výška:</strong> ${data.height || "Neuvedeno"} cm</li>
            <li><strong>Váha:</strong> ${data.weight || "Neuvedeno"} kg</li>
            <li><strong>Aktivita:</strong> ${data.activity || "Neuvedeno"}</li>
            <li><strong>Stres:</strong> ${data.stress || "Neuvedeno"}</li>
            <li><strong>Typ práce:</strong> ${data.worktype || "Neuvedeno"}</li>
            <li><strong>Cíl:</strong> ${data.goal || "Neuvedeno"}</li>
            <li><strong>Frekvence cvičení:</strong> ${data.frequency || "Neuvedeno"}</li>
          </ul>
          <p><em>Zdravotní poznámky:</em> ${data.notes || "—"}</p>
          <br>
          <p>Tým Body & Mind ON 💙</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    // ✅ Úspěch
    return res
      .status(200)
      .json({ success: true, message: "Formulář přijat a e-mail odeslán." });

  } catch (error) {
    console.error("❌ Server chyba:", error);
    return res
      .status(500)
      .json({ success: false, message: "Chyba serveru: " + error.message });
  }
}
