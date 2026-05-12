import { readFileSync } from 'fs';
import { join } from 'path';
import { escapeHtml } from './emailTemplates.js';
import { mealDisplayTitleForStructuredMeal } from './mealDisplayNameHelpers.js';
import { addCalendarDaysIsoPrague } from './czechCalendar.js';
import { getPublicAppUrl } from './siteUrls.js';
import { toCzechVocative } from './utils/czechVocative.js';
import { formatDayDateWords, formatDayDateNumeric, dayOrdinalCs } from './utils/czechDateWords.js';

const MEAL_TYPE_LABELS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

const MEAL_TIME_META = {
  breakfast: { icon: '☼', time_word: 'RÁNO', time: '07:30' },
  lunch: { icon: '◐', time_word: 'POLEDNE', time: '13:00' },
  dinner: { icon: '☾', time_word: 'VEČER', time: '19:00' },
  snack: { icon: '◇', time_word: 'ODPOLEDNE', time: '16:00' },
};

const GOAL_PALETTE = {
  muscle_gain: {
    primary: '#A855F7',
    primary_dark: '#7E22CE',
    secondary: '#EC4899',
    secondary_dark: '#BE185D',
    accent: '#F59E0B',
    accent_dark: '#B45309',
    primary_rgb: '168,85,247',
    secondary_rgb: '236,72,153',
    accent_rgb: '245,158,11',
    day_gradient: 'linear-gradient(135deg, #1A0B33 0%, #4C1D95 25%, #7E22CE 50%, #BE185D 80%, #F59E0B 100%)',
  },
  weight_loss: {
    primary: '#3B82F6',
    primary_dark: '#1D4ED8',
    secondary: '#06B6D4',
    secondary_dark: '#0E7490',
    accent: '#10B981',
    accent_dark: '#047857',
    primary_rgb: '59,130,246',
    secondary_rgb: '6,182,212',
    accent_rgb: '16,185,129',
    day_gradient: 'linear-gradient(135deg, #0B1A33 0%, #1E3A8A 25%, #1D4ED8 50%, #0E7490 80%, #10B981 100%)',
  },
  maintenance: {
    primary: '#94A3B8',
    primary_dark: '#475569',
    secondary: '#CBD5E1',
    secondary_dark: '#64748B',
    accent: '#E2E8F0',
    accent_dark: '#94A3B8',
    primary_rgb: '148,163,184',
    secondary_rgb: '203,213,225',
    accent_rgb: '226,232,240',
    day_gradient: 'linear-gradient(135deg, #1E293B 0%, #334155 25%, #475569 50%, #64748B 80%, #94A3B8 100%)',
  },
  endurance: {
    primary: '#22C55E',
    primary_dark: '#15803D',
    secondary: '#EAB308',
    secondary_dark: '#A16207',
    accent: '#F97316',
    accent_dark: '#C2410C',
    primary_rgb: '34,197,94',
    secondary_rgb: '234,179,8',
    accent_rgb: '249,115,22',
    day_gradient: 'linear-gradient(135deg, #0B331A 0%, #166534 25%, #15803D 50%, #A16207 80%, #F97316 100%)',
  },
};

const GOAL_TEXT_CS = {
  redukce: 'Hubnutí',
  weight_loss: 'Hubnutí',
  nabirani_svaly: 'Nabírání<br>svalů',
  muscle_gain: 'Nabírání<br>svalů',
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

function getGoalPalette(goal) {
  return GOAL_PALETTE[goalKey(goal)] || GOAL_PALETTE.muscle_gain;
}

let cachedTemplate = null;
let cachedCoachVoice = null;

function loadTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const path = join(process.cwd(), 'lib', 'templates', 'bmon_weekly_plan_email_v5.html');
  cachedTemplate = readFileSync(path, 'utf8');
  return cachedTemplate;
}

