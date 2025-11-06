// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';

export default async function handler(req, res) {
  // ✅ Povolené jen POST požadavky
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Pouze metoda POST je povolena' });
  }

  try {
    const b = req.body || {};
    console.log("📩 Přijatá data z formuláře:", b);

    // ✅ Pomocné funkce
    const toNum = (v) => (v === '' || v == null ? null : Number(v));
    const norm = (v) =>
      v ? String(v).trim().toLowerCase().replace(/\s+/g, ' ') : null;

    // ✅ Mapování dat z frontendu (start.js → body_metrics)
    const payload = {
      user_id: b.user_id || null,
      email: b.email || null,
      name: b.name || null,
      gender: norm(b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height),
      weight_kg: toNum(b.weight),
      activity: norm(b.activity),
      stress_level: norm(b.stress),
      occupation: norm(b.workType || b.occupation),
      goal: norm(b.goal),
      freq_choice: norm(b.frequency || b.freq_choice), // 💪 sjednoceno
      notes: b.notes || null,
      program: b.program || "START",
      created_at: new Date().toISOString(),
    };

    // ✅ Validace základních polí
    if (!payload.email || !payload.gender || !payload.goal) {
      return res.status(400).json({
        error:
          "Chybí povinné údaje: e-mail, pohlaví nebo cíl. Zkontroluj formulář.",
      });
    }

    // ✅ Uložení do Supabase
    const { error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([payload]);

    if (dbErr) {
      console.error('❌ DB chyba při vkládání:', dbErr);
      throw new Error(dbErr.message || "Chyba při zápisu do databáze");
    }

    // ✅ Generování AI plánu
    if (payload.email) {
      console.log(`🧠 Spouštím AI plán pro: ${payload.email}`);
      try {
        await generatePlanForEmail(payload.email);
        console.log(`✅ AI plán pro ${payload.email} byl úspěšně vygenerován.`);
      } catch (genErr) {
        console.error("⚠️ Nepodařilo se vytvořit AI plán:", genErr);
      }
    }

    // ✅ Odpověď klientovi
    return res.status(200).json({
      ok: true,
      message: "Údaje byly uloženy a AI plán se generuje.",
    });

  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(400).json({
      error: e.message || "Neočekávaná chyba při zpracování formuláře",
    });
  }
}
