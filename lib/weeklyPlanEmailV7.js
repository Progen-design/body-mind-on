import { readFileSync } from 'fs';
import { join } from 'path';
import { escapeHtml } from './emailTemplates.js';
import { mealDisplayTitleForStructuredMeal } from './mealDisplayNameHelpers.js';
import { addCalendarDaysIsoPrague } from './czechCalendar.js';
import { getPublicAppUrl } from './siteUrls.js';
import { toCzechVocative } from './utils/czechVocative.js';
import { formatDayDateWords, formatDayDateNumeric, dayOrdinalCs, ordinalNominative } from './utils/czechDateWords.js';

// v7 dark rounded modern: pure HTML, no PNG assets, Inter font with full Czech diacritics.
// Day 1 rendered as full card (meals + macros + workout); days 2-7 compact one-liner cards.
// Rounded shapes everywhere (16px/12px/10px/8px/999px) — Outlook desktop downgrades to
// square corners but that is the accepted trade-off (Gmail / Apple Mail / iOS / Android = 90%+).

const FONT_BODY = `'Inter','-apple-system','BlinkMacSystemFont','Segoe UI','Roboto','Arial',sans-serif`;
const FONT_MONO = `'JetBrains Mono','Menlo','Courier New',monospace`;

const MEAL_TYPE_LABELS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

const MEAL_TIME_META = {
  breakfast: { icon: '☀', time_word: 'RÁNO', time: '07:30', color: '#F59E0B' },
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
  const path = join(process.cwd(), 'lib', 'templates', 'bmon_weekly_plan_email_v7.html');
  cachedTemplate = readFileSync(path, 'utf8');
  return cachedTemplate;
}

function loadCoachVoice() {
  if (cachedCoachVoice) return cachedCoachVoice;
  // v7 reuses the v5 coach voice content (mottos, intros, kcal lead-ins, signatures, macro commentary).
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
  const r = meal?.recipe;
  const recipeId = r?.id ?? meal?.recipe_id ?? null;
  const ridNum = recipeId != null && Number.isFinite(Number(recipeId)) ? Number(recipeId) : null;
  if (ridNum != null) {
    return `${appBaseUrl}/api/spoonacular-recipe?id=${ridNum}&format=html`;
  }
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

function fmtTargetMacro(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return `<span style="color:#7A6C99;font-weight:400">—</span>`;
  }
  return `${Math.round(Number(value))}<span style="font-size:12px;color:#9F8FC0;font-weight:400"> g</span>`;
}

function fmtMacroInline(value, color) {
  if (value == null) return `<span style="color:#7A6C99;font-weight:600">—</span>`;
  return `<strong style="color:${color};font-weight:700">${value} g</strong>`;
}

