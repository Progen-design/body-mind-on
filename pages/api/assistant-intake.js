import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Pouze POST metoda je povolena",
    });
  }

  try {
    const data = req.body;
    console.log("📨 Přijatá data:", data);

    // Kontrola
    if (!data.email) {
      return res.status(400).json({ success: false, message: "Chybí e-mail" });
    }

    // Připojení k Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Uložení dat
    const { error: dbError } = await supabase.from("registrations").insert([
      {
        name: data.name || "",
        email: data.email,
        gender: data.gender || "",
        age: data.age || "",
        height: data.height || "",
        weight: data.weight || "",
        activity: data.activity || "",
        stress: data.stress || "",
        workType: data.workType || "",
        goal: data.goal || "",
        frequency: data.frequency || "",
        notes: data.notes || "",
        program: data.program || "START",
        created_at: new Date(),
      },
    ]);

    if (dbError) throw dbError;

    // Odeslání potvrzovacího e-mailu
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
      subject: `Registrace potvrzena – ${data.program || "START"} program`,
      html: `
        <h2>Ahoj ${data.name || "sportovče"}!</h2>
        <p>Děkujeme za registraci do programu <strong>${data.program || "START"}</strong>.</p>
        <p>Tvůj osobní plán je nyní ve zpracování a brzy ti dorazí e-mailem.</p>
        <p>— Tým Body & Mind ON</p>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Formulář úspěšně odeslán",
    });
  } catch (error) {
    console.error("❌ Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Chyba serveru: " + error.message,
    });
  }
}
