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

export async function generatePlanForEmail(email){
  // 1) poslední metriky
  const { data: rows, error } = await supabaseServer
    .from('body_metrics').select('*').eq('email', email)
    .order('created_at', { ascending:false }).limit(1);
  if (error) throw error;
  if (!rows?.length) throw new Error('No metrics for email');
  const bm = rows[0];

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

  // 2) OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.6,
    messages: [
      { role:'system', content: SYS },
      { role:'user', content: user }
    ]
  });
  const planHtml = completion.choices?.[0]?.message?.content?.trim();
  if (!planHtml) throw new Error('Empty plan');

  // 3) makra (základní heuristika)
  const protein = Math.round((asNum(bm.weight_kg)||70)*1.8);
  const kc = asNum(bm.calories_target)||2200;
  const fat = Math.round(kc*0.25/9);
  const carbs = Math.round((kc - protein*4 - fat*9)/4);

  // 4) ulož do ai_generated_plans
  const { error: insErr } = await supabaseServer
    .from('ai_generated_plans')
    .insert({
      email,
      plan_html: planHtml,
      daily_calories: bm.calories_target || null,
      macros: { protein_g: protein, fat_g: fat, carbs_g: carbs },
      generated_by: 'gpt-4o-mini',
      is_active: true
    });
  if (insErr) throw insErr;

  // 5) (volitelně) e-mail
  try { await sendPlanEmail(email, planHtml); } catch (_) {}

  // 6) (volitelně) pingni Make informativně – neblokující
  if (process.env.MAKE_WEBHOOK_URL) {
    fetch(process.env.MAKE_WEBHOOK_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'plan_ready', email })
    }).catch(()=>{});
  }
}