function fmtKcal(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const v = Math.round(Number(value));
  // Czech thousands separator with non-breaking space
  return v.toLocaleString('cs-CZ').replace(/\s/g, '\u00A0');
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
        ? `<td align="right" valign="middle" style="font-family:${FONT_BODY};font-size:12px;color:#9F8FC0;font-weight:400;line-height:1.55;padding-left:12px;max-width:220px;">${escapeHtml(row.comment)}</td>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1428" style="background-color:#1A1428;border:1px solid rgba(168,85,247,0.2);border-left:3px solid ${row.color};border-radius:10px;border-collapse:separate !important;margin-top:8px;"><tr><td bgcolor="#1A1428" style="background-color:#1A1428;padding:16px 20px;border-radius:10px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><div style="font-family:${FONT_BODY};font-size:11px;color:${row.color};letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">${escapeHtml(row.label)}</div><div style="font-family:${FONT_BODY};font-size:20px;color:#F0EBFF;font-weight:700;letter-spacing:-0.3px;line-height:1;">${valueHtml}</div></td>${commentHtml}</tr></table></td></tr></table>`;
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
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1428" style="background-color:#1A1428;border:1px solid rgba(168,85,247,0.2);border-radius:10px;border-collapse:separate !important;${mb}"><tr><td width="56" bgcolor="${color}" align="center" valign="middle" style="background-color:${color};border-radius:10px 0 0 10px;padding:16px 0;font-family:${FONT_BODY};font-size:20px;color:#FFFFFF;font-weight:700;letter-spacing:-0.3px;">${num}</td><td bgcolor="#1A1428" valign="middle" style="background-color:#1A1428;padding:14px 18px;border-radius:0 10px 10px 0;"><div style="font-family:${FONT_BODY};font-size:15px;color:#F0EBFF;font-weight:600;line-height:1.3;letter-spacing:-0.2px;margin-bottom:4px;">${escapeHtml(title)}</div>${descriptionHtml}</td></tr></table>`;
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
  const title = mealDisplayTitleForStructuredMeal(meal, planJson?.html || '', dayName);
  const recipeUrl = mealRecipeUrl(meal, appBaseUrl);
  const macros = mealMacros(meal);
  const accent = timeMeta.color;

  // Convert hex to rgba-friendly border color
  const accentRgba = accent === '#F59E0B'
    ? 'rgba(245,158,11,0.25)'
    : accent === '#A855F7'
      ? 'rgba(168,85,247,0.25)'
      : accent === '#EC4899'
        ? 'rgba(236,72,153,0.25)'
        : 'rgba(168,85,247,0.25)';
  const accentBg = accent === '#F59E0B'
    ? 'rgba(245,158,11,0.15)'
    : accent === '#A855F7'
      ? 'rgba(168,85,247,0.15)'
      : accent === '#EC4899'
        ? 'rgba(236,72,153,0.15)'
        : 'rgba(168,85,247,0.15)';
  const accentBorder = accent === '#F59E0B'
    ? 'rgba(245,158,11,0.4)'
    : accent === '#A855F7'
      ? 'rgba(168,85,247,0.4)'
      : accent === '#EC4899'
        ? 'rgba(236,72,153,0.4)'
        : 'rgba(168,85,247,0.4)';

  const recipeButton = recipeUrl
    ? `<a href="${escapeHtml(recipeUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:${accentBg};border:1px solid ${accentBorder};border-radius:999px;padding:5px 12px;font-family:${FONT_BODY};font-size:11px;color:${accent};letter-spacing:0.5px;font-weight:600;text-decoration:none;text-transform:uppercase;">Recept →</a>`
    : '';

  const macroLine = `${fmtMacroInline(macros.protein_g, '#A855F7')} bílkovin · ${fmtMacroInline(macros.carbs_g, '#F59E0B')} sacharidů · ${fmtMacroInline(macros.fat_g, '#EC4899')} tuků · ${fmtMacroInline(macros.fiber_g, '#10B981')} vlákniny`;

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1428" style="background-color:#1A1428;border:1px solid ${accentRgba};border-left:3px solid ${accent};border-radius:12px;border-collapse:separate !important;margin-bottom:8px;"><tr><td bgcolor="#1A1428" style="background-color:#1A1428;padding:16px 20px;border-radius:12px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr><td valign="middle" style="font-family:${FONT_BODY};font-size:11px;color:${accent};letter-spacing:1px;font-weight:600;text-transform:uppercase;">${timeMeta.icon}&nbsp;${escapeHtml(timeMeta.time_word)} · ${escapeHtml(timeMeta.time)}</td><td align="right" valign="middle">${recipeButton}</td></tr></table><div class="meal-name-mobile" style="font-family:${FONT_BODY};font-size:18px;color:#F0EBFF;font-weight:700;letter-spacing:-0.3px;line-height:1.2;margin-bottom:10px;">${escapeHtml(title || label)}</div><div style="font-family:${FONT_BODY};font-size:12px;color:#B5A8D4;font-weight:500;line-height:1.55;">${macroLine}</div></td></tr></table>`;
}

function renderDailyTotalPill(day) {
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
  const kcalDisplay = dailyKcal != null ? String(dailyKcal) : '—';

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1428" style="background-color:#1A1428;border:1px solid rgba(168,85,247,0.3);border-radius:999px;border-collapse:separate !important;margin-top:12px;"><tr><td bgcolor="#1A1428" style="background-color:#1A1428;padding:14px 22px;border-radius:999px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="font-family:${FONT_BODY};font-size:13px;color:#9F8FC0;font-weight:500;">Celkem za den</td><td align="right" valign="middle" style="font-family:${FONT_BODY};font-size:18px;color:#F0EBFF;font-weight:700;letter-spacing:-0.3px;">${escapeHtml(kcalDisplay)} <span style="font-size:12px;color:#9F8FC0;font-weight:500;">kcal</span></td></tr></table></td></tr></table>`;
}