function loadCoachVoice() {
  if (cachedCoachVoice) return cachedCoachVoice;
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

function formatMacroCell(value) {
  if (value == null) {
    return '<span style="color:#6B5C8F">—</span>';
  }
  return `${value}<span style="font-size:13px;color:#6B5C8F;font-weight:400;letter-spacing:0;"> g</span>`;
}

function formatInlineMacro(value, color) {
  if (value == null) return '<span style="color:#6B5C8F;font-weight:700;">—</span>';
  return `<strong style="color:${color};font-weight:700;">${value} g</strong>`;
}

function formatTargetMacroBig(value) {
  if (value == null || !Number.isFinite(Number(value))) return '<span style="color:#6B5C8F">—</span>';
  const rounded = Math.round(Number(value));
  return `${rounded}<span style="font-size:18px;color:#6B5C8F;font-weight:400;letter-spacing:0;"> g</span>`;
}

function formatKcalDisplay(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return String(Math.round(Number(value)));
}

function getMottoForWeek(weekNumber, coachVoice) {
  const list = Array.isArray(coachVoice?.weekly_mottos) ? coachVoice.weekly_mottos : [];
  if (!list.length) {
    return { text: 'Nemusíš to mít rád. Stačí, že to děláš.', attribution: 'pravidlo tohoto týdne' };
  }
  const week = Number(weekNumber);
  const idx = Number.isFinite(week) && week >= 0 ? ((week % list.length) + list.length) % list.length : 0;
  const m = list[idx] || list[0];
  return {
    text: m?.text || list[0].text,
    attribution: m?.attribution || 'pravidlo tohoto týdne',
  };
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

function getCoachQuote(goal, coachVoice) {
  const quotes = coachVoice?.coach_quotes || {};
  return quotes[goalKey(goal)] || quotes.muscle_gain || { text: '', highlight: '' };
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

function renderMacrosBlock(targets, commentary, palette) {
  const rows = [
    {
      label: 'BÍLKOVINY',
      value: targets?.protein_g,
      comment: commentary.protein || '',
      color: palette.primary,
      colorAlpha8: `rgba(${palette.primary_rgb},0.08)`,
      colorAlpha02: `rgba(${palette.primary_rgb},0.02)`,
      colorAlpha10: `rgba(${palette.primary_rgb},0.1)`,
      gradientStart: palette.primary,
      gradientEnd: palette.primary,
      barWidth: 85,
    },
    {
      label: 'SACHARIDY',
      value: targets?.carbs_g,
      comment: commentary.carbs || '',
      color: palette.secondary,
      colorAlpha8: `rgba(${palette.secondary_rgb},0.08)`,
      colorAlpha02: `rgba(${palette.secondary_rgb},0.02)`,
      colorAlpha10: `rgba(${palette.secondary_rgb},0.1)`,
      gradientStart: palette.secondary,
      gradientEnd: palette.secondary,
      barWidth: 70,
    },
    {
      label: 'TUKY',
      value: targets?.fat_g,
      comment: commentary.fat || '',
      color: palette.accent,
      colorAlpha8: `rgba(${palette.accent_rgb},0.08)`,
      colorAlpha02: `rgba(${palette.accent_rgb},0.02)`,
      colorAlpha10: `rgba(${palette.accent_rgb},0.1)`,
      gradientStart: palette.accent,
      gradientEnd: palette.accent,
      barWidth: 55,
    },
  ];
  return rows
    .map((row) => {
      const valueHtml = formatTargetMacroBig(row.value);
      const commentHtml = row.comment
        ? `<td align="right" valign="middle" style="font-family:'Geist',Arial,sans-serif;font-size:16px;color:#D4C7F0;font-weight:400;line-height:1.5;max-width:280px;">
              ${escapeHtml(row.comment)}
            </td>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;background:linear-gradient(90deg, ${row.colorAlpha8} 0%, ${row.colorAlpha02} 60%, transparent 100%);border-left:3px solid ${row.color};">
            <tr>
              <td style="padding:28px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div class="mono" style="font-family:'Geist Mono',monospace;font-size:11px;color:${row.color};letter-spacing:2.5px;font-weight:600;text-transform:uppercase;margin-bottom:8px;">${escapeHtml(row.label)}</div>
                      <div class="macro-big" style="font-family:'Geist',Arial,sans-serif;font-size:48px;color:#F8F4FF;font-weight:700;line-height:0.95;letter-spacing:-1.5px;">
                        ${valueHtml}
                      </div>
                    </td>
                    ${commentHtml}
                  </tr>
                </table>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
                  <tr>
                    <td style="background:${row.color};height:4px;line-height:4px;font-size:0;width:${row.barWidth}%;">&nbsp;</td>
                    <td style="background:${row.colorAlpha10};height:4px;line-height:4px;font-size:0;width:${100 - row.barWidth}%;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`;
    })
    .join('\n');
}

function renderHabits(habits, palette) {
  if (!Array.isArray(habits) || habits.length === 0) return '';
  const accents = [
    {
      color: palette.primary,
      colorDark: palette.primary_dark,
      bgGradient: `linear-gradient(135deg, rgba(${palette.primary_rgb},0.06) 0%, rgba(${palette.primary_rgb},0.01) 100%)`,
      border: `1px solid rgba(${palette.primary_rgb},0.18)`,
    },
    {
      color: palette.secondary,
      colorDark: palette.secondary_dark,
      bgGradient: `linear-gradient(135deg, rgba(${palette.secondary_rgb},0.06) 0%, rgba(${palette.secondary_rgb},0.01) 100%)`,
      border: `1px solid rgba(${palette.secondary_rgb},0.18)`,
    },
    {
      color: palette.accent,
      colorDark: palette.accent_dark,
      bgGradient: `linear-gradient(135deg, rgba(${palette.accent_rgb},0.06) 0%, rgba(${palette.accent_rgb},0.01) 100%)`,
      border: `1px solid rgba(${palette.accent_rgb},0.18)`,
    },
  ];
  return habits
    .map((habit, idx) => {
      const title = typeof habit === 'string' ? habit : habit?.title || habit?.text || '';
      const description = typeof habit === 'string' ? '' : habit?.description || habit?.detail || '';
      if (!title) return '';
      const accent = accents[idx % accents.length];
      const num = String(idx + 1).padStart(2, '0');
      const isLast = idx === habits.length - 1;
      const mb = isLast ? '' : 'margin-bottom:16px;';
      const descriptionHtml = description
        ? `<div style="font-family:'Geist',Arial,sans-serif;font-size:15px;color:#9F8FC0;font-weight:400;line-height:1.6;">
              ${escapeHtml(description)}
            </div>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${mb}background:${accent.bgGradient};border:${accent.border};">
            <tr>
              <td valign="top" width="120" style="padding:36px 32px;background:linear-gradient(135deg,${accent.color} 0%,${accent.colorDark} 100%);">
                <div style="font-family:'Geist',Arial,sans-serif;font-size:48px;color:#FFFFFF;font-weight:800;line-height:0.95;letter-spacing:-1.5px;">${num}</div>
              </td>
              <td valign="top" style="padding:32px 36px;">
                <div style="font-family:'Geist',Arial,sans-serif;font-size:24px;color:#F8F4FF;font-weight:700;line-height:1.2;letter-spacing:-0.5px;margin-bottom:12px;">${escapeHtml(title)}</div>
                ${descriptionHtml}
              </td>
            </tr>
          </table>`;
    })
    .filter(Boolean)
    .join('\n');
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

function renderMealCard(meal, day, planJson, appBaseUrl, palette) {
  const type = meal?.type ?? 'breakfast';
  const timeMeta = MEAL_TIME_META[type] || MEAL_TIME_META.breakfast;
  const label = MEAL_TYPE_LABELS[type] || type;
  const dayName = day?.day_name ?? day?.date ?? 'Den';
  const title = mealDisplayTitleForStructuredMeal(meal, planJson?.html || '', dayName);
  const recipeUrl = mealRecipeUrl(meal, appBaseUrl);
  const macros = mealMacros(meal);

  const mealAccent = type === 'breakfast'
    ? { color: palette.accent, rgb: palette.accent_rgb }
    : type === 'lunch'
      ? { color: palette.primary, rgb: palette.primary_rgb }
      : type === 'dinner'
        ? { color: palette.secondary, rgb: palette.secondary_rgb }
        : { color: palette.accent, rgb: palette.accent_rgb };

  const recipeButton = recipeUrl
    ? `<a href="${escapeHtml(recipeUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 18px;background:rgba(${mealAccent.rgb},0.15);border:1px solid rgba(${mealAccent.rgb},0.4);font-family:'Geist Mono',monospace;font-size:11px;color:${mealAccent.color};letter-spacing:1.5px;font-weight:600;text-decoration:none;text-transform:uppercase;">RECEPT →</a>`
    : '';

  const topPadding = type === 'breakfast' ? '16px' : '12px';

  return `<tr><td class="px-mobile" style="padding:${topPadding} 64px 0 64px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, rgba(${mealAccent.rgb},0.08) 0%, rgba(6,5,10,0.95) 70%);border:1px solid rgba(${mealAccent.rgb},0.2);">
            <tr>
              <td style="padding:36px 40px;">

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                  <tr>
                    <td>
                      <div class="mono" style="font-family:'Geist Mono',monospace;font-size:11px;color:${mealAccent.color};letter-spacing:2.5px;font-weight:600;text-transform:uppercase;">
                        ${timeMeta.icon} &nbsp; ${escapeHtml(timeMeta.time_word)} · ${escapeHtml(timeMeta.time)}
                      </div>
                    </td>
                    <td align="right">
                      ${recipeButton}
                    </td>
                  </tr>
                </table>

                <div class="meal-title" style="font-family:'Geist',Arial,sans-serif;font-size:30px;color:#F8F4FF;font-weight:700;line-height:1.1;letter-spacing:-1px;margin-bottom:32px;">
                  ${escapeHtml(title || label)}
                </div>

                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="25%" style="border-top:1px solid rgba(${palette.primary_rgb},0.25);padding:20px 16px 0 0;">
                      <div class="mono" style="font-family:'Geist Mono',monospace;font-size:10px;color:${palette.primary};letter-spacing:1.5px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">BÍLKOVINY</div>
                      <div style="font-family:'Geist',Arial,sans-serif;font-size:32px;color:#F8F4FF;font-weight:700;line-height:1;letter-spacing:-1px;">${formatMacroCell(macros.protein_g)}</div>
                    </td>
                    <td width="25%" style="border-top:1px solid rgba(${palette.secondary_rgb},0.25);padding:20px 16px 0 16px;">
                      <div class="mono" style="font-family:'Geist Mono',monospace;font-size:10px;color:${palette.secondary};letter-spacing:1.5px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">SACHARIDY</div>
                      <div style="font-family:'Geist',Arial,sans-serif;font-size:32px;color:#F8F4FF;font-weight:700;line-height:1;letter-spacing:-1px;">${formatMacroCell(macros.carbs_g)}</div>
                    </td>
                    <td width="25%" style="border-top:1px solid rgba(${palette.accent_rgb},0.25);padding:20px 16px 0 16px;">
                      <div class="mono" style="font-family:'Geist Mono',monospace;font-size:10px;color:${palette.accent};letter-spacing:1.5px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">TUKY</div>
                      <div style="font-family:'Geist',Arial,sans-serif;font-size:32px;color:#F8F4FF;font-weight:700;line-height:1;letter-spacing:-1px;">${formatMacroCell(macros.fat_g)}</div>
                    </td>
                    <td width="25%" style="border-top:1px solid rgba(16,185,129,0.25);padding:20px 0 0 16px;">
                      <div class="mono" style="font-family:'Geist Mono',monospace;font-size:10px;color:#10B981;letter-spacing:1.5px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">VLÁKNINA</div>
                      <div style="font-family:'Geist',Arial,sans-serif;font-size:32px;color:#F8F4FF;font-weight:700;line-height:1;letter-spacing:-1px;">${formatMacroCell(macros.fiber_g)}</div>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>
          </table>
        </td></tr>`;
}

function renderDailyTotal(day, palette) {
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
  const kcalDisplay = dailyKcal != null ? String(dailyKcal) : '<span style="color:#6B5C8F">—</span>';

  return `<tr><td class="px-mobile" style="padding:20px 64px 0 64px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(90deg, rgba(${palette.primary_rgb},0.15) 0%, rgba(${palette.secondary_rgb},0.12) 50%, rgba(${palette.accent_rgb},0.15) 100%);border:1px solid rgba(${palette.primary_rgb},0.25);">
            <tr>
              <td style="padding:32px 40px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div class="mono" style="font-family:'Geist Mono',monospace;font-size:11px;color:${palette.primary};letter-spacing:3px;font-weight:600;text-transform:uppercase;">CELKEM ZA DEN</div>
                    </td>
                    <td align="right" style="font-family:'Geist',Arial,sans-serif;font-size:48px;color:#F8F4FF;font-weight:800;letter-spacing:-2px;line-height:1;">
                      ${kcalDisplay} <span class="mono" style="font-family:'Geist Mono',monospace;font-size:14px;color:#9F8FC0;letter-spacing:2px;font-weight:500;">KCAL</span>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:16px;font-family:'Geist',Arial,sans-serif;font-size:14px;color:#D4C7F0;line-height:1.6;">
                  Bílkoviny ${formatInlineMacro(dailyProtein, palette.primary)} &nbsp;·&nbsp; Sacharidy ${formatInlineMacro(dailyCarbs, palette.secondary)} &nbsp;·&nbsp; Tuky ${formatInlineMacro(dailyFat, palette.accent)} &nbsp;·&nbsp; Vláknina ${formatInlineMacro(dailyFiber, '#10B981')}
                </div>
              </td>
            </tr>
          </table>
        </td></tr>`;
}

function inferWorkoutIntensity(workout, day) {
  const raw = String(workout?.intensity || day?.workout_intensity || '').toLowerCase();
  if (['easy', 'medium', 'hard', 'rest'].includes(raw)) return raw;
  return 'medium';
}

function renderWorkout(day, coachVoice, palette, appBaseUrl) {
  const workout = day?.workout || {};
  const exercises = Array.isArray(workout?.exercises)
    ? workout.exercises
    : Array.isArray(day?.exercises)
      ? day.exercises
      : [];

  const restCopy = getWorkoutCopy('rest', coachVoice);
  if (!exercises.length) {
    return `<tr><td class="px-mobile" style="padding:24px 64px 0 64px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, #1A0B33 0%, ${palette.primary_dark} 60%, ${palette.primary} 100%);">
            <tr>
              <td style="padding:48px 40px;">
                <div class="mono" style="font-family:'Geist Mono',monospace;font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:3px;font-weight:600;margin-bottom:20px;text-transform:uppercase;">
                  ▲ &nbsp; POHYB &nbsp; ▲
                </div>
                <div style="font-family:'Geist',Arial,sans-serif;font-size:36px;color:#FFFFFF;font-weight:800;letter-spacing:-1.5px;line-height:1.1;margin-bottom:14px;">
                  ${escapeHtml(restCopy.intro)}
                </div>
                <div style="font-family:'Geist',Arial,sans-serif;font-size:16px;color:rgba(255,255,255,0.85);font-weight:400;line-height:1.6;max-width:520px;">
                  ${escapeHtml(restCopy.description)}
                </div>
              </td>
            </tr>
          </table>
        </td></tr>`;
  }

  const intensity = inferWorkoutIntensity(workout, day);
  const copy = getWorkoutCopy(intensity, coachVoice);

  // Intensity gradient: easy=green tint, medium=purple (default), hard=red tint
  let blockGradient;
  if (intensity === 'easy') {
    blockGradient = 'linear-gradient(135deg, #0B331A 0%, #166534 40%, #15803D 100%)';
  } else if (intensity === 'hard') {
    blockGradient = 'linear-gradient(135deg, #331111 0%, #7F1D1D 40%, #BE185D 100%)';
  } else {
    blockGradient = `linear-gradient(135deg, #1A0B33 0%, ${palette.primary_dark} 40%, ${palette.secondary_dark} 100%)`;
  }

  const exerciseRows = exercises
    .map((ex, idx) => {
      const name = String(ex?.name || ex?.exercise_name || 'Cvik');
      const sets = ex?.sets != null ? String(ex.sets) : '—';
      const reps = ex?.reps != null ? String(ex.reps) : '—';
      const repsUnit = ex?.duration_seconds
        ? `${ex.sets ?? '—'} × ${ex.duration_seconds} s`
        : `${sets} × ${reps}`;
      const num = String(idx + 1).padStart(2, '0');
      const isLast = idx === exercises.length - 1;
      const borderBottom = isLast ? '' : 'border-bottom:1px solid rgba(255,255,255,0.1);';
      return `<tr>
              <td style="padding:24px 28px;${borderBottom}">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="40" style="font-family:'Geist Mono',monospace;font-size:14px;color:rgba(255,255,255,0.5);font-weight:600;letter-spacing:1px;">${num}</td>
                    <td style="font-family:'Geist',Arial,sans-serif;font-size:20px;color:#FFFFFF;font-weight:600;letter-spacing:-0.3px;">${escapeHtml(name)}</td>
                    <td align="right" class="mono" style="font-family:'Geist Mono',monospace;font-size:18px;color:${palette.accent};font-weight:600;letter-spacing:1px;">${escapeHtml(repsUnit)}</td>
                  </tr>
                </table>
              </td>
            </tr>`;
    })
    .join('\n');

  return `<tr><td class="px-mobile" style="padding:24px 64px 0 64px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${blockGradient};">
            <tr>
              <td style="padding:48px 40px;">

                <div class="mono" style="font-family:'Geist Mono',monospace;font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:3px;font-weight:600;margin-bottom:20px;text-transform:uppercase;">
                  ▲ &nbsp; POHYB &nbsp; ▲
                </div>

                <div style="font-family:'Geist',Arial,sans-serif;font-size:36px;color:#FFFFFF;font-weight:800;letter-spacing:-1.5px;line-height:1.1;margin-bottom:14px;">
                  ${escapeHtml(copy.intro)}
                </div>

                <div style="font-family:'Geist',Arial,sans-serif;font-size:16px;color:rgba(255,255,255,0.85);font-weight:400;line-height:1.6;margin-bottom:36px;max-width:520px;">
                  ${escapeHtml(copy.description)}
                </div>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);">
                  ${exerciseRows}
                </table>

                <div style="margin-top:24px;font-family:'Geist',Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;">
                  Videa s technikou v <a href="${escapeHtml(appBaseUrl)}" target="_blank" rel="noopener noreferrer" style="color:#FFFFFF;border-bottom:1px solid rgba(255,255,255,0.5);text-decoration:none;font-weight:600;">aplikaci</a>.
                </div>

              </td>
            </tr>
          </table>
        </td></tr>`;
}

function renderDayCard(day, index, totalDays, planJson, appBaseUrl, palette, coachVoice) {
  const dayIndexPad = String(index + 1).padStart(2, '0');
  const totalPad = String(totalDays).padStart(2, '0');
  const dayName = day?.day_name || `Den ${index + 1}`;
  const dayShort = (dayName || '').slice(0, 2).toUpperCase();
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
  const mealsHtml = meals.map((meal) => renderMealCard(meal, day, planJson, appBaseUrl, palette)).join('\n');
  const dailyTotalHtml = renderDailyTotal(day, palette);
  const workoutHtml = renderWorkout(day, coachVoice, palette, appBaseUrl);

  return `<tr><td class="px-mobile" style="padding:32px 64px 0 64px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${palette.day_gradient};">
            <tr>
              <td style="padding:72px 56px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div class="mono" style="font-family:'Geist Mono',monospace;font-size:11px;color:rgba(255,255,255,0.75);letter-spacing:3px;font-weight:600;margin-bottom:24px;text-transform:uppercase;">
                        DEN ${dayIndexPad} / ${totalPad} &nbsp;·&nbsp; ${escapeHtml(ordinal)}
                      </div>
                      <div class="day-mega" style="font-family:'Geist',Arial,sans-serif;font-size:80px;color:#FFFFFF;font-weight:800;letter-spacing:-3px;line-height:0.95;">
                        ${escapeHtml(dayName)}
                      </div>
                      <div style="font-family:'Geist',Arial,sans-serif;font-size:22px;color:rgba(255,255,255,0.85);font-weight:400;margin-top:14px;letter-spacing:-0.3px;">
                        ${escapeHtml(dateDisplay)}
                      </div>
                    </td>
                    <td align="right" valign="bottom" class="hide-mobile">
                      <div style="font-family:'Geist Mono',monospace;font-size:96px;color:rgba(255,255,255,0.18);font-weight:800;letter-spacing:-4px;line-height:1;">${escapeHtml(dayShort)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>
        ${mealsHtml}
        ${dailyTotalHtml}
        ${workoutHtml}`;
}

/**
 * @param {object} options
 * @param {object} options.structuredPlanJson
 * @param {object} [options.bodyMetrics]
 * @param {string} [options.firstName]
 * @param {string} [options.loginBlock]
 * @param {boolean} [options.planChangeContext]
 * @param {string} [options.appBaseUrl]
 * @param {string} [options.ctaUrl]
 * @param {string} [options.validFrom]
 */
export function buildWeeklyPlanEmailV5Document(options = {}) {
  const planJson = options.structuredPlanJson;
  const days = Array.isArray(planJson?.days) ? planJson.days : [];
  const targets = planJson?.targets ?? {};
  const bm = options.bodyMetrics && typeof options.bodyMetrics === 'object' ? options.bodyMetrics : {};
  const appBaseUrl = String(options.appBaseUrl || getPublicAppUrl() || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const ctaUrl = String(options.ctaUrl || appBaseUrl).replace(/\/$/, '');
  const rawFirstName = String(options.firstName || bm?.name || '').trim().split(/\s+/)[0] || '';
  const vocativeName = rawFirstName ? toCzechVocative(rawFirstName) : '';
  const greeting = vocativeName ? 'Ahoj' : 'Ahoj,';

  const validFrom =
    String(options.validFrom || planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10) ||
    (typeof days[0]?.date === 'string' ? days[0].date.replace(/T.*/, '').slice(0, 10) : '');
  const yearStr = validFrom ? validFrom.slice(0, 4) : String(new Date().getFullYear());
  const weekNumber = isoWeekNumber(validFrom) ?? 1;
  const weekLabel = `TÝDEN ${weekNumber} · ${yearStr}`;

  const coachVoice = loadCoachVoice();
  const goal = bm?.goal || planJson?.goal;
  const palette = getGoalPalette(goal);

  const motto = getMottoForWeek(weekNumber, coachVoice);
  const mottoLines = splitMottoIntoLines(motto.text);
  const coachIntro = getCoachIntro(goal, coachVoice);
  const coachQuote = getCoachQuote(goal, coachVoice);
  const macroCommentary = getMacroCommentary(goal, coachVoice);
  const kcalLeadIn = getKcalLeadIn(goal, coachVoice);

  const targetKcal = Math.round(Number(targets.calories_per_day) || 0) || null;
  const targetKcalDisplay = targetKcal != null ? formatKcalDisplay(targetKcal) : '—';
  const targetsForMacros = {
    protein_g: targets?.protein_g,
    carbs_g: targets?.carbs_g,
    fat_g: targets?.fat_g,
  };

  const habitsList = extractHabits(planJson);
  const habitsHtml = renderHabits(habitsList, palette);
  const macrosHtml = renderMacrosBlock(targetsForMacros, macroCommentary, palette);
  const daysHtml = days.map((day, idx) => renderDayCard(day, idx, days.length, planJson, appBaseUrl, palette, coachVoice)).join('\n');

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

  const loginBlockHtml = options.loginBlock
    ? `<tr><td style="background:#06050A;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <table class="container" width="1100" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:1100px;">
              <tr><td class="px-mobile" style="padding:0 64px 24px 64px;">
                ${options.loginBlock}
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>`
    : '';

  const planChangeNote = options.planChangeContext
    ? `<tr><td style="background:#06050A;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <table class="container" width="1100" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:1100px;">
              <tr><td class="px-mobile" style="padding:32px 64px 0 64px;">
                <div style="font-family:'Geist',Arial,sans-serif;font-size:15px;color:#D4C7F0;line-height:1.6;padding:20px 24px;background:rgba(${palette.accent_rgb},0.08);border-left:3px solid ${palette.accent};">
                  Upravili jsme tvůj plán podle posledních preferencí. Drž se ho stejně jako minulého.
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>`
    : '';

  html = html.replace('<!--BMON_LOGIN_BLOCK-->', `${planChangeNote}${loginBlockHtml}`);
  html = html.replace('<!--BMON_MACROS-->', macrosHtml);
  html = html.replace('<!--BMON_HABITS-->', habitsHtml);
  html = html.replace('<!--BMON_DAYS-->', daysHtml);

  const sectionTitles = coachVoice?.section_titles || {};

  return applyVars(html, {
    palette_primary: palette.primary,
    palette_primary_dark: palette.primary_dark,
    palette_secondary: palette.secondary,
    palette_secondary_dark: palette.secondary_dark,
    palette_accent: palette.accent,
    palette_accent_dark: palette.accent_dark,
    palette_primary_alpha04: `rgba(${palette.primary_rgb},0.04)`,
    palette_primary_alpha08: `rgba(${palette.primary_rgb},0.08)`,
    palette_primary_alpha10: `rgba(${palette.primary_rgb},0.10)`,
    palette_primary_alpha12: `rgba(${palette.primary_rgb},0.12)`,
    palette_primary_alpha15: `rgba(${palette.primary_rgb},0.15)`,
    palette_primary_alpha18: `rgba(${palette.primary_rgb},0.18)`,
    palette_primary_alpha30: `rgba(${palette.primary_rgb},0.30)`,
    palette_primary_alpha35: `rgba(${palette.primary_rgb},0.35)`,
    palette_primary_alpha02: `rgba(${palette.primary_rgb},0.02)`,
    palette_secondary_alpha02: `rgba(${palette.secondary_rgb},0.02)`,
    palette_secondary_alpha05: `rgba(${palette.secondary_rgb},0.05)`,
    palette_secondary_alpha08: `rgba(${palette.secondary_rgb},0.08)`,
    palette_secondary_alpha12: `rgba(${palette.secondary_rgb},0.12)`,
    palette_secondary_alpha15: `rgba(${palette.secondary_rgb},0.15)`,
    palette_secondary_alpha25: `rgba(${palette.secondary_rgb},0.25)`,
    palette_secondary_alpha30: `rgba(${palette.secondary_rgb},0.30)`,
    palette_accent_alpha02: `rgba(${palette.accent_rgb},0.02)`,
    palette_accent_alpha05: `rgba(${palette.accent_rgb},0.05)`,
    palette_accent_alpha12: `rgba(${palette.accent_rgb},0.12)`,
    palette_accent_alpha15: `rgba(${palette.accent_rgb},0.15)`,
    palette_accent_alpha18: `rgba(${palette.accent_rgb},0.18)`,
    palette_accent_alpha30: `rgba(${palette.accent_rgb},0.30)`,
    week_label: escapeHtml(weekLabel),
    greeting: escapeHtml(greeting),
    user_vocative: escapeHtml(vocativeName || 'ty'),
    hero_tagline_main: escapeHtml(coachVoice?.hero_tagline_main || 'Tvůj týden je tady.'),
    hero_tagline_accent: escapeHtml(coachVoice?.hero_tagline_accent || 'Sedm dní. Začínáme.'),
    coach_intro: escapeHtml(coachIntro),
    stat_days: String(days.length || 7),
    stat_meals: String(mealsCount || days.length * 3),
    stat_workouts: String(workoutsCount),
    cta_url: escapeHtml(ctaUrl),
    section1_label: escapeHtml(sectionTitles.profile_label || '01 / PROFIL'),
    section1_title_line1: escapeHtml(sectionTitles.profile_title_line1 || 'Začneme'),
    section1_title_line2: escapeHtml(sectionTitles.profile_title_line2 || 'u tebe.'),
    section2_label: escapeHtml(sectionTitles.rules_label || '02 / PRAVIDLA'),
    section2_title_line1: escapeHtml(sectionTitles.rules_title_line1 || 'Když všechno selže,'),
    section2_title_line2: escapeHtml(sectionTitles.rules_title_line2 || 'drž se těchto tří.'),
    section3_label: escapeHtml(sectionTitles.week_label || '03 / ROZPIS TÝDNE'),
    section3_title_line1: escapeHtml(sectionTitles.week_title_line1 || 'Den po dni.'),
    section3_title_line2: escapeHtml(sectionTitles.week_title_line2 || 'Bez spěchu.'),
    height_cm: escapeHtml(String(bm?.height_cm ?? '—')),
    weight_kg: escapeHtml(String(bm?.weight_kg ?? '—')),
    goal_text: goalTextHtml(goal),
    target_kcal: escapeHtml(targetKcalDisplay),
    kcal_lead_in: escapeHtml(kcalLeadIn),
    coach_quote_text: escapeHtml(coachQuote.text || ''),
    coach_quote_highlight: escapeHtml(coachQuote.highlight || ''),
    weekly_motto_line1: escapeHtml(mottoLines.line1),
    weekly_motto_line2: escapeHtml(mottoLines.line2),
    coach_signature_short: escapeHtml('Tvůj kouč'),
    coach_signature_body: escapeHtml(coachVoice?.coach_signature?.body || 'Drž se. Když budeš mít otázky, napiš mi. Vidíme se za týden.'),
    coach_signature_name: escapeHtml(coachVoice?.coach_signature?.name || '— Tvůj kouč'),
    footer_year: escapeHtml(yearStr),
  });
}

export default buildWeeklyPlanEmailV5Document;
