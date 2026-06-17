import { readFileSync } from 'fs';
import { join } from 'path';
import { escapeHtml } from './emailTemplates.js';
import { mealDisplayTitleForStructuredMeal } from './mealDisplayNameHelpers.js';
import { addCalendarDaysIsoPrague } from './czechCalendar.js';
import { getPublicAppUrl } from './siteUrls.js';
import { recipeFromCatalogApiUrl, catalogLookupIdFromMeal } from './recipeDetailUrl.js';
import { toCzechVocative } from './utils/czechVocative.js';
import { formatDayDateWords, formatDayDateNumeric, dayOrdinalCs } from './utils/czechDateWords.js';

// v6 hybrid email: pre-rendered PNG banners (hero / motto / day-header / cta) carry
// the visual identity. Surrounding HTML stays strictly bulletproof — no CSS
// gradients, no text-shadow, no background-clip:text, no transforms, only solid
// colours, bgcolor attributes on every <td>, and tables with cellpadding/spacing/border.

const FONT_BODY = `'Geist',Arial,sans-serif`;
const FONT_MONO = `'Geist Mono',monospace`;

const MEAL_TYPE_LABELS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

const MEAL_TIME_META = {
  breakfast: { icon: '☼', time_word: 'RÁNO', time: '07:30', color: '#F59E0B' },
  lunch: { icon: '◐', time_word: 'POLEDNE', time: '13:00', color: '#A855F7' },
  dinner: { icon: '☾', time_word: 'VEČER', time: '19:00', color: '#EC4899' },
  snack: { icon: '◇', time_word: 'ODPOLEDNE', time: '16:00', color: '#F59E0B' },
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
  const path = join(process.cwd(), 'lib', 'templates', 'bmon_weekly_plan_email_v6.html');
  cachedTemplate = readFileSync(path, 'utf8');
  return cachedTemplate;
}

function loadCoachVoice() {
  if (cachedCoachVoice) return cachedCoachVoice;
  // v6 reuses the v5 coach voice content (mottos, intros, kcal lead-ins, signatures).
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

function isSafeExternalUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed);
}

function mealRecipeUrl(meal, appBaseUrl) {
  const lookupId = catalogLookupIdFromMeal(meal);
  if (lookupId != null) {
    return recipeFromCatalogApiUrl(lookupId, appBaseUrl, { format: 'html' });
  }
  const r = meal?.recipe;
  const direct = r?.sourceUrl || r?.source_url || r?.url || null;
  if (isSafeExternalUrl(direct)) return String(direct).trim();
  return '';
}

function toMacroNumber(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function mealMacros(meal) {
  const r = meal?.recipe;
  if (!r || meal?.recipe_verified !== true) {
    return { protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, calories: null };
  }
  return {
    protein_g: toMacroNumber(r.protein_g),
    carbs_g: toMacroNumber(r.carbs_g),
    fat_g: toMacroNumber(r.fat_g),
    fiber_g: toMacroNumber(r.fiber_g),
    calories: toMacroNumber(r.calories),
  };
}

function fmtMacro(value) {
  if (value == null) return `<span style="color:#7A6C99;font-weight:400;">—</span>`;
  return `${value}<span style="font-size:10px;color:#9F8FC0;font-weight:400;letter-spacing:0;"> g</span>`;
}

function fmtTargetMacro(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return `<span style="color:#7A6C99;font-weight:400;">—</span>`;
  }
  return `${Math.round(Number(value))}<span style="font-size:13px;color:#9F8FC0;font-weight:400;"> g</span>`;
}

function fmtInlineMacro(value, color) {
  if (value == null) return `<span style="color:#7A6C99;font-weight:600;">—</span>`;
  return `<strong style="color:${color};font-weight:700;">${value} g</strong>`;
}

// compact inline macro: P 35 g, used in meal cards to keep card under ~1.5 KB each
function fmtMacroInline(value, color) {
  if (value == null) return `<span style="color:#7A6C99">—</span>`;
  return `<strong style="color:${color};font-weight:700">${value}<span style="color:#9F8FC0;font-weight:400">g</span></strong>`;
}

