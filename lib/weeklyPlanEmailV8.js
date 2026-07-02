import { readFileSync } from 'fs';
import { join } from 'path';
import { escapeHtml } from './emailTemplates.js';
import { mealDisplayTitleForStructuredMeal } from './mealDisplayNameHelpers.js';
import { addCalendarDaysIsoPrague } from './czechCalendar.js';
import { calendarDateIsoInPrague } from './czechCalendar.js';
import { getPublicAppUrl, getPlanEmailCtaUrl, getProfileUrl } from './siteUrls.js';
import { toCzechVocative } from './utils/czechVocative.js';
import { formatDayDateWords, formatDayDateNumeric, dayOrdinalCs } from './utils/czechDateWords.js';
import { V8 as COL } from './emailV8Palette.js';
import { EMAIL_FONTS } from './email/emailDesignTokens.js';
import { formatExerciseSetsRepsDisplay } from './planDataIntegrity.js';
import { getMealNutritionDisplay, sumMealCalories } from './mealNutritionDisplay.js';
import { getMealRecipeUrl } from './mealRecipeDisplay.js';
import { createMealDisplayModel } from './mealDisplayModel.js';
import { buildStructuredWeekSource } from './plan/structuredWeekSource.js';

// v8: unified dark palette (COL); day 1 + days 2–7 share gradient header + dark body pattern.
// Day 1 rendered as full card (meals + macros + workout); days 2-7 compact one-liner cards.
// Rounded shapes everywhere (16px/12px/10px/8px/999px) — Outlook desktop downgrades to
// square corners but that is the accepted trade-off (Gmail / Apple Mail / iOS / Android = 90%+).

const FONT_BODY = EMAIL_FONTS.body;
const FONT_MONO = EMAIL_FONTS.mono;

function renderBulletproofButton(href, label, opts = {}) {
  const safeHref = escapeHtml(String(href || '').trim());
  const safeLabel = escapeHtml(String(label || '').trim());
  if (!safeHref || !safeLabel) return '';
  const bg = opts.bg || '#0EA5E9';
  const grad = opts.gradient !== false;
  const bgStyle = grad
    ? `background-color:${bg};background-image:linear-gradient(135deg,#0EA5E9 0%,#A78BFA 100%);`
    : `background-color:${bg};`;
  const extraClass = opts.fullWidth === false ? '' : ' full-btn';
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeHref}" style="height:52px;v-text-anchor:middle;width:360px;" arcsize="14%" stroke="f" fillcolor="${bg}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="${extraClass.trim()}" style="display:inline-block;${opts.fullWidth === false ? '' : 'width:100%;max-width:100%;box-sizing:border-box;'}${bgStyle}border-radius:10px;padding:16px 28px;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;text-align:center;letter-spacing:0.3px;mso-hide:all;">${safeLabel}</a>
<!--<![endif]-->`;
}

function renderFooterCtaBlock({ ctaUrl, webViewUrl, appBaseUrl }) {
  const profilUrl = getProfileUrl();
  const planUrl = webViewUrl || ctaUrl;
  const primary = renderBulletproofButton(ctaUrl, 'Otevřít můj profil');
  const btnApp = renderBulletproofButton(profilUrl, 'Otevřít můj profil', { gradient: false, bg: '#172033', fullWidth: false });
  const btnPlan = renderBulletproofButton(planUrl, 'Zobrazit celý plán →', { gradient: false, bg: '#172033', fullWidth: false });
  const btnShop = renderBulletproofButton(profilUrl, 'Nákupní seznam →', { gradient: false, bg: '#172033', fullWidth: false });
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;"><tr><td align="center">${primary}</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="stack-col" width="33%" align="center" style="padding:6px 4px;">${btnApp}</td>
<td class="stack-col" width="34%" align="center" style="padding:6px 4px;">${btnPlan}</td>
<td class="stack-col" width="33%" align="center" style="padding:6px 4px;">${btnShop}</td>
</tr></table>`;
}

const MEAL_TYPE_LABELS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

const MEAL_TIME_META = {
  breakfast: { icon: '☀', time_word: 'RÁNO', time: '07:30', color: '#22D3EE' },
  lunch: { icon: '◐', time_word: 'POLEDNE', time: '13:00', color: '#0EA5E9' },
  dinner: { icon: '☾', time_word: 'VEČER', time: '19:00', color: '#A78BFA' },
  snack: { icon: '◇', time_word: 'ODPOLEDNE', time: '16:00', color: '#22D3EE' },
};

const GOAL_TEXT_CS = {
  redukce: 'Hubnutí',
  weight_loss: 'Hubnutí',
  nabirani_svaly: 'Nabírání svalů',
  muscle_gain: 'Nabírání svalů',
  udrzovani: 'Udržování',
  maintenance: 'Udržování',
  endurance: 'Vytrvalost',
};

