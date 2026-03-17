// /lib/dailyDigest.js – Denní e-mail: co jíst dnes, trénink (z plánu + kalendáře), doporučení
import nodemailer from 'nodemailer';
import { refreshAccessToken, listEvents, eventIsForUser } from './googleCalendar';

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
    .replace(/<p\s*>/gi, '<p style="margin:0 0 10px;color:#d4d4d8;font-size:14px;line-height:1.5;">')
    .replace(/<b>\s*Snídaně\s*:?\s*<\/b>/gi, '<span style="color:#fb923c;font-weight:600;">🌅 Snídaně:</span> ')
    .replace(/<b>\s*Oběd\s*:?\s*<\/b>/gi, '<span style="color:#eab308;font-weight:600;">☀️ Oběd:</span> ')
    .replace(/<b>\s*Večeře\s*:?\s*<\/b>/gi, '<span style="color:#38bdf8;font-weight:600;">🌙 Večeře:</span> ')
    .replace(/<b>\s*Svačina\s*:?\s*<\/b>/gi, '<span style="color:#a78bfa;font-weight:600;">🍎 Svačina:</span> ')
    .replace(/<p[^>]*>\s*<b>\s*Trénink tento den\s*:?\s*<\/b>\s*<\/p>/gi, '<p style="margin:14px 0 8px;font-weight:700;font-size:14px;color:#e2e8f0;">Trénink tento den:</p>')
    .replace(/<ul(\s[^>]*)?>/gi, '<ul style="margin:0 0 12px;padding-left:20px;color:#d4d4d8;font-size:14px;line-height:1.6;list-style-type:disc;">')
    .replace(/<li(\s[^>]*)?>/gi, '<li style="margin:4px 0;">');
}

/**
 * Načte z kalendáře trenéra události na dnešek přiřazené danému e-mailu.
 * Vrací [] když kalendář není propojen nebo při chybě.
 */
