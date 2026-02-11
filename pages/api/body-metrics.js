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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      return res.status(400).json({ error: 'Zadej platnou e-mailovou adresu.' });
    }

    if (!payload.height_cm || !payload.weight_kg) {
      return res.status(400).json({ error: 'Chybí výška nebo váha.' });
    }
    if (payload.height_cm < 100 || payload.height_cm > 250) {
      return res.status(400).json({ error: 'Výška musí být mezi 100 a 250 cm.' });
    }
    if (payload.weight_kg < 30 || payload.weight_kg > 300) {
      return res.status(400).json({ error: 'Váha musí být mezi 30 a 300 kg.' });
    }
    if (payload.age != null && (payload.age < 15 || payload.age > 120)) {
      return res.status(400).json({ error: 'Věk musí být mezi 15 a 120.' });
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
    return res.status(200).json({
      ok: true,
      message: 'Údaje byly úspěšně uloženy a plán byl odeslán na e-mail.'
    });

  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(400).json({
      error: e.message || 'Neočekávaná chyba při zpracování požadavku.'
    });
  }
}

/* ==============================
   Pomocné funkce
============================== */

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeGender(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  if (t === 'male' || t === 'female') return t;
  if (t.includes('muž') || t === 'm') return 'male';
  if (t.includes('žena') || t === 'f') return 'female';
  return null;
}

function normalizeActivity(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  const known = ['sedavy', 'lehce', 'stredne', 'velmi', 'extra'];
  if (known.includes(t)) return t;
  if (t.includes('nízk')) return 'lehce';
  if (t.includes('střed')) return 'stredne';
  if (t.includes('vysok')) return 'velmi';
  return 'stredne';
}

function normalizeStress(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  if (t === 'low' || t === 'medium' || t === 'high') return t;
  if (t.includes('nízk')) return 'low';
  if (t.includes('střed')) return 'medium';
  if (t.includes('vysok')) return 'high';
  return 'medium';
}

function normalizeOccupation(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  const known = ['office_it', 'manual', 'driver', 'warehouse', 'healthcare', 'teacher_sales', 'gastronomy', 'other', 'kombinovana'];
  if (known.includes(t)) return t;
  if (t.includes('it') || t.includes('kancel')) return 'office_it';
  if (t.includes('manu')) return 'manual';
  if (t.includes('kombin')) return 'teacher_sales';
  return 'other';
}

function normalizeGoal(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  if (t === 'redukce' || t === 'nabirani_svaly' || t === 'udrzovani') return t;
  if (t.includes('reduk')) return 'redukce';
  if (t.includes('sval')) return 'nabirani_svaly';
  return 'udrzovani';
}

function normalizeFrequency(v) {
  if (!v) return null;
  const t = v.toLowerCase();
  if (t.includes('1') || t.includes('0')) return '1–2x týdně';
  if (t.includes('2') && t.includes('3')) return '2–3x týdně';
  if (t.includes('4') || t.includes('5')) return '4–5x týdně';
  return '2–3x týdně';
}

function getWeeklySessions(v) {
  if (!v) return 3;
  if (v.includes('1')) return 1;
  if (v.includes('2')) return 3;
  if (v.includes('4')) return 5;
  return 3;
}