function fmtKcal(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return String(Math.round(Number(value)));
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
    { label: 'BÍLKOVINY', value: targets?.protein_g, comment: commentary.protein || '', color: '#A855F7' },
    { label: 'SACHARIDY', value: targets?.carbs_g, comment: commentary.carbs || '', color: '#EC4899' },
    { label: 'TUKY', value: targets?.fat_g, comment: commentary.fat || '', color: '#F59E0B' },
  ];
  return rows
    .map((row) => {
      const valueHtml = fmtTargetMacro(row.value);
      const commentHtml = row.comment
        ? `<td align="right" valign="middle" class="commentary-mobile" style="font-family:${FONT_BODY};font-size:12px;color:#9F8FC0;font-weight:400;line-height:1.55;max-width:240px;padding-left:12px;">${escapeHtml(row.comment)}</td>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;"><tr><td bgcolor="#15101F" style="background-color:#15101F;border-left:3px solid ${row.color};padding:16px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><div class="mono" style="font-family:${FONT_MONO};font-size:10px;color:${row.color};letter-spacing:1.5px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">${escapeHtml(row.label)}</div><div class="macro-mobile" style="font-family:${FONT_BODY};font-size:22px;color:#F0EBFF;font-weight:700;line-height:1;letter-spacing:-0.4px;">${valueHtml}</div></td>${commentHtml}</tr></table></td></tr></table>`;
    })
    .join('');
}

function renderHabits(habits) {
  if (!Array.isArray(habits) || habits.length === 0) return '';
  const accents = ['#A855F7', '#EC4899', '#F59E0B'];
  return habits
    .map((habit, idx) => {
      const title = typeof habit === 'string' ? habit : habit?.title || habit?.text || '';
      const description = typeof habit === 'string' ? '' : habit?.description || habit?.detail || '';
      if (!title) return '';
      const color = accents[idx % accents.length];
      const num = String(idx + 1).padStart(2, '0');
      const mb = idx === habits.length - 1 ? '' : 'margin-bottom:10px;';
      const descriptionHtml = description
        ? `<div style="font-family:${FONT_BODY};font-size:12px;color:#9F8FC0;line-height:1.55;">${escapeHtml(description)}</div>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${mb}"><tr><td width="56" bgcolor="${color}" align="center" valign="middle" style="background-color:${color};padding:18px 0;"><div style="font-family:${FONT_BODY};font-size:20px;color:#F8F4FF;font-weight:700;letter-spacing:-0.4px;">${num}</div></td><td bgcolor="#15101F" valign="top" style="background-color:#15101F;padding:16px 20px;"><div style="font-family:${FONT_BODY};font-size:15px;color:#F0EBFF;font-weight:600;line-height:1.3;letter-spacing:-0.2px;margin-bottom:4px;">${escapeHtml(title)}</div>${descriptionHtml}</td></tr></table>`;
    })
    .filter(Boolean)
    .join('');
}

function extractHabits(planJson) {
  const candidates = [planJson?.habits, planJson?.mindset_week, planJson?.mindset];
  for (const item of candidates) {
    if (Array.isArray(item) && item.length) {
      return item
        .map((row) => {
          if (typeof row === 'string') return { title: row, description: '' };
          if (row && typeof row === 'object') {
            return {
              title: String(row.title || row.text || row.name || '').trim(),
              description: String(row.description || row.detail || row.text_long || '').trim(),
            };
          }
          return null;
        })
        .filter((row) => row && row.title)
        .slice(0, 3);
    }
  }
  return [
    { title: 'Drž se plánu.', description: 'Když nebudeš vědět, co dělat, podívej se sem. Cokoliv je tady, je správně.' },
    { title: 'Odpočívej mezi tréninky.', description: 'Svaly nerostou v posilovně. Rostou, když spíš. Dej tělu prostor.' },
    { title: 'Dodržuj pitný režim.', description: 'Tři litry vody. Bez kompromisu. Tělo to potřebuje.' },
  ];
}

