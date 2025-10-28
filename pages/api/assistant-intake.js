import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// ✅ Inicializace Supabase klienta
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ✅ API Handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Pouze metoda POST je povolena." });
  }

  try {
    const data = req.body;

    // 🔹 Kontrola e-mailu
    if (!data.email) {
      return res
        .status(400)
        .json({ success: false, message: "Chybí povinný e-mail." });
    }

    // 🔹 Zápis do databáze
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
        worktype: data.worktype || "", // ✅ malé písmeno
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

    // 🧠 Volání AI asistenta pro vytvoření osobního plánu
    let aiPlan = null;
    try {
      const aiResponse = await fetch(process.env.AI_ASSISTANT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          user: data.name || "Uživatel",
          gender: data.gender,
          age: data.age,
          height: data.height,
          weight: data.weight,
          activity: data.activity,
          stress: data.stress,
          worktype: data.worktype,
          goal: data.goal,
          frequency: data.frequency,
          notes: data.notes,
          program: data.program,
        }),
      });

      const aiResult = await aiResponse.json();
      aiPlan = aiResult?.plan || "Plán bude doplněn naším AI asistentem později.";
      console.log("✅ AI výstup:", aiResult);
    } catch (err) {
      console.error("❌ Chyba při volání AI asistenta:", err);
      aiPlan = "Nepodařilo se načíst plán od AI asistenta.";
    }

    // ✅ E-mail s rekapitulací a AI plánem
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: data.email,
      subject: `Registrace – Body & Mind ON`,
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

          <hr style="margin:20px 0;border:none;border-top:1px solid #ddd;">
          <h3>Tvůj osobní AI plán 💪</h3>
          <pre style="background:#f7f7f7;padding:14px;border-radius:8px;white-space:pre-wrap;">
${aiPlan}
          </pre>

          <p>Tým Body & Mind ON 💙</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    // ✅ Úspěšná odpověď
    return res
      .status(200)
      .json({ success: true, message: "Formulář přijat, e-mail odeslán a AI plán vygenerován." });

  } catch (error) {
    console.error("❌ Server chyba:", error);
    return res
      .status(500)
      .json({ success: false, message: "Chyba serveru: " + error.message });
  }
}
