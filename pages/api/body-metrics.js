// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const b = req.body || {};

    const toNum = (v) => (v === '' || v == null ? null : Number(v));
    const norm = (v) => (v ? String(v).trim().toLowerCase() : null);

    const payload = {
      user_id: b.user_id || null,
      email: b.email || null,
      name: b.name || null,
      gender: norm(b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height_cm),
      weight_kg: toNum(b.weight_kg),
      activity: norm(b.activity),
      stress_level: norm(b.stress_level),
      occupation: norm(b.occupation),
      goal: norm(b.goal),
      freq_choice: norm(b.freq_choice),
      weekly_sessions_user: toNum(b.weekly_sessions_user),
      notes: b.notes || null
    };

    // ✅ Uložení do DB
    const { error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([payload]);

    if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

    // ✅ Generování plánu – čeká synchronně
    if (payload.email) {
      console.log(`🧠 Spouštím generatePlanForEmail(${payload.email})`);
      await generatePlanForEmail(payload.email);
      console.log(`✅ Plán pro ${payload.email} úspěšně vytvořen`);
    }

    return res
      .status(200)
      .json({ ok: true, message: 'Údaje uloženy a plán byl vygenerován.' });

  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