function goalKey(goal) {
  const raw = String(goal || '').toLowerCase();
  if (raw === 'redukce' || raw === 'weight_loss') return 'weight_loss';
  if (raw === 'nabirani_svaly' || raw === 'muscle_gain') return 'muscle_gain';
  if (raw === 'endurance') return 'endurance';
  if (raw === 'udrzovani' || raw === 'maintenance') return 'maintenance';
  return 'muscle_gain';
}

function goalTextHtml(goal) {
  return GOAL_TEXT_CS[goalKey(goal)] || GOAL_TEXT_CS.muscle_gain;
}

let cachedTemplate = null;
let cachedCoachVoice = null;

function loadTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const path = join(process.cwd(), 'lib', 'templates', 'bmon_weekly_plan_email_v8.html');
  cachedTemplate = readFileSync(path, 'utf8');
  return cachedTemplate;
}

function loadCoachVoice() {
  if (cachedCoachVoice) return cachedCoachVoice;
  // v8 reuses the v5 coach voice content (mottos, intros, kcal lead-ins, signatures, macro commentary).
  const path = join(process.cwd(), 'lib', 'templates', 'v5_content', 'coach_voice_v5_cs.json');
  cachedCoachVoice = JSON.parse(readFileSync(path, 'utf8'));
  return cachedCoachVoice;
}

function isoWeekNumber(isoDateYmd) {
  const iso = String(isoDateYmd || '').replace(/T.*/, '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function applyVars(html, vars) {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value == null ? '' : String(value));
  }
  return out;
}

function minifyHtml(html) {
  let out = html;
  const conditionals = [];
  out = out.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, (m) => {
    conditionals.push(m);
    return `__COND_${conditionals.length - 1}__`;
  });
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/>\s+</g, '><');
  out = out.replace(/style="([^"]*)"/g, (_m, body) => {
    const trimmed = body.replace(/\s*;\s*/g, ';').replace(/\s*:\s*/g, ':').replace(/;\s*$/, '');
    return `style="${trimmed}"`;
  });
  out = out.replace(/__COND_(\d+)__/g, (_m, i) => conditionals[Number(i)] || '');
  return out;
}

function mealRecipeUrl(meal, appBaseUrl) {
  return getMealRecipeUrl(meal, appBaseUrl);
}

function mealMacros(meal) {
  return getMealNutritionDisplay(meal);
}

function fmtTargetMacro(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return `<span style="color:${COL.TEXT_DIM};font-weight:400">—</span>`;
  }
  return `${Math.round(Number(value))}<span style="font-size:12px;color:${COL.TEXT_MUTED};font-weight:400"> g</span>`;
}

function fmtMacroInline(value, color) {
  if (value == null) return `<span style="color:${COL.TEXT_DIM};font-weight:600">—</span>`;
  return `<strong style="color:${color};font-weight:700">${value} g</strong>`;
}

function fmtKcal(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const v = Math.round(Number(value));
  // Czech thousands separator with non-breaking space
  return v.toLocaleString('cs-CZ').replace(/\s/g, '\u00A0');
}

function localizeSetsRepsText(value) {
  return String(value || '')
    .replace(/\bper leg\b/gi, 'na každou nohu')
    .replace(/\beach leg\b/gi, 'na každou nohu');
}

function getMottoForWeek(weekNumber, coachVoice) {
  const list = Array.isArray(coachVoice?.weekly_mottos) ? coachVoice.weekly_mottos : [];
  if (!list.length) return { text: 'Nemusíš to mít rád. Stačí, že to děláš.' };
  const week = Number(weekNumber);
  const idx = Number.isFinite(week) && week >= 0 ? ((week % list.length) + list.length) % list.length : 0;
  const m = list[idx] || list[0];
  return { text: m?.text || list[0].text };
}

function splitMottoIntoLines(text) {
  const safe = String(text || '').trim();
  if (!safe) return { line1: '', line2: '' };
  const periodIdx = safe.indexOf('.');
  if (periodIdx > 0 && periodIdx < safe.length - 1) {
    return {
      line1: safe.slice(0, periodIdx + 1),
      line2: safe.slice(periodIdx + 1).trim(),
    };
  }
  return { line1: safe, line2: '' };
}

function getCoachIntro(goal, coachVoice) {
  const intros = coachVoice?.coach_intros || {};
  return intros[goalKey(goal)] || intros.muscle_gain || '';
}

function getMacroCommentary(goal, coachVoice) {
  const map = coachVoice?.macro_commentary || {};
  return map[goalKey(goal)] || map.muscle_gain || {};
}

function getKcalLeadIn(goal, coachVoice) {
  const map = coachVoice?.kcal_leadins || coachVoice?.kcal_lead_in || {};
  return map[goalKey(goal)] || map.muscle_gain || '';
}