function renderMealCard(meal, day, planJson, appBaseUrl) {
  const type = meal?.type ?? 'breakfast';
  const timeMeta = MEAL_TIME_META[type] || MEAL_TIME_META.breakfast;
  const label = MEAL_TYPE_LABELS[type] || type;
  const dayName = day?.day_name ?? day?.date ?? 'Den';
  const title = mealDisplayTitleForStructuredMeal(meal, planJson?.html || '', dayName);
  const recipeUrl = mealRecipeUrl(meal, appBaseUrl);
  const macros = mealMacros(meal);
  const accent = timeMeta.color;

  const recipeButton = recipeUrl
    ? `<a href="${escapeHtml(recipeUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:7px 14px;background-color:${accent};font-family:${FONT_MONO};font-size:10px;color:#F8F4FF;letter-spacing:1px;font-weight:700;text-decoration:none">RECEPT →</a>`
    : '';

  const macroLine = `P ${fmtMacroInline(macros.protein_g, '#A855F7')} · S ${fmtMacroInline(macros.carbs_g, '#EC4899')} · T ${fmtMacroInline(macros.fat_g, '#F59E0B')} · V ${fmtMacroInline(macros.fiber_g, '#10B981')}`;

  return `<tr><td class="px-mobile" bgcolor="#0A0815" style="background-color:#0A0815;padding:8px 32px 0 32px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#15101F" style="background-color:#15101F;border-left:3px solid ${accent};padding:16px 18px"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px"><tr><td valign="middle" style="font-family:${FONT_MONO};font-size:10px;color:${accent};letter-spacing:1.3px;font-weight:600">${timeMeta.icon}&nbsp;${escapeHtml(timeMeta.time_word)} · ${escapeHtml(timeMeta.time)}</td><td align="right" valign="middle">${recipeButton}</td></tr></table><div style="font-family:${FONT_BODY};font-size:16px;color:#F0EBFF;font-weight:700;line-height:1.25;letter-spacing:-0.3px;margin-bottom:10px">${escapeHtml(title || label)}</div><div style="font-family:${FONT_BODY};font-size:12px;color:#C4B5E0;line-height:1.5">${macroLine}</div></td></tr></table></td></tr>`;
}

function renderDailyTotal(day) {
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  const macroList = meals.map((meal) => mealMacros(meal));
  const sumMacro = (key) => {
    if (macroList.length === 0) return null;
    let total = 0;
    for (const m of macroList) {
      if (m[key] == null) return null;
      total += m[key];
    }
    return total;
  };
  const dailyKcal = sumMacro('calories');
  const dailyProtein = sumMacro('protein_g');
  const dailyCarbs = sumMacro('carbs_g');
  const dailyFat = sumMacro('fat_g');
  const dailyFiber = sumMacro('fiber_g');
  const kcalDisplay = dailyKcal != null ? String(dailyKcal) : '<span style="color:#7A6C99">—</span>';

  return `<tr><td class="px-mobile" bgcolor="#0A0815" style="background-color:#0A0815;padding:8px 32px 0 32px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1A0F2E" style="background-color:#1A0F2E;padding:18px 22px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><div class="mono" style="font-family:${FONT_MONO};font-size:10px;color:#A855F7;letter-spacing:2px;font-weight:600;text-transform:uppercase;">CELKEM ZA DEN</div></td><td align="right" valign="middle" style="font-family:${FONT_BODY};font-size:26px;color:#F0EBFF;font-weight:800;letter-spacing:-0.8px;line-height:1;">${kcalDisplay} <span class="mono" style="font-family:${FONT_MONO};font-size:12px;color:#C4B5E0;letter-spacing:1.5px;font-weight:500;">KCAL</span></td></tr></table><div style="margin-top:12px;font-family:${FONT_BODY};font-size:12px;color:#C4B5E0;line-height:1.6;">Bílkoviny ${fmtInlineMacro(dailyProtein, '#A855F7')} · Sacharidy ${fmtInlineMacro(dailyCarbs, '#EC4899')} · Tuky ${fmtInlineMacro(dailyFat, '#F59E0B')} · Vláknina ${fmtInlineMacro(dailyFiber, '#10B981')}</div></td></tr></table></td></tr>`;
}

