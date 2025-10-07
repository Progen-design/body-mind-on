// /pages/api/generate-plan.js
import { supabaseServer } from '@/lib/supabaseServer';
import { openai } from '@/lib/openai';
import { sendPlanEmail } from '@/lib/mail';

const SYS = `Jsi nutriční a fitness kouč Body & Mind ON. Piš česky, stručně, přehledně.
VÝSTUP: Jeden validní HTML blok (bez <html>/<body>), struktura:
<h2>Týdenní plán</h2>
<section id="kalorie">Denní kalorický cíl + makra</section>
<section id="jidelnicek">7 dní × 3–5 jídel (krátké recepty, MNOŽSTVÍ v gramech)</section>
<section id="trenink">3–5 tréninků (45–60 min, split podle úrovně)</section>
Pozn.: Úpravy škáluj podle stresu, profese a frekvence cvičení.`;

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Missing email' });

    // 1) Vezmi poslední metriky
    const { data: rows, error } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!rows || !rows.length) return res.status(404).json({ error: 'No metrics for email' });

    const bm = rows[0];

    // 2) Sestav instrukce pro model
    const user = `
Klient:
- Jméno: ${bm.name || '—'}
- Pohlaví: ${bm.gender || '—'}
- Věk: ${bm.age || '—'}
- Výška: ${bm.height_cm || '—'} cm
- Váha: ${bm.weight_kg || '—'} kg
- Aktivita: ${bm.activity || '—'}
- Stres: ${bm.stress_level || '—'}
- Práce: ${bm.occupation || '—'}
- Cíl: ${bm.goal || '—'}
- Frekvence cvičení: ${bm.freq_choice || bm.weekly_sessions || '—'}× týdně
Výpočty:
- BMI: ${bm.bmi ?? '—'}
- TDEE: ${bm.tdee ?? '—'}
- Kalorický cíl: ${bm.calories_target ?? '—'}
Poznámky: ${bm.notes || '—'}
Požadavek: Připrav týdenní plán dle výše, dodrž strukturu HTML a buď stručný, ale konkrétní (gramáže).`;

    // 3) Volání OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: user }
      ]
    });

    const planHtml = completion.choices?.[0]?.message?.content?.trim();
    if (!planHtml) throw new Error('Empty plan');

    // 4) Ulož do ai_generated_plans
    const macros = bm.calories_target ? {
      protein_g: Math.round((asNum(bm.weight_kg) || 70) * 1.8),
      fat_g: Math.round((asNum(bm.calories_target) || 2200) * 0.25 / 9),
      carbs_g: Math.round(((asNum(bm.calories_target) || 2200) - (macros?.protein_g||0)*4 - (macros?.fat_g||0)*9)/4)
    } : null;

    const { error: insErr } = await supabaseServer
      .from('ai_generated_plans')
      .insert({
        email,
        plan_html: planHtml,
        daily_calories: bm.calories_target || null,
        macros,
        generated_by: 'gpt-4o-mini',
        is_active: true
      });
    if (insErr) throw insErr;

    // 5) (volitelné) e-mail
    try { await sendPlanEmail({ to: email, html: planHtml }); } catch (_) {}

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[generate-plan]', e);
    res.status(500).json({ error: e.message || 'Plan generation failed' });
  }
}
