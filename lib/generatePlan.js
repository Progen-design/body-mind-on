// /lib/generatePlan.js
import { supabaseServer } from './supabaseServer';
import { openai } from './openai';
import { sendPlanEmail } from './mail';

const SYS = `
Jsi Body & Mind ON – empatický AI trenér výživy, cvičení a mindsetu.
Piš česky, přirozeně a přehledně. Používej profesionální HTML styl.

💪 Výstup:
<h2>Tvůj osobní AI plán Body & Mind ON</h2>
<section>
<h3>Osobní údaje & cíle</h3>
<ul>
<li><b>Věk:</b> ...</li>
<li><b>Výška:</b> ... cm</li>
<li><b>Váha:</b> ... kg</li>
<li><b>Aktivita:</b> ...</li>
<li><b>Stres:</b> ...</li>
<li><b>Typ práce:</b> ...</li>
<li><b>Cíl:</b> ...</li>
<li><b>Frekvence cvičení:</b> ...</li>
</ul>

<h3>Denní cíle</h3>
<ul>
<li><b>Kalorie:</b> ... kcal</li>
<li><b>Bílkoviny:</b> ... g</li>
<li><b>Sacharidy:</b> ... g</li>
<li><b>Tuky:</b> ... g</li>
</ul>

<h3>Jídelníček na 7 dní</h3>
<p>Každý den 3–5 jídel s rozpisem makroživin.</p>

<h3>Tréninkový plán</h3>
<p>3–5 tréninkových dnů týdně (45–60 min, podle cíle).</p>

<h3>Regenerace & Mindset</h3>
<ul>
<li>Spánek: 7–9 h</li>
<li>Hydratace: 2–3 l vody denně</li>
<li>Meditace: 10 min denně</li>
<li>Protahování po cvičení</li>
</ul>
</section>
`;

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/** Sestaví user prompt z objektu metriky (DB řádek nebo parametry z API). */
function buildUserPrompt(bm) {
  return `
Klient:
- Jméno: ${bm.name || '—'}
- Pohlaví: ${bm.gender || '—'}
- Věk: ${bm.age ?? '—'}
- Výška: ${bm.height_cm ?? '—'} cm
- Váha: ${bm.weight_kg ?? '—'} kg
- Aktivita: ${bm.activity || '—'}
- Stres: ${bm.stress_level || bm.stress || '—'}
- Typ práce: ${bm.occupation || '—'}
- Cíl: ${bm.goal || '—'}
- Frekvence: ${bm.freq_choice || bm.frequency || bm.weekly_sessions ?? '—'}

Připrav kompletní HTML výstup podle systémového promptu.`;
}

/**
 * Vygeneruje plán z předaných parametrů (pro API /api/generate-plan).
 * Vrací { html, metrics } – neukládá do DB a neposílá e-mail.
 */
export async function generatePlan(params = {}) {
  const bm = {
    name: params.name ?? null,
    gender: params.gender ?? null,
    age: params.age ?? null,
    height_cm: params.height_cm ?? null,
    weight_kg: params.weight_kg ?? null,
    activity: params.activity ?? null,
    stress_level: params.stress ?? params.stress_level ?? null,
    occupation: params.occupation ?? null,
    goal: params.goal ?? null,
    freq_choice: params.freq_choice ?? null,
    frequency: params.weekly_sessions ?? null,
  };

  const userPrompt = buildUserPrompt(bm);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: userPrompt },
    ],
  });

  const html = completion.choices?.[0]?.message?.content?.trim();
  if (!html) throw new Error('OpenAI nevrátil žádný plán.');

  return { html, metrics: bm };
}

export async function generatePlanForEmail(email) {
  try {
    console.log('🧩 Spouštím generatePlanForEmail pro:', email);

    // 1️⃣ Načti poslední metriky
    const { data: rows, error } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!rows?.length) throw new Error('Žádné metriky pro tento e-mail.');

    const bm = rows[0];
    console.log('📊 Načtené metriky:', bm);

    // 2️⃣ Sestav prompt pro OpenAI
    const userPrompt = buildUserPrompt(bm);

    // 3️⃣ Zavolej OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: userPrompt },
      ],
    });

    const planHtml = completion.choices?.[0]?.message?.content?.trim();
    if (!planHtml) throw new Error('OpenAI nevrátil žádný plán.');

    console.log('✅ AI plán vygenerován.');

    // 4️⃣ Ulož do Supabase
    const { error: insErr } = await supabaseServer
      .from('ai_generated_plans')
      .insert({
        email,
        plan_html: planHtml,
        created_at: new Date().toISOString(),
        generated_by: 'gpt-4o-mini',
        is_active: true,
      });

    if (insErr) throw new Error('Chyba při ukládání plánu: ' + insErr.message);

    // 5️⃣ Odešli e-mail s plánem
    await sendPlanEmail(email, planHtml);
    console.log('📧 E-mail s plánem odeslán na:', email);

    return { ok: true, message: 'Plán vygenerován a odeslán.' };
  } catch (err) {
    console.error('❌ generatePlanForEmail ERROR:', err);
    return { ok: false, message: err.message };
  }
}
