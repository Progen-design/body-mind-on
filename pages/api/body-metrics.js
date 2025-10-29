// /pages/api/body-metrics.js
import { supabaseServer } from "../../lib/supabaseServer";
import { generatePlanForEmail } from "../../lib/generatePlan";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Pouze POST metoda je povolena" });
  }

  try {
    const b = req.body || {};

    // ✅ Základní validace vstupu
    if (!b.email || !b.email.includes("@")) {
      throw new Error("Chybí platný e-mail");
    }

    // Normalizace dat
    const toNum = (v) => (v === "" || v == null ? null : Number(v));
    const norm = (v) => (v ? String(v).trim() : null);

    const payload = {
      email: norm(b.email),
      name: norm(b.name),
      gender: norm(b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height),
      weight_kg: toNum(b.weight),
      activity: norm(b.activity),
      stress_level: norm(b.stress),
      occupation: norm(b.workType),
      goal: norm(b.goal),
      freq_choice: norm(b.frequency),
      notes: norm(b.notes),
      created_at: new Date().toISOString(),
    };

    // ✅ Uložení do DB (Supabase)
    const { error: dbErr } = await supabaseServer
      .from("body_metrics")
      .insert([payload]);

    if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

    // ✅ Spuštění AI asistenta (generování + e-mail)
    await generatePlanForEmail(payload.email, payload);

    return res
      .status(200)
      .json({ ok: true, message: "Údaje uloženy a plán vygenerován." });

  } catch (e) {
    console.error("❌ body-metrics error:", e);
    return res.status(400).json({
      ok: false,
      error: e.message || "Neočekávaná chyba při odesílání formuláře",
    });
  }
}