function getWorkoutCopy(intensity, coachVoice) {
  const key = String(intensity || '').toLowerCase();
  const valid = ['easy', 'medium', 'hard', 'rest'];
  const resolved = valid.includes(key) ? key : 'medium';
  return {
    intro: coachVoice?.workout_intros?.[resolved] || 'Krátký. Poctivý.',
    description: coachVoice?.workout_descriptions?.[resolved]
      || '30 minut. Žádné výmluvy. Pokud nezvládneš všechno, udělej alespoň první cvik.',
    key: resolved,
  };
}

function inferWorkoutIntensity(workout, day) {
  const raw = String(workout?.intensity || day?.workout_intensity || '').toLowerCase();
  if (['easy', 'medium', 'hard', 'rest'].includes(raw)) return raw;
  return 'medium';
}

function renderMacrosBlock(targets, commentary) {
  const rows = [
    { label: 'BÍLKOVINY', value: targets?.protein_g, comment: commentary.protein || '', color: '#0EA5E9' },
    { label: 'SACHARIDY', value: targets?.carbs_g, comment: commentary.carbs || '', color: '#A78BFA' },
    { label: 'TUKY', value: targets?.fat_g, comment: commentary.fat || '', color: '#22D3EE' },
  ];
  return rows
    .map((row) => {
      const valueHtml = fmtTargetMacro(row.value);
      const commentHtml = row.comment
        ? `<td align="right" valign="middle" style="font-family:${FONT_BODY};font-size:12px;color:${COL.TEXT_MUTED};font-weight:400;line-height:1.55;padding-left:12px;max-width:220px;">${escapeHtml(row.comment)}</td>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COL.CARD_ALT}" style="background-color:${COL.CARD_ALT};border:1px solid rgba(14,165,233,0.2);border-left:3px solid ${row.color};border-radius:10px;border-collapse:separate !important;margin-top:8px;"><tr><td bgcolor="${COL.CARD_ALT}" style="background-color:${COL.CARD_ALT};padding:16px 20px;border-radius:10px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><div style="font-family:${FONT_BODY};font-size:11px;color:${row.color};letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">${escapeHtml(row.label)}</div><div style="font-family:${FONT_BODY};font-size:20px;color:${COL.TEXT_PRIMARY};font-weight:700;letter-spacing:-0.3px;line-height:1;">${valueHtml}</div></td>${commentHtml}</tr></table></td></tr></table>`;
    })
    .join('');
}

function renderHabits(habits) {
  if (!Array.isArray(habits) || habits.length === 0) return '';
  const accents = ['#0EA5E9', '#A78BFA', '#22D3EE'];
  return habits
    .map((habit, idx) => {
      const title = typeof habit === 'string' ? habit : habit?.title || habit?.text || '';
      const description = typeof habit === 'string' ? '' : habit?.description || habit?.detail || '';
      if (!title) return '';
      const color = accents[idx % accents.length];
      const num = String(idx + 1).padStart(2, '0');
      const mb = idx === habits.length - 1 ? '' : 'margin-bottom:10px;';
      const descriptionHtml = description
        ? `<div style="font-family:${FONT_BODY};font-size:12px;color:${COL.TEXT_MUTED};line-height:1.55;">${escapeHtml(description)}</div>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COL.CARD_ALT}" style="background-color:${COL.CARD_ALT};border:1px solid rgba(14,165,233,0.2);border-radius:10px;border-collapse:separate !important;${mb}"><tr><td width="56" bgcolor="${color}" align="center" valign="middle" style="background-color:${color};border-radius:10px 0 0 10px;padding:16px 0;font-family:${FONT_BODY};font-size:20px;color:#FFFFFF;font-weight:700;letter-spacing:-0.3px;">${num}</td><td bgcolor="${COL.CARD_ALT}" valign="middle" style="background-color:${COL.CARD_ALT};padding:14px 18px;border-radius:0 10px 10px 0;"><div style="font-family:${FONT_BODY};font-size:15px;color:${COL.TEXT_PRIMARY};font-weight:600;line-height:1.3;letter-spacing:-0.2px;margin-bottom:4px;">${escapeHtml(title)}</div>${descriptionHtml}</td></tr></table>`;
    })
    .filter(Boolean)
    .join('');
}

function extractHabits() {
  return [];
}

function dayIsoDate(day, index, validFrom) {
  const rawDate = typeof day?.date === 'string' ? day.date.replace(/T.*/, '').slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(validFrom || '')) return addCalendarDaysIsoPrague(validFrom, index);
  return '';
}