async function getPlannedTodayFromCalendar(supabase, userEmail) {
  if (!userEmail || !userEmail.trim()) return [];
  try {
    const { data: rows, error: fetchErr } = await supabase
      .from('trainer_calendar_tokens')
      .select('id, access_token, refresh_token, expires_at, calendar_id')
      .order('created_at', { ascending: false })
      .limit(1);
    if (fetchErr || !rows?.length) return [];
    const row = rows[0];
    let accessToken = row.access_token;
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    const now = Date.now();
    if (!accessToken || expiresAt < now + 60 * 1000) {
      const refreshed = await refreshAccessToken(row.refresh_token);
      accessToken = refreshed.access_token;
      const newExpires = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null;
      await supabase
        .from('trainer_calendar_tokens')
        .update({ access_token: accessToken, expires_at: newExpires, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const timeMin = todayStr + 'T00:00:00Z';
    const timeMax = todayStr + 'T23:59:59Z';
    const calendarId = row.calendar_id || 'primary';
    let events = await listEvents(accessToken, calendarId, timeMin, timeMax);
    events = events.filter((ev) => eventIsForUser(ev, userEmail));
    return events.map((ev) => ({ summary: ev.summary || '(Bez názvu)', start: ev.start }));
  } catch {
    return [];
  }
}

/**
 * Pro daného uživatele načte data a sestaví payload pro denní e-mail.
 */
export async function buildDigestPayload(supabase, userId, email, userName = null) {
  const todayStr = new Date().toISOString().split('T')[0];
  const dayNameCzech = getTodayDayNameCzech();

  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [planRes, workoutsRes, metricsRes, habitLogsRes, plannedRes, membershipRes, profileRes] = await Promise.allSettled([
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
    getPlannedTodayFromCalendar(supabase, email),
    supabase
      .from('memberships')
      .select('tier, trial_ends_at')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    supabase.from('profiles').select('daily_email').eq('id', userId).maybeSingle(),
  ]);

  const plan = planRes.status === 'fulfilled' && planRes.value?.data ? planRes.value.data : null;
  const workouts = workoutsRes.status === 'fulfilled' && workoutsRes.value?.data ? workoutsRes.value.data : [];
  const latestMetric = metricsRes.status === 'fulfilled' && metricsRes.value?.data ? metricsRes.value.data : null;
  const habitLogs = habitLogsRes.status === 'fulfilled' && habitLogsRes.value?.data ? habitLogsRes.value.data : [];
  const plannedToday = plannedRes.status === 'fulfilled' && Array.isArray(plannedRes.value) ? plannedRes.value : [];
  const membership = membershipRes.status === 'fulfilled' && membershipRes.value?.data ? membershipRes.value.data : null;
  const profileRow = profileRes.status === 'fulfilled' && profileRes.value?.data ? profileRes.value.data : null;
  if (profileRow?.daily_email === false) {
    return { skip: true, email };
  }
  const trialEndsAtStr = membership?.trial_ends_at ? String(membership.trial_ends_at).slice(0, 10) : null;
  const trialExpiresTomorrow = membership?.tier === 'START' && trialEndsAtStr === tomorrowStr;
  const planValidUntilStr = plan?.valid_until ? String(plan.valid_until).slice(0, 10) : null;
  const planExpiresTomorrow = planValidUntilStr === tomorrowStr;

  const todayMealsHtml = plan?.plan_html
    ? extractDayBlockFromPlanHtml(plan.plan_html, dayNameCzech)
    : null;
  const dailyCalories = plan?.daily_calories ?? null;
  const displayName = userName || latestMetric?.name || email?.split('@')[0] || 'Sportovče';

  /** Úryvek z tréninkového plánu (první odstavec nebo cca 220 znaků) pro připomínku. */
  let trainingSnippet = '';
  if (plan?.plan_html) {
    const trainingMatch = plan.plan_html.match(/<h3[^>]*>[^<]*(?:Trénink|Tréninkový plán)[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i);
    if (trainingMatch && trainingMatch[1]) {
      const raw = (trainingMatch[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      trainingSnippet = raw.length > 240 ? raw.slice(0, 237) + '…' : raw;
    }
  }

  const positiveCount = (habitLogs || []).filter((l) => l.completed === true).length;

  let recommendation = '';
  if (latestMetric?.weight_kg != null) {
    recommendation = 'Drž se plánu stravy a pohybu – každý den se počítá. ';
  }
  if (workouts.length > 0) {
    recommendation += `Dnes máš naplánovaný trénink (${workouts.length}×) – nezapomeň ho zapsat v profilu. `;
  } else if (plannedToday.length > 0) {
    const first = plannedToday[0];
    const startStr = typeof first.start === 'string' ? first.start : first.start?.dateTime || first.start?.date || '';
    const timeStr = startStr && startStr.includes('T') ? new Date(startStr).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '';
    recommendation += timeStr
      ? `Dnes máš v plánu ${first.summary} v ${timeStr} – po tréninku ho zapiš v profilu. `
      : `Dnes máš v plánu ${first.summary} – po tréninku ho zapiš v profilu. `;
  } else {
    recommendation += 'Pokud dnes cvičíš, zapiš si trénink v aplikaci – odhad váhy se ti přepočítá. ';
  }
  if (positiveCount > 0) {
    recommendation += `Dnes už máš ${positiveCount} splněných návyků – výborně! `;
  }
  if (!planExpiresTomorrow) {
    recommendation += 'Pro přehled a odhad váhy otevři svůj profil v aplikaci.';
  } else {
    recommendation += 'Otevři profil a vygeneruj si nový plán.';
  }

  return {
    email,
    displayName,
    dayNameCzech,
    todayMealsHtml,
    dailyCalories,
    workoutsToday: workouts,
    plannedToday,
    startWeight: latestMetric?.weight_kg ?? null,
    recommendation,
    hasPlan: !!plan,
    trainingSnippet: trainingSnippet || null,
    trialExpiresTomorrow: trialExpiresTomorrow || false,
    planExpiresTomorrow: planExpiresTomorrow || false,
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
    plannedToday = [],
    recommendation,
    hasPlan,
    trialExpiresTomorrow = false,
    planExpiresTomorrow = false,
  } = payload;

  const mealsBlock =
    todayMealsHtml && hasPlan
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:#1a1a24;border-radius:12px;border:1px solid #2e2e42;overflow:hidden;" bgcolor="#1a1a24">
      <tr><td style="padding:14px 18px;background:#7c3aed;color:#ffffff;font-weight:600;font-size:16px;">${escapeHtml(dayNameCzech)}</td></tr>
      <tr><td style="padding:16px 18px;color:#d4d4d8;font-size:14px;line-height:1.6;">${todayMealsHtml}</td></tr>
      ${dailyCalories != null ? `<tr><td style="padding:8px 18px 16px;font-size:13px;color:#71717a;">Cíl kalorií dnes: ${escapeHtml(String(dailyCalories))} kcal</td></tr>` : ''}
    </table>`
      : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:#1a1a24;border-radius:12px;border:1px solid #2e2e42;" bgcolor="#1a1a24">
      <tr><td style="padding:16px 18px;color:#94a3b8;font-size:14px;">Zatím nemáš vygenerovaný jídelníček. V aplikaci v sekci Můj plán si můžeš nechat vygenerovat plán na míru.</td></tr>
    </table>`;

  const plannedRows =
    Array.isArray(plannedToday) && plannedToday.length > 0
      ? plannedToday
        .map((ev) => {
          const startStr = typeof ev.start === 'string' ? ev.start : ev.start?.dateTime || ev.start?.date || '';
          const timeStr = startStr && startStr.includes('T') ? new Date(startStr).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '';
          return `<tr><td style="padding:8px 0;color:#a78bfa;font-size:14px;">V plánu: ${escapeHtml(ev.summary)}${timeStr ? ` v ${timeStr}` : ''}</td></tr>`;
        })
        .join('')
      : '';
  const loggedRows =
    Array.isArray(workoutsToday) && workoutsToday.length > 0
      ? workoutsToday
        .map(
          (w) =>
            `<tr><td style="padding:8px 0;color:#d4d4d8;font-size:14px;">Zapsáno: ${escapeHtml(w.workout_name || w.workout_type || 'Trénink')}${w.duration_min ? ` · ${w.duration_min} min` : ''}</td></tr>`
        )
        .join('')
      : '';
  const workoutRows =
    plannedRows || loggedRows
      ? plannedRows + loggedRows
      : '<tr><td style="padding:8px 0;color:#94a3b8;font-size:14px;">Dnes nemáš zapsaný trénink. Pokud cvičíš, zapiš ho v profilu.</td></tr>';

  const trainingSnippetBlock =
    trainingSnippet && trainingSnippet.trim() && !(todayMealsHtml && hasPlan)
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:#1a1f2e;border-radius:12px;border:1px solid #475569;" bgcolor="#1a1f2e">
      <tr><td style="padding:12px 18px;background:#334155;color:#94a3b8;font-weight:600;font-size:14px;">📋 Z tvého plánu – trénink</td></tr>
      <tr><td style="padding:14px 18px;color:#e2e8f0;font-size:14px;line-height:1.55;">${escapeHtml(trainingSnippet)}</td></tr>
    </table>`
      : '';

  const workoutBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:#1a1a24;border-radius:12px;border:1px solid #2e2e42;" bgcolor="#1a1a24">
      <tr><td style="padding:12px 18px;background:#2a1a3e;color:#c4b5fd;font-weight:600;font-size:15px;">🏋️ Trénink dnes</td></tr>
      <tr><td style="padding:16px 18px;"><table role="presentation" width="100%">${workoutRows}</table></td></tr>
    </table>`;

  const loginUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const onClubUrl = loginUrl + '/on-club';
  const vipUrl = loginUrl + '/chci-vip';

  const trialBlock = trialExpiresTomorrow
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:linear-gradient(135deg,rgba(234,179,8,0.15),rgba(180,130,20,0.08));border-radius:12px;border:1px solid rgba(234,179,8,0.4);" bgcolor="rgba(234,179,8,0.08)">
      <tr><td style="padding:14px 18px;color:#fde68a;font-weight:600;font-size:15px;">⏰ Tvůj START program vyprší zítra</td></tr>
      <tr><td style="padding:8px 18px 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">Pro pokračování si vyber ON Club nebo VIP Coaching – plný přístup k habit trackeru, statistikám a dalším funkcím.</td></tr>
      <tr><td style="padding:0 18px 16px;"><a href="${onClubUrl}" style="display:inline-block;padding:10px 18px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;font-weight:600;background:#7c3aed;border-radius:10px;margin-right:10px;">ON Club</a> <a href="${vipUrl}" style="display:inline-block;padding:10px 18px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;background:#ca8a04;border-radius:10px;">VIP Coaching</a></td></tr>
    </table>`
    : '';

  const planExpiresBlock = planExpiresTomorrow && !trialExpiresTomorrow
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:rgba(234,179,8,0.1);border-radius:12px;border:1px solid rgba(234,179,8,0.35);" bgcolor="rgba(234,179,8,0.06)">
      <tr><td style="padding:12px 18px;color:#fde68a;font-weight:600;font-size:14px;">📅 Tvůj plán končí zítra</td></tr>
      <tr><td style="padding:8px 18px 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">Vygeneruj si nový plán v aplikaci – <a href="${loginUrl}/profil" style="color:#a78bfa;">otevři profil</a> a přejdi na stránku <a href="${loginUrl}/start" style="color:#a78bfa;">START</a>.</td></tr>
    </table>`
    : '';

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
          ${trialBlock}
          ${planExpiresBlock}
          ${mealsBlock}
          ${trainingSnippetBlock}
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
    from: `Body & Mind ON <${process.env.EMAIL_FROM || process.env.GMAIL_FROM || process.env.GMAIL_USER}>`,
    to: email,
    subject: `${dayNameCzech} – co jíst a na co nezapomenout 💪`,
    html,
  });
  return { ok: true };
}
