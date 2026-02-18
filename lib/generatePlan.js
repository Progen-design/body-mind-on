// /lib/generatePlan.js
import { supabaseServer } from './supabaseServer';
import { openai } from './openai';
import { sendPlanEmail } from './mail';

const SYS = `Jsi nutriční a fitness kouč Body & Mind ON. Piš česky, stručně, přehledně.
VÝSTUP: Jeden validní HTML blok (bez <html>/<body>), struktura:
<h2>Týdenní plán</h2>
<section id="kalorie">Denní kalorický cíl + makra</section>
<section id="jidelnicek">7 dní × 3–5 jídel (krátké recepty, MNOŽSTVÍ v gramech)</section>
<section id="trenink">3–5 tréninků (45–60 min, split podle úrovně)</section>
Pozn.: Úpravy škáluj podle stresu, profese a frekvence cvičení.`;

function asNum(x){ const n=Number(x); return Number.isFinite(n)?n:undefined; }

export async function generatePlanForEmail(email, isNewUser = false){
  // 1️⃣ Načti poslední metriky
  const { data: rows, error } = await supabaseServer
    .from('body_metrics')
    .select('*')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!rows?.length) throw new Error('No metrics for email');
  const bm = rows[0];

  // 2️⃣ Vstup pro OpenAI
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
Požadavek: Připrav týdenní plán dle výše, validní HTML blok bez <html>/<body>.`;

  // 3️⃣ Generování přes OpenAI
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

  // 4️⃣ Makra – základní heuristika
  const protein = Math.round((asNum(bm.weight_kg) || 70) * 1.8);
  const kc = asNum(bm.calories_target) || 2200;
  const fat = Math.round(kc * 0.25 / 9);
  const carbs = Math.round((kc - protein * 4 - fat * 9) / 4);

  // 5️⃣ Ulož do ai_generated_plans
  const planType = bm.goal === 'redukce'
    ? 'redukce'
    : bm.goal === 'nabirani_svaly'
      ? 'nabirani'
      : 'udrzovani';

  const { error: insErr } = await supabaseServer
    .from('ai_generated_plans')
    .insert({
      user_id: bm.user_id || null,
      email,
      plan_type: planType, // ✅ povinné pole!
      workout_plan: {},
      exercises_data: {},
      daily_calories: bm.calories_target || kc,
      macros: { protein_g: protein, fat_g: fat, carbs_g: carbs },
      meal_plan: {},
      generated_by: 'gpt-4o-mini',
      generation_prompt: SYS,
      user_context: bm,
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0],
      is_active: true,
      created_at: new Date().toISOString(),
      plan_markdown: null,
      plan_html: planHtml,
      email_sent: false
    });

  if (insErr) {
    console.error('❌ Chyba při zápisu do ai_generated_plans:', insErr);
    throw insErr;
  }

  // 6️⃣ Pošli e-mail (neblokující)
  try {
    await sendPlanEmail(email, planHtml, isNewUser);
  } catch (e) {
    console.error('⚠️ Nepodařilo se odeslat e-mail:', e);
  }

  // 7️⃣ Pingni Make (volitelně)
  if (process.env.MAKE_WEBHOOK_URL) {
    fetch(process.env.MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'plan_ready', email })
    }).catch(() => {});
  }

  console.log(`✅ Plán pro ${email} byl úspěšně vygenerován a uložen.`);
}
