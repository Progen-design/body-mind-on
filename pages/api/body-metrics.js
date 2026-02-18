// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';

async function findOrCreateUser(email, name) {
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();

  // Zkontroluj, zda uživatel již existuje
  const { data: existingUser } = await supabaseServer.auth.admin.getUserByEmail(normalizedEmail);

  if (existingUser?.user) {
    console.log(`👤 Uživatel ${normalizedEmail} již existuje (ID: ${existingUser.user.id})`);
    return { userId: existingUser.user.id, isNewUser: false };
  }

  // Vytvoř nového uživatele
  const { data: newUser, error } = await supabaseServer.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: {
      name: name || null,
      registered_via: 'start_form',
      registered_at: new Date().toISOString()
    }
  });

  if (error) {
    console.error(`❌ Chyba při vytváření uživatele: ${error.message}`);
    return null;
  }

  console.log(`✅ Nový uživatel vytvořen: ${normalizedEmail} (ID: ${newUser.user.id})`);
  return { userId: newUser.user.id, isNewUser: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const b = req.body || {};

    const toNum = (v) => (v === '' || v == null ? null : Number(v));
    const norm = (v) => (v ? String(v).trim().toLowerCase() : null);

    // Automatická registrace uživatele
    let userId = b.user_id || null;
    let isNewUser = false;

    if (b.email && !userId) {
      const userResult = await findOrCreateUser(b.email, b.name);
      if (userResult) {
        userId = userResult.userId;
        isNewUser = userResult.isNewUser;
      }
    }

    const payload = {
      user_id: userId,
      email: b.email || null,
      name: b.name || null,
      gender: norm(b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height_cm),
      weight_kg: toNum(b.weight_kg),
      activity: norm(b.activity),
      stress_level: norm(b.stress_level),
      occupation: norm(b.occupation),
      goal: norm(b.goal),
      freq_choice: norm(b.freq_choice),
      weekly_sessions_user: toNum(b.weekly_sessions_user),
      notes: b.notes || null
    };

    // Uložení do DB
    const { error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([payload]);

    if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

    // Generování plánu
    if (payload.email) {
      console.log(`🧠 Spouštím generatePlanForEmail(${payload.email})`);
      await generatePlanForEmail(payload.email, isNewUser);
      console.log(`✅ Plán pro ${payload.email} úspěšně vytvořen`);
    }

    return res.status(200).json({
      ok: true,
      message: 'Údaje uloženy a plán byl vygenerován.',
      userId: userId,
      isNewUser: isNewUser
    });

  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
