// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';
import { createAuthUserIfNew } from '../../lib/authHelpers';
import { getClientIp, isRateLimited } from '../../lib/rateLimit';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ip = getClientIp(req);
    if (isRateLimited(`body-metrics:${ip}`, 5, 10 * 60 * 1000)) {
      res.setHeader('Retry-After', '600');
      return res.status(429).json({ error: 'Příliš mnoho požadavků. Zkus to prosím za chvíli znovu.' });
    }

    const b = req.body || {};

    const dietType = b.diet_type?.trim() || null;
    const dietaryRestrictions = b.dietary_restrictions?.trim() || null;
    const dietLabels = {
      vegetarian: 'Vegetarián',
      vegan: 'Vegan',
      gluten_free: 'Bez lepku',
      lactose_free: 'Bez laktózy',
      paleo: 'Paleo',
      low_carb: 'Nízkosacharidová',
      other: 'Jiné',
    };
    const dietLabel = dietType && dietLabels[dietType] ? dietLabels[dietType] : '';
    const notesParts = [];
    if (dietLabel) notesParts.push('Typ stravy: ' + dietLabel);
    if (dietaryRestrictions) notesParts.push('Co nejí: ' + dietaryRestrictions);
    const notesFinal = notesParts.length ? notesParts.join('. ') : (b.notes?.trim() || null);

    const payload = {
      email: b.email?.trim()?.toLowerCase() || null,
      name: b.name?.trim() || null,
      gender: normalizeGender(b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height || b.height_cm),
      weight_kg: toNum(b.weight || b.weight_kg),
      activity: normalizeActivity(b.activity),
      stress_level: normalizeStress(b.stress || b.stress_level),
      occupation: normalizeOccupation(b.worktype || b.occupation),
      goal: normalizeGoal(b.goal),
      freq_choice: normalizeFrequency(b.frequency || b.freq_choice),
      weekly_sessions_user: getWeeklySessions(b.frequency || b.freq_choice),
      diet_type: dietType || null,
      dietary_restrictions: dietaryRestrictions || null,
      notes: notesFinal,
      program: b.program || 'START',
      created_at: new Date().toISOString(),
      user_id: null,
    };

    if (!payload.email) {
      return res.status(400).json({ error: 'E-mail je povinný.' });
    }
    const password = typeof b.password === 'string' ? b.password.trim() : '';
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Heslo musí mít alespoň 6 znaků.' });
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

    const authResult = await createAuthUserIfNew(payload.email, payload.name, password || undefined);
    let loginPassword = null;
    let existingAccount = false;
    let userChosePassword = authResult.userChosePassword === true;

    if (authResult.error) {
      console.error('❌ createAuthUserIfNew:', authResult.error);
      const isAlready = authResult.error.toLowerCase().includes('already') || authResult.error.toLowerCase().includes('registered');
      if (isAlready) {
        return res.status(400).json({
          error: 'S tímto e-mailem už máš účet. Přihlas se nebo obnov heslo na app.bodyandmindon.cz.',
        });
      }
      payload.user_id = null;
    } else {
      payload.user_id = authResult.userId;
      loginPassword = authResult.password ?? null;
      existingAccount = authResult.existing === true;
      userChosePassword = authResult.userChosePassword === true;
    }

    const { error: dbErr } = await supabaseServer
      .from('body_metrics')
      .insert([payload]);

    if (dbErr) {
      console.error('❌ Chyba při zápisu do DB:', dbErr);
      throw new Error(dbErr.message);
    }

    console.log(`✅ Data uložena do body_metrics pro ${payload.email}, user_id: ${payload.user_id}`);

    let planResult;
    try {
      planResult = await generatePlanForEmail(payload.email, {
        loginPassword,
        loginUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz',
        existingAccount,
        loginUnavailable: payload.user_id == null,
        userChosePassword,
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

    const accountCreated = payload.user_id != null;
    return res.status(200).json({
      ok: true,
      planSent: true,
      loginUnavailable: !accountCreated,
      message: accountCreated
        ? 'Údaje byly úspěšně uloženy a plán byl odeslán na e-mail. V e-mailu najdeš přihlašovací údaje – s nimi se můžeš přihlásit a vidět svůj profil.'
        : 'Údaje a plán byly uloženy a odeslány na e-mail. Vytvoření přihlašovacího účtu se nezdařilo – pro přístup do profilu nás kontaktuj na info@bodyandmindon.cz.',
    });

  } catch (e) {
    console.error('[body-metrics] ERROR:', e);
    return res.status(500).json({
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
