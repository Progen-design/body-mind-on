import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      name,
      age,
      height_cm,
      weight_kg,
      body_fat_pct,
      water_pct
    } = body || {};

    // Výpočty (základní BMI, tuk_kg, svaly_kg orientačně)
    const height_m = Number(height_cm || 0) / 100;
    const weight = Number(weight_kg || 0);
    const bodyFat = Number(body_fat_pct || 0);

    const bmi = height_m > 0 ? +(weight / (height_m * height_m)).toFixed(2) : null;
    const fat_kg = bodyFat ? +((weight * bodyFat) / 100).toFixed(2) : null;
    const muscles_kg = fat_kg != null ? +(weight - fat_kg).toFixed(2) : null;

    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from('clients')
      .insert([
        {
          name,
          age: age ? Number(age) : null,
          height_cm: height_cm ? Number(height_cm) : null,
          weight_kg: weight || null,
          body_fat_pct: bodyFat || null,
          water_pct: water_pct ? Number(water_pct) : null,
          bmi,
          fat_kg,
          muscles_kg
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return new NextResponse(
      typeof err?.message === 'string' ? err.message : 'Server error',
      { status: 400 }
    );
  }
}
