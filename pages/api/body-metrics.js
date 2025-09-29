import { createClient } from '@supabase/supabase-js';

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Chybí env proměnné NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// jednoduchý výpočet TDEE (Harris–Benedict)
function calcTDEE({ weight_kg, height_cm, age, gender = 'male', activity_level = 'moderately_active' }) {
  const w = Number(weight_kg || 0);
  const h = Number(height_cm || 0);
  const a = Number(age || 0);
  const g = (gender || 'male').toLowerCase();

  let bmr = g === 'male'
    ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * a
    : 447.593 + 9.247 * w + 3.098 * h - 4.330 * a;

  const mults = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extremely_active: 1.9
  };

  const m = mults[activity_level] || mults.moderately_active;
  return Math.round(bmr * m);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const {
      email,
      name,
      gender,              // 'male' | 'female'
      age,
      height_cm,
      weight_kg,
      body_fat_percentage,
      water_percentage,
      activity_level       // 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active'
    } = req.body || {};

    if (!email) return res.status(400).send('Chybí email');

    const tdee = calcTDEE({ weight_kg, height_cm, age, gender, activity_level });
    const supabase = getServerSupabase();

    const { data, error } = await supabase
      .from('body_metrics')
      .insert([{
        email,
        name: name || null,
        gender: gender || null,
        age: age ? Number(age) : null,
        height_cm: height_cm ? Number(height_cm) : null,
        weight_kg: weight_kg ? Number(weight_kg) : null,
        body_fat_percentage: body_fat_percentage ? Number(body_fat_percentage) : null,
        water_percentage: water_percentage ? Number(water_percentage) : null,
        tdee
        // BMI se dopočítá tvým triggerem calculate_bmi() v DB
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(400).send(typeof err?.message === 'string' ? err.message : 'Server error');
  }
}