function renderMealCardFull(meal, day, planJson, appBaseUrl) {
  const type = meal?.type ?? 'breakfast';
  const timeMeta = MEAL_TIME_META[type] || MEAL_TIME_META.breakfast;
  const label = MEAL_TYPE_LABELS[type] || type;
  const dayName = day?.day_name ?? day?.date ?? 'Den';
  const model = createMealDisplayModel(meal, appBaseUrl);
  const normalizedMeal = model.normalizedMeal || meal;
  const title = model.title || mealDisplayTitleForStructuredMeal(normalizedMeal, planJson?.html || '', dayName);
  const recipeUrl = model.recipeUrl || mealRecipeUrl(normalizedMeal, appBaseUrl);
  const macros = mealMacros(normalizedMeal);
  const accent = timeMeta.color;

  // Convert hex to rgba-friendly border color
  const accentRgba = accent === '#22D3EE'
    ? 'rgba(34,211,238,0.25)'
    : accent === '#0EA5E9'
      ? 'rgba(14,165,233,0.25)'
      : accent === '#A78BFA'
        ? 'rgba(167,139,250,0.25)'
        : 'rgba(14,165,233,0.25)';
  const accentBg = accent === '#22D3EE'
    ? 'rgba(34,211,238,0.15)'
    : accent === '#0EA5E9'
      ? 'rgba(14,165,233,0.15)'
      : accent === '#A78BFA'
        ? 'rgba(167,139,250,0.15)'
        : 'rgba(14,165,233,0.15)';
  const accentBorder = accent === '#22D3EE'
    ? 'rgba(34,211,238,0.4)'
    : accent === '#0EA5E9'
      ? 'rgba(14,165,233,0.4)'
      : accent === '#A78BFA'
        ? 'rgba(167,139,250,0.4)'
        : 'rgba(14,165,233,0.4)';

  const recipeButton = recipeUrl
    ? `<a href="${escapeHtml(recipeUrl)}" target="_blank" rel="noopener noreferrer" class="full-btn" style="display:inline-block;background-color:${accentBg};border:1px solid ${accentBorder};border-radius:999px;padding:8px 14px;font-family:${FONT_BODY};font-size:11px;color:${accent};letter-spacing:0.5px;font-weight:700;text-decoration:none;text-transform:uppercase;">Recept →</a>`
    : '';

  const macroLine = `${macros.calories != null ? `<strong style="color:#E2E8F0;font-weight:700">${macros.calories} kcal</strong> · ` : ''}${fmtMacroInline(macros.protein_g, '#0EA5E9')} bílkovin · ${fmtMacroInline(macros.carbs_g, '#22D3EE')} sacharidů · ${fmtMacroInline(macros.fat_g, '#A78BFA')} tuků · ${fmtMacroInline(macros.fiber_g, '#10B981')} vlákniny`;

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};border:1px solid ${accentRgba};border-left:3px solid ${accent};border-radius:12px;border-collapse:separate !important;margin-bottom:8px;"><tr><td bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};padding:16px 20px;border-radius:12px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr><td valign="middle" style="font-family:${FONT_BODY};font-size:11px;color:${accent};letter-spacing:1px;font-weight:600;text-transform:uppercase;">${timeMeta.icon}&nbsp;${escapeHtml(timeMeta.time_word)} · ${escapeHtml(timeMeta.time)}</td><td align="right" valign="middle">${recipeButton}</td></tr></table><div class="meal-name-mobile" style="font-family:${FONT_BODY};font-size:18px;color:${COL.TEXT_PRIMARY};font-weight:700;letter-spacing:-0.3px;line-height:1.2;margin-bottom:10px;">${escapeHtml(title || label)}</div><div style="font-family:${FONT_BODY};font-size:12px;color:${COL.TEXT_SECONDARY};font-weight:500;line-height:1.55;">${macroLine}</div></td></tr></table>`;
}

function renderDailyTotalPill(day) {
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  const dailyKcal = sumMealCalories(meals);
  const kcalDisplay = dailyKcal != null ? String(dailyKcal) : '—';

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};border:1px solid rgba(14,165,233,0.3);border-radius:999px;border-collapse:separate !important;margin-top:12px;"><tr><td bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};padding:14px 22px;border-radius:999px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="font-family:${FONT_BODY};font-size:13px;color:${COL.TEXT_MUTED};font-weight:500;">Celkem za den</td><td align="right" valign="middle" style="font-family:${FONT_BODY};font-size:18px;color:${COL.TEXT_PRIMARY};font-weight:700;letter-spacing:-0.3px;">${escapeHtml(kcalDisplay)} <span style="font-size:12px;color:${COL.TEXT_MUTED};font-weight:500;">kcal</span></td></tr></table></td></tr></table>`;
}

