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
      worktype: norm(b.worktype), // malé písmeno, odpovídá DB
      goal: norm(b.goal),
      frequency: norm(b.frequency),
      notes: b.notes || null,
      program: b.program || 'START',
      created_at: new Date().toISOString(),
    };

    // ✅ Uložení do DB
    const { error: dbErr } = await supabaseServer
      .from('registrations')
      .insert([payload]);

    if (dbErr) throw new Error(`Chyba při zápisu do DB: ${dbErr.message}`);

    let aiPlan = null;

    // ✅ Spuštění generování AI plánu (čeká až 20 sekund)
    if (payload.email) {
      try {
        console.log(`🧠 Spouštím generatePlanForEmail(${payload.email})...`);
        aiPlan = await generatePlanForEmail(payload.email);
        console.log(`✅ AI plán pro ${payload.email} úspěšně vytvořen.`);
      } catch (aiError) {
        console.warn('⚠️ AI plán se nepodařilo načíst včas:', aiError.message);
      }
    }

    // ✅ Pokud se AI plán nepodaří načíst včas
    if (!aiPlan) {
      aiPlan = 'Nepodařilo se načíst plán od AI asistenta. Tvůj osobní plán bude doručen e-mailem později.';
    }

    // ✅ Uložení AI plánu do tabulky
    await supabaseServer
      .from('registrations')
      .update({ ai_plan: aiPlan })
      .eq('email', payload.email);

    // ✅ Odpověď pro klienta
    return res.status(200).json({
      ok: true,
      message: 'Registrace byla uložena a AI plán byl zpracován.',
    });

  } catch (e) {
    console.error('[assistant-intake] ERROR:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
