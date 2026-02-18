// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';
import { createAuthUserIfNew } from '../../lib/authHelpers';

async function findUserByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    if (typeof supabaseServer.auth.admin.getUserByEmail === 'function') {
      const { data } = await supabaseServer.auth.admin.getUserByEmail(normalizedEmail);
      return data?.user;
    }
  } catch (_) { /* API může být nedostupná v některých verzích */ }

  try {
    const { data } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return data?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);
  } catch (_) {
    return null;
  }
}

async function findOrCreateUser(email, name) {
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();

  // Zkontroluj, zda uživatel již existuje
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    console.log(`👤 Uživatel ${normalizedEmail} již existuje (ID: ${existingUser.id})`);
    return { userId: existingUser.id, isNewUser: false };
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
    if (error.message?.toLowerCase().includes('already') || error.message?.toLowerCase().includes('exist')) {
      const retryUser = await findUserByEmail(normalizedEmail);
      if (retryUser) {
        return { userId: retryUser.id, isNewUser: false };
      }
    }
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

<<<<<<< HEAD
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
=======
    // 🔧 1️⃣ Přemapování starých názvů z frontendu na názvy používané v DB
    const payload = {
      email: b.email?.trim() || null,
      name: b.name?.trim() || null,
      gender: normalizeGender(b.gender),
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d
      age: toNum(b.age),
      height_cm: toNum(b.height || b.height_cm),
      weight_kg: toNum(b.weight || b.weight_kg),
      activity: normalizeActivity(b.activity),
      stress_level: normalizeStress(b.stress || b.stress_level),
      occupation: normalizeOccupation(b.worktype || b.occupation),
      goal: normalizeGoal(b.goal),
      freq_choice: normalizeFrequency(b.frequency || b.freq_choice),
      weekly_sessions_user: getWeeklySessions(b.frequency || b.freq_choice),
      notes: b.notes?.trim() || null,
      program: b.program || 'START',
      created_at: new Date().toISOString(),
      user_id: null,
    };

<<<<<<< HEAD
    // Uložení do DB
=======
    // 🧠 2️⃣ Validace klíčových hodnot (musí být alespoň email + výška + váha)
    if (!payload.email) {
      return res.status(400).json({ error: 'E-mail je povinný.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      return res.status(400).json({ error: 'Zadej platnou e-mailovou adresu.' });
    }

    if (!payload.height_cm || !payload.weight_kg) {
      return res.status(400).json({ error: 'Chybí výška nebo váha.' });
    }
    if (payload.height_cm < 100 || payload.height_cm > 250) {
      return res.status(400).json({ error: 'Výška musí být mezi 100 a 250 cm.' });
    }
    if (payload.weight_kg < 30 || payload.weight_kg > 300) {
      return res.status(400).json({ error: 'Váha musí být mezi 30 a 300 kg.' });
    }
    if (payload.age != null && (payload.age < 15 || payload.age > 120)) {
      return res.status(400).json({ error: 'Věk musí být mezi 15 a 120.' });
    }

    // 👤 3️⃣ Vytvoření účtu (Supabase Auth) a propojení user_id
    const authResult = await createAuthUserIfNew(payload.email, payload.name);
    let loginPassword = null;
    let existingAccount = false;

    if (authResult.error) {
      console.error('❌ createAuthUserIfNew:', authResult.error);
      const isAlready = authResult.error.toLowerCase().includes('already') || authResult.error.toLowerCase().includes('registered');
      if (isAlready) {
        return res.status(400).json({
          error: 'S tímto e-mailem už máš účet. Přihlas se nebo obnov heslo na app.bodyandmindon.cz.',
        });
      }
      // Při jiné chybě (např. "Database error creating new user") uložíme data a odešleme plán bez účtu
      payload.user_id = null;
    } else {
      payload.user_id = authResult.userId;
      loginPassword = authResult.existing ? null : authResult.password;
      existingAccount = authResult.existing === true;
    }

    // 💾 4️⃣ Uložení do Supabase
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d
    const { error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([payload]);

<<<<<<< HEAD
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
=======
    if (dbErr) {
      console.error('❌ Chyba při zápisu do DB:', dbErr);
      throw new Error(dbErr.message);
    }

    console.log(`✅ Data uložena do body_metrics pro ${payload.email}, user_id: ${payload.user_id}`);

    // 🤖 5️⃣ Generování AI plánu a odeslání e-mailu (včetně přihlašovacích údajů)
    let planResult;
    try {
      planResult = await generatePlanForEmail(payload.email, {
        loginPassword,
        loginUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz',
        existingAccount,
        loginUnavailable: payload.user_id == null,
      });
    } catch (e) {
      console.error('⚠️ Chyba při generování AI plánu:', e);
      return res.status(200).json({
        ok: true,
        message: 'Údaje byly uloženy. Odeslání plánu na e-mail se nepodařilo – zkontroluj prosím spam nebo nás kontaktuj na info@bodyandmindon.cz.',
        planSent: false,
      });
    }

    if (!planResult?.ok) {
      console.error('⚠️ generatePlanForEmail vrátil chybu:', planResult?.message);
      return res.status(200).json({
        ok: true,
        message: 'Údaje byly uloženy. E-mail s plánem se nepodařilo odeslat – zkontroluj spam nebo napiš na info@bodyandmindon.cz.',
        planSent: false,
      });
    }

    const loginUnavailable = payload.user_id == null;
    return res.status(200).json({
      ok: true,
      planSent: true,
      loginUnavailable: !!loginUnavailable,
      message: loginUnavailable
        ? 'Údaje byly uloženy a plán byl odeslán na e-mail. Přihlášení do profilu je dočasně nedostupné – zkus to později nebo nás kontaktuj na info@bodyandmindon.cz.'
        : 'Údaje byly úspěšně uloženy a plán byl odeslán na e-mail.',
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d
    });

  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(400).json({
      error: e.message || 'Neočekávaná chyba při zpracování požadavku.'
    });
  }
}

/* ==============================
   Pomocné funkce
============================== */

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeGender(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  if (t === 'male' || t === 'female') return t;
  if (t.includes('muž') || t === 'm') return 'male';
  if (t.includes('žena') || t === 'f') return 'female';
  return null;
}

function normalizeActivity(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  const known = ['sedavy', 'lehce', 'stredne', 'velmi', 'extra'];
  if (known.includes(t)) return t;
  if (t.includes('nízk')) return 'lehce';
  if (t.includes('střed')) return 'stredne';
  if (t.includes('vysok')) return 'velmi';
  return 'stredne';
}

function normalizeStress(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  if (t === 'low' || t === 'medium' || t === 'high') return t;
  if (t.includes('nízk')) return 'low';
  if (t.includes('střed')) return 'medium';
  if (t.includes('vysok')) return 'high';
  return 'medium';
}

function normalizeOccupation(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  const known = ['office_it', 'manual', 'driver', 'warehouse', 'healthcare', 'teacher_sales', 'gastronomy', 'other', 'kombinovana'];
  if (known.includes(t)) return t;
  if (t.includes('it') || t.includes('kancel')) return 'office_it';
  if (t.includes('manu')) return 'manual';
  if (t.includes('kombin')) return 'teacher_sales';
  return 'other';
}

function normalizeGoal(v) {
  if (!v) return null;
  const t = v.toString().toLowerCase().trim();
  if (t === 'redukce' || t === 'nabirani_svaly' || t === 'udrzovani') return t;
  if (t.includes('reduk')) return 'redukce';
  if (t.includes('sval')) return 'nabirani_svaly';
  return 'udrzovani';
}

function normalizeFrequency(v) {
  if (!v) return null;
  const t = v.toLowerCase();
  if (t.includes('1') || t.includes('0')) return '1–2x týdně';
  if (t.includes('2') && t.includes('3')) return '2–3x týdně';
  if (t.includes('4') || t.includes('5')) return '4–5x týdně';
  return '2–3x týdně';
}

function getWeeklySessions(v) {
  if (!v) return 3;
  if (v.includes('1')) return 1;
  if (v.includes('2')) return 3;
  if (v.includes('4')) return 5;
  return 3;
}