function renderWorkout(day, coachVoice, appBaseUrl) {
  const workout = day?.workout || {};
  const exercises = Array.isArray(workout?.exercises)
    ? workout.exercises
    : Array.isArray(day?.exercises)
      ? day.exercises
      : [];

  if (!exercises.length) {
    const restCopy = getWorkoutCopy('rest', coachVoice);
    return `<tr><td class="px-mobile" bgcolor="#0A0815" style="background-color:#0A0815;padding:8px 32px 0 32px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1A0B33" style="background-color:#1A0B33;border-left:3px solid #A855F7;padding:20px 24px;"><div class="mono" style="font-family:${FONT_MONO};font-size:10px;color:#A855F7;letter-spacing:2px;font-weight:600;text-transform:uppercase;margin-bottom:10px;">▲ POHYB</div><div style="font-family:${FONT_BODY};font-size:18px;color:#F0EBFF;font-weight:700;letter-spacing:-0.3px;line-height:1.25;margin-bottom:8px;">${escapeHtml(restCopy.intro)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:#9F8FC0;font-weight:400;line-height:1.55;">${escapeHtml(restCopy.description)}</div></td></tr></table></td></tr>`;
  }

  const intensity = inferWorkoutIntensity(workout, day);
  const copy = getWorkoutCopy(intensity, coachVoice);
  let blockBg;
  let borderColor;
  if (intensity === 'easy') { blockBg = '#0F2A1D'; borderColor = '#22C55E'; }
  else if (intensity === 'hard') { blockBg = '#2B0F15'; borderColor = '#EF4444'; }
  else { blockBg = '#1A0B33'; borderColor = '#A855F7'; }

  const exerciseRows = exercises
    .map((ex, idx) => {
      const name = String(ex?.name || ex?.exercise_name || 'Cvik');
      const sets = ex?.sets != null ? String(ex.sets) : '—';
      const reps = ex?.reps != null ? String(ex.reps) : '—';
      const repsUnit = ex?.duration_seconds
        ? `${ex.sets ?? '—'} × ${ex.duration_seconds} s`
        : `${sets} × ${reps}`;
      const num = String(idx + 1).padStart(2, '0');
      const borderBottom = idx === exercises.length - 1 ? '' : 'border-bottom:1px solid #2A1F3D;';
      return `<tr><td style="padding:12px 16px;${borderBottom}"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" valign="middle" class="mono" style="font-family:${FONT_MONO};font-size:11px;color:#9F8FC0;font-weight:600;letter-spacing:0.5px;">${num}</td><td valign="middle" style="font-family:${FONT_BODY};font-size:14px;color:#F0EBFF;font-weight:600;letter-spacing:-0.2px;">${escapeHtml(name)}</td><td align="right" valign="middle" class="mono" style="font-family:${FONT_MONO};font-size:13px;color:${borderColor};font-weight:600;letter-spacing:0.5px;">${escapeHtml(repsUnit)}</td></tr></table></td></tr>`;
    })
    .join('');

  return `<tr><td class="px-mobile" bgcolor="#0A0815" style="background-color:#0A0815;padding:8px 32px 0 32px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${blockBg}" style="background-color:${blockBg};border-left:3px solid ${borderColor};padding:20px 24px;"><div class="mono" style="font-family:${FONT_MONO};font-size:10px;color:${borderColor};letter-spacing:2px;font-weight:600;text-transform:uppercase;margin-bottom:10px;">▲ POHYB</div><div style="font-family:${FONT_BODY};font-size:18px;color:#F0EBFF;font-weight:700;letter-spacing:-0.3px;line-height:1.25;margin-bottom:6px;">${escapeHtml(copy.intro)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:#9F8FC0;font-weight:400;line-height:1.55;margin-bottom:14px;">${escapeHtml(copy.description)}</div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0F0B1A" style="background-color:#0F0B1A;border:1px solid #2A1F3D;">${exerciseRows}</table><div style="margin-top:12px;font-family:${FONT_BODY};font-size:12px;color:#9F8FC0;line-height:1.55;">Videa s technikou v <a href="${escapeHtml(appBaseUrl)}" target="_blank" rel="noopener noreferrer" style="color:${borderColor};text-decoration:underline;font-weight:600;">aplikaci</a>.</div></td></tr></table></td></tr>`;
}

