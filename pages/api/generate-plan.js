// /pages/api/generate-plan.js
import { supabaseServer } from '../../lib/supabaseServer';
import { openai } from '../../lib/openai';
import { sendPlanEmail } from '../../lib/mail';

// ===============================
// SYSTÉMOVÝ PROMPT
// ===============================
const SYS = `Jsi nutriční a fitness kouč Body & Mind ON. Piš česky, stručně a přehledně.
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
  // 🧱 Povolené pouze POST požadavky
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Missing email' });

    // 1️⃣ Získání posledních metrik z databáze
    const { data: rows, error } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!rows?.length) {
      return res.status(404).json({ error: 'No metrics found for this email' });
    }

    const bm = rows[0];

    // 2️⃣ Příprava promptu
    const userPrompt = `
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
Požadavek: Připrav týdenní plán dle výše uvedeného, dodrž strukturu HTML a buď stručný, ale konkrétní (gramáže).`;

    // 3️⃣ Volání OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: userPrompt }
      ]
    });

    const planHtml = completion.choices?.[0]?.message?.content?.trim();
    if (!planHtml) throw new Error('Empty plan generated from OpenAI');

    // 4️⃣ Výpočet makroživin
    let macros = null;
    if (bm.calories_target) {
      const protein_g = Math.round((asNum(bm.weight_kg) || 70) * 1.8);
      const kc = asNum(bm.calories_target) || 2200;
      const fat_g = Math.round(kc * 0.25 / 9);
      const carbs_g = Math.round((kc - protein_g * 4 - fat_g * 9) / 4);
      macros = { protein_g, fat_g, carbs_g };
    }

    // 5️⃣ Uložení plánu do databáze
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

    // 6️⃣ Odeslání e-mailu (bez blokace)
    (async () => {
      try {
        await sendPlanEmail(email, planHtml);
        console.log(`[EMAIL] Plan sent to ${email}`);
      } catch (mailErr) {
        console.error('[EMAIL ERROR]', mailErr);
      }
    })();

    // ✅ Hotovo
    return res.status(200).json({ ok: true, message: 'Plan generated successfully' });

  } catch (err) {
    console.error('[generate-plan] ERROR:', err);
    return res.status(500).json({ error: err.message || 'Plan generation failed' });
  }
}
