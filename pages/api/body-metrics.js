// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';

const MAPS = {
  gender: {
    muž: 'male', muz: 'male', m: 'male', male: 'male',
    žena: 'female', zena: 'female', f: 'female', female: 'female'
  },
  activity: {
    sedavý: 'sedavy', sedavy: 'sedavy',
    'lehce aktivní': 'lehce', lehce: 'lehce',
    'středně aktivní': 'stredne', stredne: 'stredne',
    'velmi aktivní': 'velmi', velmi: 'velmi',
    'extra aktivní': 'extra', extra: 'extra'
  },
  stress_level: {
    nízká: 'low', nizka: 'low', low: 'low',
    střední: 'medium', stredni: 'medium', medium: 'medium',
    vysoká: 'high', vysoka: 'high', high: 'high'
  },
  occupation: {
    'kancelář / it': 'office_it', 'kancelar / it': 'office_it', office_it: 'office_it',
    'řidič': 'driver', ridic: 'driver', driver: 'driver',
    'sklad / logistika': 'warehouse', warehouse: 'warehouse',
    'manuální práce': 'manual', manual: 'manual',
    'zdravotnictví': 'healthcare', healthcare: 'healthcare',
    'učitel / obchod': 'teacher_sales', 'ucitel / obchod': 'teacher_sales', teacher_sales: 'teacher_sales',
    gastronomie: 'gastronomy', gastronomy: 'gastronomy'
  },
  goal: {
    'redukce hmotnosti': 'redukce', redukce: 'redukce',
    'udržování': 'udrzovani', udrzovani: 'udrzovani',
    'nabírání svalové hmoty': 'nabirani_svaly', 'nabirani svalove hmoty': 'nabirani_svaly', nabirani_svaly: 'nabirani_svaly'
  },
  freq_choice: {
    '0–1× týdně': '0-1', '0-1x tydne': '0-1', '0-1': '0-1',
    '2–3× týdně': '2-3', '2-3x tydne': '2-3', '2-3': '2-3',
    '4+ týdně': '4plus', '4+ tydne': '4plus', '4plus': '4plus'
  }
};

const norm = (group, v) => {
  if (!v) return null;
  const map = MAPS[group];
  if (!map) return v;
  return map[String(v).trim().toLowerCase()] || v;
};

const toNum = (v) =>
  v === '' || v == null || typeof v === 'undefined' ? null : Number(v);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const b = req.body || {};

    // ✅ payload odpovídá přesně tabulce
    const payload = {
      user_id: b.user_id || null,
      email: b.email || null,
      name: b.name || null,
      gender: norm('gender', b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height_cm),
      weight_kg: toNum(b.weight_kg),
      activity: norm('activity', b.activity),
      stress_level: norm('stress_level', b.stress_level),
      occupation: norm('occupation', b.occupation),
      goal: norm('goal', b.goal),
      freq_choice: norm('freq_choice', b.freq_choice),
      weekly_sessions: toNum(b.weekly_sessions_user), // 🔁 opraveno!
      notes: b.notes || null
    };

    // ✅ Kontrola vstupů
    if (payload.age !== null && Number.isNaN(payload.age))
      throw new Error('Věk musí být číslo');
    if (payload.height_cm !== null && Number.isNaN(payload.height_cm))
      throw new Error('Výška musí být číslo');
    if (payload.weight_kg !== null && Number.isNaN(payload.weight_kg))
      throw new Error('Váha musí být číslo');

    // ✅ Uložení do DB
    const { error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([payload]);

    if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

    // 📤 Odeslání do Make (volitelné)
    const MAKE_URL =
      process.env.MAKE_WEBHOOK_URL || process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL;
    if (MAKE_URL) {
      (async () => {
        try {
          const r = await fetch(MAKE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!r.ok) console.error('[Make webhook failed]', await r.text());
        } catch (err) {
          console.error('[Make webhook error]', err);
        }
      })();
    }

    // ⚙️ Asynchronní AI generování plánu
    if (payload.email) {
      (async () => {
        try {
          await generatePlanForEmail(payload.email);
        } catch (err) {
          console.error('[Plan generation error]', err);
        }
      })();
    }

    // ✅ Hotovo
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
