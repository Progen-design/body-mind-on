// /pages/api/assistant-intake.js
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Pouze POST metoda je povolena.' });
  }

  try {
    const b = req.body || {};

    const toNum = (v) => (v === '' || v == null ? null : Number(v));
    const norm = (v) => (v ? String(v).trim().toLowerCase() : null);

    // 🔹 Normalizovaná data
    const payload = {
      name: b.name || null,
      email: b.email || null,
      gender: norm(b.gender),
      age: toNum(b.age),
      height: toNum(b.height),
      weight: toNum(b.weight),
      activity: norm(b.activity),
      stress: norm(b.stress),
      worktype: norm(b.worktype), // ⬅️ pozor – malé písmeno (musí odpovídat tabulce)
      goal: norm(b.goal),
      frequency: norm(b.frequency),
      notes: b.notes || null,
      program: b.program || 'START', // 🔹 přidáno pro označení programu
      created_at: new Date().toISOString()
    };

    // ✅ Uložení do DB
    const { error: dbErr } = await supabaseServer
      .from('registrations')
      .insert([payload]);

    if (dbErr) {
      throw new Error(`Chyba při zápisu do databáze: ${dbErr.message}`);
    }

    // ✅ Spuštění generování AI plánu (napojení na tvého asistenta)
    if (payload.email) {
      console.log(`🧠 Spouštím generatePlanForEmail(${payload.email})`);
      await generatePlanForEmail(payload.email);
      console.log(`✅ Plán pro ${payload.email} úspěšně vytvořen.`);
    }

    // ✅ Úspěšná odpověď
    return res
      .status(200)
      .json({ ok: true, message: 'Registrace uložena a AI plán byl vygenerován.' });

  } catch (e) {
    console.error('[assistant-intake] ERROR:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
