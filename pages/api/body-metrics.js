// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const b = req.body || {};

    // 🔧 1️⃣ Přemapování starých názvů z frontendu na názvy používané v DB
    const payload = {
      email: b.email?.trim() || null,
      name: b.name?.trim() || null,
      gender: normalizeGender(b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height || b.height_cm),
      weight_kg: toNum(b.weight || b.weight_kg),
      activity: normalizeActivity(b.activity),
      stress_level: normalizeStress(b.stress || b.stress_level),
      occupation: normalizeOccupation(b.worktype || b.occupation),
      goal: normalizeGoal(b.goal),
      freq_choice: normalizeFrequency(b.frequency || b.freq_choice),
      weekly_sessions_user: getWeeklySessions(b.frequency || b.freq_choice),
      notes: b.notes?.trim() || null,
      program: b.program || 'START',
      created_at: new Date().toISOString()
    };

    // 🧠 2️⃣ Validace klíčových hodnot (musí být alespoň email + výška + váha)
    if (!payload.email) {
      return res.status(400).json({ error: 'E-mail je povinný.' });
    }

    if (!payload.height_cm || !payload.weight_kg) {
      return res.status(400).json({ error: 'Chybí výška nebo váha.' });
    }

    // 💾 3️⃣ Uložení do Supabase
    const { error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([payload]);

    if (dbErr) {
      console.error('❌ Chyba při zápisu do DB:', dbErr);
      throw new Error(dbErr.message);
    }

    console.log(`✅ Data uložena do body_metrics pro ${payload.email}`);

    // 🤖 4️⃣ Generování AI plánu
    try {
      await generatePlanForEmail(payload.email);
      console.log(`🤖 AI plán úspěšně vytvořen pro ${payload.email}`);
    } catch (e) {
      console.error('⚠️ Chyba při generování AI plánu:', e);
    }

    // 📩 5️⃣ Odpověď frontendu
    return res.status(200).json
