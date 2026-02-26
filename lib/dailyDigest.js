// /lib/dailyDigest.js – Denní e-mail: co jíst dnes, trénink, doporučení k cíli
import nodemailer from 'nodemailer';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTodayDayNameCzech() {
  return CZECH_DAYS[new Date().getDay()];
}

/**
 * Z plan_html vybere blok pro daný den (h4 + obsah do dalšího h4). Server-safe regex.
 */
function extractDayBlockFromPlanHtml(planHtml, dayNameCzech) {
  if (!planHtml || typeof planHtml !== 'string' || !dayNameCzech) return null;
  const escaped = dayNameCzech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<h4[^>]*>\\s*${escaped}[^<]*</h4>([\\s\\S]*?)(?=<h4[^>]*>|$)`,
    'i'
  );
  const match = planHtml.trim().match(regex);
  if (!match || !match[1]) return null;
  const content = match[1].trim();
  return content
    .replace(/<p\s*>/gi, '<p style="margin:0 0 10px;color:#d4d4d8;font-size:14px;">')
    .replace(/<b>\s*Snídaně\s*:?\s*<\/b>/gi, '<span style="color:#a78bfa;">🌅 Snídaně:</span> ')
    .replace(/<b>\s*Oběd\s*:?\s*<\/b>/gi, '<span style="color:#a78bfa;">☀️ Oběd:</span> ')
    .replace(/<b>\s*Večeře\s*:?\s*<\/b>/gi, '<span style="color:#a78bfa;">🌙 Večeře:</span> ')
    .replace(/<b>\s*Svačina\s*:?\s*<\/b>/gi, '<span style="color:#a78bfa;">🍎 Svačina:</span> ');
}

/**
 * Pro daného uživatele načte data a sestaví payload pro denní e-mail.
 */
export async function buildDigestPayload(supabase, userId, email, userName = null) {
  const todayStr = new Date().toISOString().split('T')[0];
  const dayNameCzech = getTodayDayNameCzech();

  const [planRes, workoutsRes, metricsRes, habitLogsRes] = await Promise.allSettled([
    supabase
      .from('ai_generated_plans')
      .select('id, plan_html, daily_calories, macros, valid_from, valid_until')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workouts')
      .select('id, workout_date, workout_type, workout_name, duration_min')
      .eq('user_id', userId)
      .eq('workout_date', todayStr),
    supabase
      .from('body_metrics')
      .select('weight_kg, height_cm, name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('habit_logs')
      .select('habit_id, completed')
      .eq('user_id', userId)
      .gte('log_date', todayStr)
      .lte('log_date', todayStr),
  ]);

  const plan = planRes.status === 'fulfilled' && planRes.value?.data ? planRes.value.data : null;
  const workouts = workoutsRes.status === 'fulfilled' && workoutsRes.value?.data ? workoutsRes.value.data : [];
  const latestMetric = metricsRes.status === 'fulfilled' && metricsRes.value?.data ? metricsRes.value.data : null;
  const habitLogs = habitLogsRes.status === 'fulfilled' && habitLogsRes.value?.data ? habitLogsRes.value.data : [];

  const todayMealsHtml = plan?.plan_html
    ? extractDayBlockFromPlanHtml(plan.plan_html, dayNameCzech)
    : null;
  const dailyCalories = plan?.daily_calories ?? null;
  const displayName = userName || latestMetric?.name || email?.split('@')[0] || 'Sportovče';

  const positiveCount = (habitLogs || []).filter((l) => l.completed === true).length;

  let recommendation = '';
  if (latestMetric?.weight_kg != null) {
    recommendation = 'Drž se plánu stravy a pohybu – každý den se počítá. ';
  }
  if (workouts.length > 0) {
    recommendation += `Dnes máš naplánovaný trénink (${workouts.length}×) – nezapomeň ho zapsat v profilu. `;
  } else {
    recommendation += 'Pokud dnes cvičíš, zapiš si trénink v aplikaci – odhad váhy se ti přepočítá. ';
  }
  if (positiveCount > 0) {
    recommendation += `Dnes už máš ${positiveCount} splněných návyků – výborně! `;
  }
  recommendation += 'Pro přehled a odhad váhy otevři svůj profil v aplikaci.';

  return {
    email,
    displayName,
    dayNameCzech,
    todayMealsHtml,
    dailyCalories,
    workoutsToday: workouts,
    startWeight: latestMetric?.weight_kg ?? null,
    recommendation,
    hasPlan: !!plan,
  };
}

/**
 * Odešle denní digest e-mail na danou adresu.
 */
export async function sendDailyDigestEmail(email, payload) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Chybí GMAIL_USER nebo GMAIL_APP_PASSWORD v env.');
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const {
    displayName,
    dayNameCzech,
    todayMealsHtml,
    dailyCalories,
    workoutsToday,
    recommendation,
    hasPlan,
  } = payload;

  const mealsBlock =
    todayMealsHtml && hasPlan
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:#1a1a24;border-radius:12px;border:1px solid #2e2e42;" bgcolor="#1a1a24">
      <tr><td style="padding:12px 18px;background:#2a1a3e;color:#c4b5fd;font-weight:600;font-size:15px;">🍽️ Jídelníček na ${escapeHtml(dayNameCzech)}</td></tr>
      <tr><td style="padding:16px 18px;color:#d4d4d8;font-size:14px;line-height:1.6;">${todayMealsHtml}</td></tr>
      ${dailyCalories != null ? `<tr><td style="padding:8px 18px 16px;font-size:13px;color:#71717a;">Cíl kalorií dnes: ${escapeHtml(String(dailyCalories))} kcal</td></tr>` : ''}
    </table>`
      : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:#1a1a24;border-radius:12px;border:1px solid #2e2e42;" bgcolor="#1a1a24">
      <tr><td style="padding:16px 18px;color:#94a3b8;font-size:14px;">Zatím nemáš vygenerovaný jídelníček. V aplikaci v sekci Můj plán si můžeš nechat vygenerovat plán na míru.</td></tr>
    </table>`;

  const workoutRows =
    Array.isArray(workoutsToday) && workoutsToday.length > 0
      ? workoutsToday
        .map(
          (w) =>
            `<tr><td style="padding:8px 0;color:#d4d4d8;font-size:14px;">${escapeHtml(w.workout_name || w.workout_type || 'Trénink')} ${w.duration_min ? ` · ${w.duration_min} min` : ''}</td></tr>`
        )
        .join('')
      : '<tr><td style="padding:8px 0;color:#94a3b8;font-size:14px;">Dnes nemáš zapsaný trénink. Pokud cvičíš, zapiš ho v profilu.</td></tr>';

  const workoutBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:#1a1a24;border-radius:12px;border:1px solid #2e2e42;" bgcolor="#1a1a24">
      <tr><td style="padding:12px 18px;background:#2a1a3e;color:#c4b5fd;font-weight:600;font-size:15px;">🏋️ Trénink dnes</td></tr>
      <tr><td style="padding:16px 18px;"><table role="presentation" width="100%">${workoutRows}</table></td></tr>
    </table>`;

  const loginUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '') + '/profil';

  const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;color:#eaeaea;font-family:Segoe UI,Roboto,sans-serif;font-size:16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;">
    <tr><td style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#12121a;border-radius:16px;overflow:hidden;" bgcolor="#12121a">
        <tr>
          <td style="padding:24px 24px 16px;background:#1a0a2e;border-bottom:1px solid #2a2a3d;" bgcolor="#1a0a2e">
            <p style="margin:0;font-size:14px;color:#a78bfa;">Tvůj denní přehled</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#fff;">Ahoj, ${escapeHtml(displayName)}</h1>
            <p style="margin:6px 0 0;font-size:14px;color:#94a3b8;">${escapeHtml(dayNameCzech)} – co dnes jíst a na co nezapomenout</p>
          </td>
        </tr>
        <tr><td style="padding:24px;">
          ${mealsBlock}
          ${workoutBlock}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:rgba(124,58,237,0.1);border-radius:12px;border:1px solid rgba(124,58,237,0.3);" bgcolor="rgba(124,58,237,0.08)">
            <tr><td style="padding:12px 18px;color:#c4b5fd;font-weight:600;font-size:14px;">💡 Doporučení</td></tr>
            <tr><td style="padding:8px 18px 16px;color:#d4d4d8;font-size:14px;line-height:1.6;">${escapeHtml(recommendation)}</td></tr>
          </table>
          <p style="text-align:center;margin:20px 0 0;">
            <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;border-radius:12px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;background:#7c3aed;">Otevřít profil →</a>
          </p>
          <p style="margin:20px 0 0;font-size:13px;color:#71717a;">Body &amp; Mind ON · Denní přehled</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `Body & Mind ON <${process.env.EMAIL_FROM || process.env.GMAIL_USER}>`,
    to: email,
    subject: `${dayNameCzech} – co jíst a na co nezapomenout 💪`,
    html,
  });
  return { ok: true };
}