function renderDayCard(day, index, totalDays, planJson, appBaseUrl, dayHeaderImageUrl, coachVoice) {
  const dayIndexPad = String(index + 1).padStart(2, '0');
  const totalPad = String(totalDays).padStart(2, '0');
  const dayName = day?.day_name || `Den ${index + 1}`;
  const rawDate = typeof day?.date === 'string' ? day.date.replace(/T.*/, '').slice(0, 10) : '';
  const validFrom = String(planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : /^\d{4}-\d{2}-\d{2}$/.test(validFrom)
      ? addCalendarDaysIsoPrague(validFrom, index)
      : '';
  const dateWords = formatDayDateWords(iso) || formatDayDateNumeric(iso) || '';
  const yearStr = iso ? iso.slice(0, 4) : '';
  const dateDisplay = dateWords && yearStr
    ? `${dateWords.charAt(0).toUpperCase()}${dateWords.slice(1)} ${yearStr}`
    : dateWords;
  const ordinal = dayOrdinalCs(index + 1).toUpperCase();
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  const mealsHtml = meals.map((meal) => renderMealCard(meal, day, planJson, appBaseUrl)).join('');
  const dailyTotalHtml = renderDailyTotal(day);
  const workoutHtml = renderWorkout(day, coachVoice, appBaseUrl);

  // Day header: PNG banner + bulletproof day name + date underneath
  const headerImg = `<tr><td bgcolor="#0A0815" style="background-color:#0A0815;padding:24px 32px 0 32px;font-size:0;line-height:0;"><img src="${escapeHtml(dayHeaderImageUrl)}" alt="${escapeHtml(`Den ${index + 1}`)}" width="536" height="112" class="img-responsive" style="display:block;width:100%;max-width:536px;height:auto;border:0;outline:none;"></td></tr>`;
  const headerText = `<tr><td class="px-mobile" bgcolor="#0A0815" style="background-color:#0A0815;padding:0 32px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#15101F" style="background-color:#15101F;padding:16px 20px;"><div class="mono" style="font-family:${FONT_MONO};font-size:10px;color:#A855F7;letter-spacing:1.5px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">DEN ${dayIndexPad}/${totalPad} · ${escapeHtml(ordinal)}</div><div style="font-family:${FONT_BODY};font-size:20px;color:#F0EBFF;font-weight:700;letter-spacing:-0.3px;line-height:1.1;">${escapeHtml(dayName)}</div><div style="font-family:${FONT_BODY};font-size:12px;color:#9F8FC0;margin-top:4px;line-height:1.5;">${escapeHtml(dateDisplay)}</div></td></tr></table></td></tr>`;

  return `${headerImg}${headerText}${mealsHtml}${dailyTotalHtml}${workoutHtml}`;
}

/**
 * @param {object} options
 * @param {object} options.structuredPlanJson
 * @param {object} [options.bodyMetrics]
 * @param {string} [options.firstName]
 * @param {boolean} [options.planChangeContext]
 * @param {string} [options.appBaseUrl]
 * @param {string} [options.ctaUrl]
 * @param {string} [options.validFrom]
 */
export function buildWeeklyPlanEmailV6Document(options = {}) {
  const planJson = options.structuredPlanJson;
  const days = Array.isArray(planJson?.days) ? planJson.days : [];
  const targets = planJson?.targets ?? {};
  const bm = options.bodyMetrics && typeof options.bodyMetrics === 'object' ? options.bodyMetrics : {};
  const appBaseUrl = String(options.appBaseUrl || getPublicAppUrl() || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const ctaUrl = String(options.ctaUrl || appBaseUrl).replace(/\/$/, '');

  // PNG assets host: prefer NEXT_PUBLIC_BASE_URL, fall back to canonical app domain.
  // Email clients fetch images via absolute URL; this MUST be a public origin.
  const assetBase = String(
    options.assetBaseUrl
      || process.env.NEXT_PUBLIC_BASE_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || 'https://app.bodyandmindon.cz'
  ).replace(/\/$/, '');
  const HERO_IMAGE_URL = `${assetBase}/email-assets/v6/hero.jpg`;
  const MOTTO_IMAGE_URL = `${assetBase}/email-assets/v6/motto.jpg`;
  const DAY_HEADER_IMAGE_URL = `${assetBase}/email-assets/v6/day-header.jpg`;
  const CTA_IMAGE_URL = `${assetBase}/email-assets/v6/cta.jpg`;

  const rawFirstName = String(options.firstName || bm?.name || '').trim().split(/\s+/)[0] || '';
  const vocativeName = rawFirstName ? toCzechVocative(rawFirstName) : 'ty';

  const validFrom =
    String(options.validFrom || planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10) ||
    (typeof days[0]?.date === 'string' ? days[0].date.replace(/T.*/, '').slice(0, 10) : '');
  const yearStr = validFrom ? validFrom.slice(0, 4) : String(new Date().getFullYear());
  const weekNumber = isoWeekNumber(validFrom) ?? 1;
  const weekLabel = `TÝDEN ${weekNumber} · ${yearStr}`;

  const coachVoice = loadCoachVoice();
  const goal = bm?.goal || planJson?.goal;

  const motto = getMottoForWeek(weekNumber, coachVoice);
  const mottoLines = splitMottoIntoLines(motto.text);
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

  const habitsList = extractHabits(planJson);
  const habitsHtml = renderHabits(habitsList);
  const macrosHtml = renderMacrosBlock(targetsForMacros, macroCommentary);
  const daysHtml = days
    .map((day, idx) => renderDayCard(day, idx, days.length, planJson, appBaseUrl, DAY_HEADER_IMAGE_URL, coachVoice))
    .join('');

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
  html = html.replace('<!--BMON_HABITS-->', habitsHtml);
  html = html.replace('<!--BMON_DAYS-->', daysHtml);

  const filledHtml = applyVars(html, {
    HERO_IMAGE_URL: escapeHtml(HERO_IMAGE_URL),
    MOTTO_IMAGE_URL: escapeHtml(MOTTO_IMAGE_URL),
    CTA_IMAGE_URL: escapeHtml(CTA_IMAGE_URL),
    week_label: escapeHtml(weekLabel),
    user_vocative: escapeHtml(vocativeName),
    coach_intro: escapeHtml(coachIntro),
    stat_days: String(days.length || 7),
    stat_meals: String(mealsCount || days.length * 3),
    stat_workouts: String(workoutsCount),
    cta_url: escapeHtml(ctaUrl),
    height_cm: escapeHtml(String(bm?.height_cm ?? '—')),
    weight_kg: escapeHtml(String(bm?.weight_kg ?? '—')),
    goal_text: escapeHtml(goalTextHtml(goal)),
    target_kcal: escapeHtml(targetKcalDisplay),
    kcal_description: escapeHtml(kcalLeadIn),
    weekly_motto_line1: escapeHtml(mottoLines.line1),
    weekly_motto_line2: escapeHtml(mottoLines.line2),
    coach_signature_body: escapeHtml(coachVoice?.coach_signature?.body || 'Drž se. Když budeš mít otázky, napiš mi. Vidíme se za týden.'),
    coach_signature_name: escapeHtml(coachVoice?.coach_signature?.name || '— Tvůj kouč'),
    footer_year: escapeHtml(yearStr),
    preheader: escapeHtml(`Tvůj týdenní plán je tady, ${vocativeName}. Sedm dní. Začínáme.`),
  });

  return minifyHtml(filledHtml);
}

export default buildWeeklyPlanEmailV6Document;
