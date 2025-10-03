// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = req.body || {};

    // jednoduchá sanitizace/typy
    const toNum = (v) => (v === '' || v === null || typeof v === 'undefined' ? null : Number(v));

    const payload = {
      user_id: b.user_id || null,
      email: b.email || null,
      name: b.name || null,
      gender: b.gender || null,                // 'muz'/'žena'/'male'/'female' (trigger to znormalizuje)
      age: toNum(b.age),
      height_cm: toNum(b.height_cm),
      weight_kg: toNum(b.weight_kg),
      activity: b.activity || null,            // 'sedavy'|'lehce'|'stredne'|'velmi'|'extra'
      stress_level: b.stress_level || null,    // 'low'|'medium'|'high'
      occupation: b.occupation || null,        // 'office_it'|...
      goal: b.goal || null,                    // 'redukce'|'udrzovani'|'nabirani_svaly'
      freq_choice: b.freq_choice || null,      // '0-1'|'2-3'|'4plus'
      notes: b.notes || null
    };

    // 1) insert do body_metrics (trigger dopočítá BMI/TDEE/…)
    const { error: dbErr } = await supabaseServer.from('body_metrics').insert([payload]);
    if (dbErr) throw dbErr;

    // 2) forward do Make (server env, ne NEXT_PUBLIC)
    if (!process.env.MAKE_WEBHOOK_URL) throw new Error('Chybí MAKE_WEBHOOK_URL');
    const r = await fetch(process.env.MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Make webhook failed: ${r.status} ${await r.text()}`);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