function renderWorkoutFull(day, coachVoice) {
  const workout = day?.workout || {};
  const exercises = Array.isArray(workout?.exercises)
    ? workout.exercises
    : Array.isArray(day?.exercises)
      ? day.exercises
      : [];

  if (!exercises.length) {
    const restCopy = getWorkoutCopy('rest', coachVoice);
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1428" style="background-color:#1A1428;border:1px solid rgba(168,85,247,0.25);border-left:3px solid #A855F7;border-radius:12px;border-collapse:separate !important;margin-top:12px;"><tr><td bgcolor="#1A1428" style="background-color:#1A1428;padding:20px;border-radius:12px;"><div style="font-family:${FONT_BODY};font-size:11px;color:#A855F7;letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:8px;">▲ Pohyb</div><div style="font-family:${FONT_BODY};font-size:18px;color:#F0EBFF;font-weight:700;line-height:1.2;margin-bottom:8px;">${escapeHtml(restCopy.intro)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:#9F8FC0;font-weight:400;line-height:1.55;">${escapeHtml(restCopy.description)}</div></td></tr></table>`;
  }

  const intensity = inferWorkoutIntensity(workout, day);
  const copy = getWorkoutCopy(intensity, coachVoice);
  const borderColor = intensity === 'hard' ? '#EF4444' : intensity === 'easy' ? '#10B981' : '#EC4899';
  const borderRgba = intensity === 'hard'
    ? 'rgba(239,68,68,0.25)'
    : intensity === 'easy'
      ? 'rgba(16,185,129,0.25)'
      : 'rgba(236,72,153,0.25)';

  const inlineExerciseList = exercises
    .map((ex) => {
      const name = String(ex?.name || ex?.exercise_name || 'Cvik');
      const sets = ex?.sets != null ? String(ex.sets) : '—';
      const reps = ex?.reps != null ? String(ex.reps) : '—';
      const repsUnit = ex?.duration_seconds ? `${ex.sets ?? '—'}×${ex.duration_seconds}\u00A0s` : `${sets}×${reps}`;
      return `${escapeHtml(name)} <strong style="color:#F0EBFF;font-weight:600;">${escapeHtml(repsUnit)}</strong>`;
    })
    .join(' · ');

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1428" style="background-color:#1A1428;border:1px solid ${borderRgba};border-left:3px solid ${borderColor};border-radius:12px;border-collapse:separate !important;margin-top:12px;"><tr><td bgcolor="#1A1428" style="background-color:#1A1428;padding:20px;border-radius:12px;"><div style="font-family:${FONT_BODY};font-size:11px;color:${borderColor};letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:8px;">▲ Pohyb</div><div style="font-family:${FONT_BODY};font-size:18px;color:#F0EBFF;font-weight:700;line-height:1.2;margin-bottom:8px;">${escapeHtml(copy.intro)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:#9F8FC0;font-weight:400;line-height:1.55;margin-bottom:12px;">${escapeHtml(copy.description)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:#B5A8D4;font-weight:400;line-height:1.7;">${inlineExerciseList}</div></td></tr></table>`;
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
  const workoutHtml = renderWorkoutFull(day, coachVoice);

  return `<tr><td class="px-mobile" bgcolor="#0A0815" style="background-color:#0A0815;padding:0 20px 12px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#15101F" style="background-color:#15101F;border:1px solid rgba(168,85,247,0.2);border-radius:16px;border-collapse:separate !important;"><tr><td bgcolor="#A855F7" style="background-color:#A855F7;background-image:linear-gradient(135deg,#A855F7 0%,#EC4899 100%);border-radius:16px 16px 0 0;padding:20px 24px;"><div style="font-family:${FONT_BODY};font-size:11px;color:#FFFFFF;letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">${escapeHtml(ordinalLabel)}</div><div class="day-name-mobile" style="font-family:${FONT_BODY};font-size:24px;color:#FFFFFF;font-weight:700;letter-spacing:-0.5px;line-height:1.1;">${escapeHtml(dayName)}</div><div style="font-family:${FONT_BODY};font-size:13px;color:#FFFFFF;font-weight:500;margin-top:4px;">${escapeHtml(dateDisplay)}</div></td></tr><tr><td class="px-card-mobile" bgcolor="#15101F" style="background-color:#15101F;padding:20px;border-radius:0 0 16px 16px;">${mealsHtml}${dailyTotalHtml}${workoutHtml}</td></tr></table></td></tr>`;
}

