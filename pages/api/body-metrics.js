// pages/api/body-metrics.js
import { createClient } from '@supabase/supabase-js';

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Chybí env NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY/ANON_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const {
      email,
      name,
      gender,        // 'male' | 'female' | 'muz' | 'žena' – DB si to normalizuje
      age,
      height_cm,
      weight_kg,
      activity,      // 'sedavy' | 'lehce' | 'stredne' | 'velmi' | 'extra'
      stress_level,  // 'low' | 'medium' | 'high'
      occupation,    // 'office_it' | 'driver' | ...
      goal,          // 'redukce' | 'udrzovani' | 'nabirani_svaly'
      freq_choice,   // '0-1' | '2-3' | '4plus'
    } = req.body || {};

    if (!email) return res.status(400).send('Chybí email');

    const supabase = getServerSupabase();

    const payload = {
      email,
      name: name || null,
      gender: gender || null,
      age: age ? Number(age) : null,
      height_cm: height_cm ? Number(height_cm) : null,
      weight_kg: weight_kg ? Number(weight_kg) : null,
      activity: activity || null,
      stress_level: stress_level || null,
      occupation: occupation || null,
      goal: goal || null,
      freq_choice: freq_choice || null,
      // weekly_sessions_user umíme odvodit z freq_choice, ale necháme to na triggeru
    };

    const { data, error } = await supabase
      .from('body_metrics')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(400).send(typeof err?.message === 'string' ? err.message : 'Server error');
  }
}
