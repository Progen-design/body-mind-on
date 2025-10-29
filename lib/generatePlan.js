// /lib/generatePlan.js
import { supabaseServer } from './supabaseServer';
import { openai } from './openai';
import { sendPlanEmail } from './mail';

// 🧠 Prompt pro AI trenéra – nový, lidský, profesionální
const SYS = `
Jsi Body & Mind ON – lidský, empatický AI trenér výživy a cvičení.
Piš česky, stručně a přirozeně. Buď pozitivní, motivační a praktický.

Výstup vrať jako JEDEN HTML BLOK (bez <html>/<body>):
<main>
  <h2>Tvůj osobní plán Body & Mind ON</h2>
  <h3>Osobní údaje & cíle</h3>
  <ul>
    <li>Věk: …</li>
    <li>Výška: … cm</li>
    <li>Váha: … kg</li>
    <li>Aktivita: …</li>
    <li>Míra stresu: …</li>
    <li>Typ práce: …</li>
    <li>Cíl: …</li>
    <li>Frekvence cvičení: …</li>
  </ul>

  <h3>Jídelníček na 7 dní</h3>
  <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
    <thead><tr><th>Den</th><th>Snídaně</th><th>Oběd</th><th>Večeře</th><th>Svačiny</th></tr></thead>
    <tbody>
      <tr><td>Den 1</td><td>…</td><td>…</td><td>…</td><td>…</td></tr>
      <tr><td>Den 2</td><td>…</td><td>…</td><td>…</td><td>…</td></tr>
    </tbody>
  </table>

  <h3>Trénink</h3>
  <ul>
    <li><b>Den 1:</b> …</li>
    <li><b>Den 2:</b> …</li>
    <li><b>Den 3:</b> …</li>
  </ul>

  <h3>Regenerace & Mindset</h3>
  <ul>
    <li>Spánek: 7–9 hodin</li>
    <li>Hydratace: 2–3 l vody denně</li>
    <li>Meditace: 10 min denně</li>
  </ul>
</main>
`;

export async function generatePlanForEmail(email, userData) {
  try {
    console.log(`🧠 Generuji plán pro ${email}`);

    const userPrompt = `
Klient:
- Jméno: ${userData.name || '—'}
- Pohlaví: ${userData.gender || '—'}
- Věk: ${userData.age || '—'}
- Výška: ${userData.height_cm || '—'} cm
- Váha: ${userData.weight_kg || '—'} kg
- Aktivita: ${userData.activity || '—'}
- Stres: ${userData.stress_level || '—'}
- Práce: ${userData.occupation || '—'}
- Cíl: ${userData.goal || '—'}
- Frekvence: ${userData.freq_choice || '—'}
- Poznámky: ${userData.notes || '—'}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: userPrompt },
      ],
    });

    const planHtml = completion.choices?.[0]?.message?.content?.trim();
    if (!planHtml) throw new Error("AI nevrátilo výstup");

    // ✅ Ulož do Supabase (historie plánů)
    const { error: insErr } = await supabaseServer
      .from("ai_generated_plans")
      .insert({
        email,
        plan_html: planHtml,
        generated_by: "gpt-4o-mini",
        created_at: new Date().toISOString(),
      });

    if (insErr) console.error("⚠️ Chyba při zápisu plánu:", insErr);

    // ✅ Pošli e-mail s plánem
    await sendPlanEmail(email, planHtml);
    console.log(`✅ Plán odeslán na ${email}`);
  } catch (err) {
    console.error("❌ generatePlanForEmail error:", err);
  }
}