function renderWorkoutFull(day, coachVoice, appBaseUrl) {
  const workout = day?.workout || {};
  const exercises = Array.isArray(workout?.exercises)
    ? workout.exercises
    : Array.isArray(day?.exercises)
      ? day.exercises
      : [];

  if (!exercises.length) {
    const restCopy = getWorkoutCopy('rest', coachVoice);
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};border:1px solid rgba(14,165,233,0.25);border-left:3px solid ${COL.SKY};border-radius:12px;border-collapse:separate !important;margin-top:12px;"><tr><td bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};padding:20px;border-radius:12px;"><div style="font-family:${FONT_BODY};font-size:11px;color:${COL.SKY};letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:8px;">▲ Trénink dne</div><div style="font-family:${FONT_BODY};font-size:18px;color:${COL.TEXT_PRIMARY};font-weight:700;line-height:1.2;margin-bottom:8px;">${escapeHtml(restCopy.intro)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:${COL.TEXT_MUTED};font-weight:400;line-height:1.55;">${escapeHtml(restCopy.description)}</div></td></tr></table>`;
  }

  const intensity = inferWorkoutIntensity(workout, day);
  const copy = getWorkoutCopy(intensity, coachVoice);
  const borderColor = intensity === 'hard' ? COL.INTENSITY_HARD : intensity === 'easy' ? COL.SUCCESS : COL.LAVENDER;
  const borderRgba = intensity === 'hard'
    ? 'rgba(239,68,68,0.25)'
    : intensity === 'easy'
      ? 'rgba(16,185,129,0.25)'
      : 'rgba(167,139,250,0.25)';

  const inlineExerciseList = exercises
    .map((ex) => {
      const name = String(ex?.name || ex?.exercise_name || ex?.display_name_cs || 'Cvik');
      const repsUnit = localizeSetsRepsText(formatExerciseSetsRepsDisplay(ex, { nbsp: true }));
      return `${escapeHtml(name)} <strong style="color:${COL.TEXT_PRIMARY};font-weight:600;">${escapeHtml(repsUnit)}</strong>`;
    })
    .join(' · ');

  const trainingCta = renderBulletproofButton(
    getProfileUrl(),
    'Otevřít trénink v aplikaci →',
    { fullWidth: false }
  );

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};border:1px solid ${borderRgba};border-left:3px solid ${borderColor};border-radius:12px;border-collapse:separate !important;margin-top:12px;"><tr><td bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};padding:20px;border-radius:12px;"><div style="font-family:${FONT_BODY};font-size:11px;color:${borderColor};letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:8px;">▲ Trénink dne</div><div style="font-family:${FONT_BODY};font-size:18px;color:${COL.TEXT_PRIMARY};font-weight:700;line-height:1.2;margin-bottom:8px;">${escapeHtml(copy.intro)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:${COL.TEXT_MUTED};font-weight:400;line-height:1.55;margin-bottom:12px;">${escapeHtml(copy.description)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:${COL.TEXT_SECONDARY};font-weight:400;line-height:1.7;margin-bottom:16px;">${inlineExerciseList}</div><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>${trainingCta}</td></tr></table></td></tr></table>`;
}

function renderDayFull(day, index, totalDays, planJson, appBaseUrl, coachVoice, validFrom) {
  const dayName = day?.day_name || `Den ${index + 1}`;
  const iso = dayIsoDate(day, index, validFrom);
  const dateWords = formatDayDateWords(iso) || formatDayDateNumeric(iso) || '';
  const yearStr = iso ? iso.slice(0, 4) : '';
  const dateDisplay = dateWords && yearStr
    ? `${dateWords.charAt(0).toUpperCase()}${dateWords.slice(1)} ${yearStr}`
    : dateWords;
  const ordinalLabel = `Den ${String(index + 1).padStart(2, '0')} · ${dayOrdinalCs(index + 1)}`;

  const meals = Array.isArray(day?.meals) ? day.meals : [];
  const mealsHtml = meals.map((meal) => renderMealCardFull(meal, day, planJson, appBaseUrl)).join('');
  const dailyTotalHtml = renderDailyTotalPill(day);
  const workoutHtml = renderWorkoutFull(day, coachVoice, appBaseUrl);

  return `<tr><td class="mobile-pad" bgcolor="${COL.PAGE_BG}" style="background-color:${COL.PAGE_BG};padding:0 16px 12px 16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};border:1px solid rgba(14,165,233,0.2);border-radius:16px;border-collapse:separate !important;"><tr><td bgcolor="${COL.HEADER_BG_FALLBACK}" style="background-color:${COL.HEADER_BG_FALLBACK};background-image:linear-gradient(135deg,${COL.HEADER_START} 0%,${COL.HEADER_END} 100%);border-radius:16px 16px 0 0;padding:20px 24px;"><div style="font-family:${FONT_BODY};font-size:11px;color:rgba(255,255,255,0.9);letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">${escapeHtml(ordinalLabel)}</div><div class="day-name-mobile" style="font-family:${FONT_BODY};font-size:24px;color:#FFFFFF;font-weight:700;letter-spacing:-0.5px;line-height:1.1;">${escapeHtml(dayName)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:rgba(255,255,255,0.85);font-weight:500;margin-top:4px;">${escapeHtml(dateDisplay)}</div></td></tr><tr><td class="px-card-mobile" bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};padding:20px;border-radius:0 0 16px 16px;">${mealsHtml}${dailyTotalHtml}${workoutHtml}</td></tr></table></td></tr>`;
}

function getCompactMealLine(day, type, planJson) {
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  const found = meals.find((m) => (m?.type ?? '') === type);
  if (!found) return null;
  const model = createMealDisplayModel(found);
  if (model.title) return model.title;
  const dayName = day?.day_name || 'Den';
  return mealDisplayTitleForStructuredMeal(found, planJson?.html || '', dayName) || MEAL_TYPE_LABELS[type] || '';
}

function compactWorkoutLine(day, coachVoice) {
  const workout = day?.workout || {};
  const exercises = Array.isArray(workout?.exercises)
    ? workout.exercises
    : Array.isArray(day?.exercises)
      ? day.exercises
      : [];
  if (!exercises.length) {
    return { color: '#0EA5E9', text: 'Volný den. Odpočinek je součást plánu.' };
  }
  const intensity = inferWorkoutIntensity(workout, day);
  const borderColor = intensity === 'hard' ? COL.INTENSITY_HARD : intensity === 'easy' ? COL.SUCCESS : COL.LAVENDER;
  const first3 = exercises.slice(0, 3).map((ex) => {
    const name = String(ex?.name || ex?.exercise_name || ex?.display_name_cs || 'Cvik');
    const repsUnit = localizeSetsRepsText(formatExerciseSetsRepsDisplay(ex, { nbsp: true }));
    return `${escapeHtml(name)} <strong style="color:${COL.TEXT_PRIMARY};font-weight:600;">${escapeHtml(repsUnit)}</strong>`;
  }).join(' · ');
  const moreCount = exercises.length - 3;
  const tail = moreCount > 0 ? ` <span style="color:${COL.TEXT_MUTED};font-weight:500;">+ ${moreCount} dalších</span>` : '';
  // Override workout copy intro if available
  const copy = getWorkoutCopy(intensity, coachVoice);
  return { color: borderColor, text: `${first3}${tail}`, intro: copy.intro };
}

function renderDayCompact(day, index, planJson, appBaseUrl, coachVoice, validFrom) {
  const dayName = day?.day_name || `Den ${index + 1}`;
  const iso = dayIsoDate(day, index, validFrom);
  const dateShort = formatDayDateNumeric(iso) || '';
  const ordinalLabel = `Den ${String(index + 1).padStart(2, '0')} · ${dayOrdinalCs(index + 1)}`;

  const breakfastTitle = getCompactMealLine(day, 'breakfast', planJson);
  const lunchTitle = getCompactMealLine(day, 'lunch', planJson);
  const dinnerTitle = getCompactMealLine(day, 'dinner', planJson);
  const snackTitle = getCompactMealLine(day, 'snack', planJson);

  const dayUrl = getPlanEmailCtaUrl();
  const workoutInfo = compactWorkoutLine(day, coachVoice);

  const mealRow = (timeMeta, label, title) => {
    if (!title) return '';
    return `<tr><td valign="top" width="16" style="padding-top:2px;font-family:${FONT_BODY};font-size:12px;color:${timeMeta.color};font-weight:700;">${timeMeta.icon}</td><td style="padding:0 0 6px 6px;font-family:${FONT_BODY};font-size:13px;color:${COL.TEXT_SECONDARY};line-height:1.5;"><strong style="color:${COL.TEXT_PRIMARY};font-weight:600;">${escapeHtml(label)}:</strong> ${escapeHtml(title)}</td></tr>`;
  };

  const mealRowsHtml = [
    mealRow(MEAL_TIME_META.breakfast, 'Snídaně', breakfastTitle),
    mealRow(MEAL_TIME_META.lunch, 'Oběd', lunchTitle),
    mealRow(MEAL_TIME_META.dinner, 'Večeře', dinnerTitle),
    snackTitle ? mealRow(MEAL_TIME_META.snack, 'Svačina', snackTitle) : '',
  ].filter(Boolean).join('');

  const headerRow =
    `<tr><td bgcolor="${COL.HEADER_BG_FALLBACK}" style="background-color:${COL.HEADER_BG_FALLBACK};background-image:linear-gradient(135deg,${COL.HEADER_START} 0%,${COL.HEADER_END} 100%);border-radius:12px 12px 0 0;padding:12px 20px;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="top">` +
    `<div style="font-family:${FONT_BODY};font-size:11px;color:rgba(255,255,255,0.9);letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:2px;">${escapeHtml(ordinalLabel)}</div>` +
    `<div class="day-compact-mobile" style="font-family:${FONT_BODY};font-size:18px;color:#FFFFFF;font-weight:700;letter-spacing:-0.3px;line-height:1.15;">${escapeHtml(dayName)}` +
    ` <span style="font-size:13px;color:rgba(255,255,255,0.85);font-weight:500;"> · ${escapeHtml(dateShort)}</span></div>` +
    `</td>` +
    `<td align="right" valign="middle">` +
    `<a href="${escapeHtml(dayUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:rgba(255,255,255,0.15);border-radius:999px;padding:6px 12px;font-family:${FONT_BODY};font-size:11px;color:#FFFFFF;font-weight:600;letter-spacing:0.5px;text-decoration:none;text-transform:uppercase;">Otevřít →</a>` +
    `</td></tr></table></td></tr>`;

  const bodyRow =
    `<tr><td bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};padding:16px 20px;border-radius:0 0 12px 12px;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" border="0">${mealRowsHtml}</table>` +
    `<div style="font-family:${FONT_BODY};font-size:12px;color:${COL.TEXT_MUTED};line-height:1.6;padding-top:10px;margin-top:8px;border-top:1px solid rgba(14,165,233,0.12);">` +
    `<strong style="color:${workoutInfo.color};font-weight:600;">▲ Pohyb:</strong> ${workoutInfo.text}</div></td></tr>`;

  return (
    `<tr><td class="mobile-pad" bgcolor="${COL.PAGE_BG}" style="background-color:${COL.PAGE_BG};padding:0 16px 8px 16px;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COL.CARD_BG}" style="background-color:${COL.CARD_BG};border:1px solid rgba(14,165,233,0.18);border-radius:12px;border-collapse:separate !important;">` +
    `${headerRow}${bodyRow}</table></td></tr>`
  );
}

/**
 * @param {object} options
 * @param {object} options.structuredPlanJson
 * @param {object} [options.bodyMetrics]
 * @param {string} [options.firstName]
 * @param {boolean} [options.planChangeContext]
 * @param {string} [options.appBaseUrl]
 * @param {string} [options.ctaUrl]
 * @param {string} [options.webViewUrl] explicit URL for "View in browser" link; defaults to ${appBaseUrl}/plan/${planId}
 * @param {string} [options.planId]
 * @param {string} [options.validFrom]
 */
export function buildWeeklyPlanEmailV8Document(options = {}) {
  const planJson = options.structuredPlanJson;
  const sourceDays = Array.isArray(planJson?.days) ? planJson.days : [];
  const targets = planJson?.targets ?? {};
  const bm = options.bodyMetrics && typeof options.bodyMetrics === 'object' ? options.bodyMetrics : {};
  const appBaseUrl = String(options.appBaseUrl || getPublicAppUrl() || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const ctaUrl = String(options.ctaUrl || getPlanEmailCtaUrl()).replace(/\/$/, '');
  const planIdStr = options.planId ? String(options.planId).trim() : '';
  const webViewUrl = options.webViewUrl
    ? String(options.webViewUrl).replace(/\/$/, '')
    : planIdStr
      ? `${appBaseUrl}/plan/${encodeURIComponent(planIdStr)}`
      : appBaseUrl;

  const rawFirstName = String(options.firstName || bm?.name || '').trim().split(/\s+/)[0] || '';
  const vocativeName = rawFirstName ? toCzechVocative(rawFirstName) : 'ty';

  const validFrom =
    String(options.validFrom || planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10) ||
    (typeof sourceDays[0]?.date === 'string' ? sourceDays[0].date.replace(/T.*/, '').slice(0, 10) : '');
  const yearStr = validFrom ? validFrom.slice(0, 4) : String(new Date().getFullYear());
  const weekNumber = isoWeekNumber(validFrom) ?? 1;
  const weekLabel = `TÝDEN ${weekNumber} · ${yearStr}`;

  const todayIso = calendarDateIsoInPrague(new Date());
  const isFuturePlan = validFrom ? validFrom > todayIso : false;
  const weekSource = buildStructuredWeekSource({
    parsedDays: [],
    structuredPlan: planJson ?? null,
    validFrom,
    validUntil: planJson?.valid_until || options?.validUntil || '',
    todayIsoStr: todayIso,
    isFuturePlan,
    planHtml: planJson?.html || '',
    buildMealsFromStructuredDay: (d) => (Array.isArray(d?.meals) ? d.meals : []),
  });
  const days = (weekSource.planWeekDays || []).map((d) => {
    if (d?.structDay && typeof d.structDay === 'object') {
      return d.structDay;
    }
    return {
      day_name: d?.dayName || `Den ${(d?.originalIndex ?? 0) + 1}`,
      date: validFrom ? addCalendarDaysIsoPrague(validFrom, d?.originalIndex ?? 0) : '',
      meals: [],
      workout: null,
      _placeholder: true,
    };
  });
  const todayWeekIdx = Number.isFinite(weekSource.todayWeekIdx) && weekSource.todayWeekIdx >= 0
    ? weekSource.todayWeekIdx
    : 0;

  const coachVoice = loadCoachVoice();
  const goal = bm?.goal || planJson?.goal;

  const coachIntro = getCoachIntro(goal, coachVoice);
  const macroCommentary = getMacroCommentary(goal, coachVoice);
  const kcalLeadIn = getKcalLeadIn(goal, coachVoice);

  const targetKcal = Math.round(Number(targets.calories_per_day) || 0) || null;
  const targetKcalDisplay = targetKcal != null ? fmtKcal(targetKcal) : '—';
  const targetsForMacros = {
    protein_g: targets?.protein_g,
    carbs_g: targets?.carbs_g,
    fat_g: targets?.fat_g,
  };

  const macrosHtml = renderMacrosBlock(targetsForMacros, macroCommentary);

  // Den 1 detailně, dny 2–7 kompaktně — kratší e-mail, plný detail v aplikaci.
  const dayTodayHtml = days.length
    ? renderDayFull(days[todayWeekIdx], todayWeekIdx, days.length, planJson, appBaseUrl, coachVoice, validFrom)
    : '';
  const daysRestHtml = days.length > 1
    ? days
      .map((day, idx) => ({ day, idx }))
      .filter(({ idx }) => idx !== todayWeekIdx)
      .map(({ day, idx }) => renderDayCompact(day, idx, planJson, appBaseUrl, coachVoice, validFrom))
      .join('')
    : '';

  const profileExtraHtml = '';

  const heroCtaHtml = renderBulletproofButton(ctaUrl, 'Otevřít můj profil');
  const footerCtaHtml = renderFooterCtaBlock({ ctaUrl, webViewUrl, appBaseUrl });

  const mealsCount = days.reduce((sum, day) => sum + (Array.isArray(day?.meals) ? day.meals.length : 0), 0);
  const workoutsCount = (() => {
    if (Number.isFinite(Number(planJson?.workouts_per_week))) return Number(planJson.workouts_per_week);
    let count = 0;
    for (const day of days) {
      const w = day?.workout || {};
      const ex = Array.isArray(w?.exercises) ? w.exercises : Array.isArray(day?.exercises) ? day.exercises : [];
      if (ex.length) count += 1;
    }
    return count;
  })();

  let html = loadTemplate();
  html = html.replace('<!--BMON_MACROS-->', macrosHtml);
  html = html.replace('<!--BMON_PROFILE_EXTRA-->', profileExtraHtml);
  html = html.replace('<!--BMON_DAY_TODAY-->', dayTodayHtml);
  html = html.replace('<!--BMON_DAYS_REST-->', daysRestHtml);
  html = html.replace('<!--BMON_HERO_CTA-->', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr><td align="center">${heroCtaHtml}</td></tr></table>`);
  html = html.replace('<!--BMON_FOOTER_CTA-->', footerCtaHtml);

  const filledHtml = applyVars(html, {
    week_label: escapeHtml(weekLabel),
    user_vocative: escapeHtml(vocativeName),
    coach_intro: escapeHtml(coachIntro),
    stat_days: String(days.length || 7),
    stat_meals: String(mealsCount || days.length * 3),
    stat_workouts: String(workoutsCount),
    cta_url: escapeHtml(ctaUrl),
    web_view_url: escapeHtml(webViewUrl),
    height_cm: escapeHtml(String(bm?.height_cm ?? '—')),
    weight_kg: escapeHtml(String(bm?.weight_kg ?? '—')),
    goal_text: escapeHtml(goalTextHtml(goal)),
    target_kcal: escapeHtml(targetKcalDisplay),
    kcal_description: escapeHtml(kcalLeadIn),
    coach_signature_body: escapeHtml(coachVoice?.coach_signature?.body || 'Plán máš v aplikaci — jídla, makra i trénink na každý den.'),
    coach_signature_name: escapeHtml(coachVoice?.coach_signature?.name || '— Tvůj kouč'),
    footer_year: escapeHtml(yearStr),
    preheader: escapeHtml(`Tvůj plán je připraven, ${vocativeName}. Otevři aplikaci a začni první den.`),
    hero_headline: escapeHtml('Tvůj plán je připravený'),
    hero_subline: escapeHtml('Plán máš uložený v profilu. V e-mailu najdeš rychlý přehled.'),
    medical_disclaimer: escapeHtml('Plán je orientační a nenahrazuje doporučení lékaře nebo nutričního specialisty. Pokud máš zdravotní omezení, konzultuj změny s odborníkem.'),
  });

  return minifyHtml(filledHtml);
}

export default buildWeeklyPlanEmailV8Document;
