import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanAndSendFromParams } from '../../lib/generatePlan';
import { getClientIp, isRateLimited } from '../../lib/rateLimit';

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Pouze metoda POST je povolena" });
  }

  try {
    const ip = getClientIp(req);
    if (isRateLimited(`assistant-intake:${ip}`, 5, 10 * 60 * 1000)) {
      res.setHeader('Retry-After', '600');
      return res.status(429).json({ success: false, message: 'Příliš mnoho požadavků. Zkus to prosím za chvíli znovu.' });
    }

    const data = req.body;

    if (!data || !data.email) {
      return res
        .status(400)
        .json({ success: false, message: "Chybí povinné údaje (např. e-mail)" });
    }

    const email = String(data.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Neplatná e-mailová adresa.' });
    }

    const height = Number(data.height ?? data.height_cm) || null;
    const weight = Number(data.weight ?? data.weight_kg) || null;
    if (!height || !weight || height < 100 || height > 250 || weight < 30 || weight > 300) {
      return res.status(400).json({ success: false, message: 'Výška (100–250 cm) a váha (30–300 kg) jsou povinné pro generování plánu.' });
    }

    // ✅ 1. Uložení do Supabase
    const { error: insertError } = await supabaseServer.from('registrations').insert([
      {
        name: data.name,
        email,
        gender: data.gender,
        age: data.age,
        height,
        weight,
        activity: data.activity,
        stress: data.stress,
        workType: data.workType,
        goal: data.goal,
        frequency: data.frequency,
        notes: data.notes,
        program: data.program || "START",
      },
    ]);

    if (insertError) {
      console.error("❌ Supabase error:", insertError);
      throw new Error("Nepodařilo se uložit data do databáze.");
    }

    // ✅ 2. Generování plánu přes OpenAI a odeslání e-mailem
    const loginUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '') + '/login';
    const planResult = await generatePlanAndSendFromParams(
      {
        name: data.name,
        email,
        gender: data.gender,
        age: data.age,
        height,
        weight,
        activity: data.activity,
        stress: data.stress,
        workType: data.workType,
        goal: data.goal,
        frequency: data.frequency,
        diet_type: data.diet_type ?? null,
        dietary_restrictions: data.dietary_restrictions ?? data.preferences ?? null,
        notes: data.notes,
      },
      { loginUrl, existingAccount: true }
    );

    if (!planResult?.ok) {
      console.error("⚠️ Generování plánu selhalo:", planResult?.message);
      return res.status(200).json({
        success: true,
        message: "Formulář byl přijat. Generování plánu se nepodařilo – zkontroluj spam nebo nás kontaktuj na info@bodyandmindon.cz.",
        planSent: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Formulář byl přijat a plán byl odeslán na tvůj e-mail.",
      planSent: true,
    });
  } catch (error) {
    console.error("💥 Server error:", error);
    // vždy vrať platný JSON, aby se neobjevila JSON.parse chyba
    return res.status(500).json({
      success: false,
      message: "Chyba serveru: " + (error.message || "Neznámá chyba"),
    });
  }
}