function getCompactMealLine(day, type, planJson) {
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  const found = meals.find((m) => (m?.type ?? '') === type);
  if (!found) return null;
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
    return { color: '#A855F7', text: 'Volný den. Odpočinek je součást plánu.' };
  }
  const intensity = inferWorkoutIntensity(workout, day);
  const borderColor = intensity === 'hard' ? '#EF4444' : intensity === 'easy' ? '#10B981' : '#EC4899';
  const first3 = exercises.slice(0, 3).map((ex) => {
    const name = String(ex?.name || ex?.exercise_name || 'Cvik');
    const sets = ex?.sets != null ? String(ex.sets) : '—';
    const reps = ex?.reps != null ? String(ex.reps) : '—';
    const repsUnit = ex?.duration_seconds ? `${ex.sets ?? '—'}×${ex.duration_seconds}\u00A0s` : `${sets}×${reps}`;
    return `${escapeHtml(name)} <strong style="color:#F0EBFF;font-weight:600;">${escapeHtml(repsUnit)}</strong>`;
  }).join(' · ');
  const moreCount = exercises.length - 3;
  const tail = moreCount > 0 ? ` <span style="color:#9F8FC0;font-weight:500;">+ ${moreCount} dalších</span>` : '';
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

  const dayUrl = `${appBaseUrl}/?den=${index + 1}`;
  const workoutInfo = compactWorkoutLine(day, coachVoice);

  const mealRow = (timeMeta, label, title) => {
    if (!title) return '';
    return `<tr><td valign="top" width="16" style="padding-top:2px;font-family:${FONT_BODY};font-size:12px;color:${timeMeta.color};font-weight:700;">${timeMeta.icon}</td><td style="padding:0 0 6px 6px;font-family:${FONT_BODY};font-size:13px;color:#B5A8D4;line-height:1.5;"><strong style="color:#F0EBFF;font-weight:600;">${escapeHtml(label)}:</strong> ${escapeHtml(title)}</td></tr>`;
  };

  const mealRowsHtml = [
    mealRow(MEAL_TIME_META.breakfast, 'Snídaně', breakfastTitle),
    mealRow(MEAL_TIME_META.lunch, 'Oběd', lunchTitle),
    mealRow(MEAL_TIME_META.dinner, 'Večeře', dinnerTitle),
    snackTitle ? mealRow(MEAL_TIME_META.snack, 'Svačina', snackTitle) : '',
  ].filter(Boolean).join('');

  return `<tr><td class="px-mobile" bgcolor="#0A0815" style="background-color:#0A0815;padding:0 20px 8px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#15101F" style="background-color:#15101F;border:1px solid rgba(168,85,247,0.18);border-radius:12px;border-collapse:separate !important;"><tr><td bgcolor="#15101F" style="background-color:#15101F;padding:16px 20px;border-radius:12px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr><td valign="top"><div style="font-family:${FONT_BODY};font-size:11px;color:#A855F7;letter-spacing:1px;font-weight:600;text-transform:uppercase;margin-bottom:2px;">${escapeHtml(ordinalLabel)}</div><div class="day-compact-mobile" style="font-family:${FONT_BODY};font-size:18px;color:#F0EBFF;font-weight:700;letter-spacing:-0.3px;">${escapeHtml(dayName)} <span style="font-size:13px;color:#9F8FC0;font-weight:500;letter-spacing:0;"> · ${escapeHtml(dateShort)}</span></div></td><td align="right" valign="middle"><a href="${escapeHtml(dayUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.3);border-radius:999px;padding:6px 12px;font-family:${FONT_BODY};font-size:11px;color:#A855F7;font-weight:600;letter-spacing:0.5px;text-decoration:none;text-transform:uppercase;">Otevřít →</a></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0">${mealRowsHtml}</table><div style="font-family:${FONT_BODY};font-size:12px;color:#9F8FC0;line-height:1.6;padding-top:10px;margin-top:8px;border-top:1px solid rgba(168,85,247,0.12);"><strong style="color:${workoutInfo.color};font-weight:600;">▲ Pohyb:</strong> ${workoutInfo.text}</div></td></tr></table></td></tr>`;
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
export function buildWeeklyPlanEmailV7Document(options = {}) {
  const planJson = options.structuredPlanJson;
  const days = Array.isArray(planJson?.days) ? planJson.days : [];
  const targets = planJson?.targets ?? {};
  const bm = options.bodyMetrics && typeof options.bodyMetrics === 'object' ? options.bodyMetrics : {};
  const appBaseUrl = String(options.appBaseUrl || getPublicAppUrl() || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const ctaUrl = String(options.ctaUrl || appBaseUrl).replace(/\/$/, '');

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

  // Day 1 = full card, Days 2-7 = compact cards
  const daysHtml = days
    .map((day, idx) => {
      if (idx === 0) {
        return renderDayFull(day, idx, days.length, planJson, appBaseUrl, coachVoice, validFrom);
      }
      return renderDayCompact(day, idx, planJson, appBaseUrl, coachVoice, validFrom);
    })
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

export default buildWeeklyPlanEmailV7Document;
