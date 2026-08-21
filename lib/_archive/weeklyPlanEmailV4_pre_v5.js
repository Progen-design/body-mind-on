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

const MEAL_TIME_LABEL = {
  breakfast: { time_word: 'Ráno', time: '07:30' },
  lunch: { time_word: 'Poledne', time: '13:00' },
  dinner: { time_word: 'Večer', time: '19:00' },
  snack: { time_word: 'Odpoledne', time: '16:00' },
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
  return 'maintenance';
}

function goalTextHtml(goal) {
  const key = goalKey(goal);
  return GOAL_TEXT_CS[key] || GOAL_TEXT_CS.udrzovani;
}

let cachedTemplate = null;
let cachedCoachVoice = null;

function loadTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const path = join(process.cwd(), 'lib', 'templates', 'bmon_weekly_plan_email_v4.html');
  cachedTemplate = readFileSync(path, 'utf8');
  return cachedTemplate;
}

function loadCoachVoice() {
  if (cachedCoachVoice) return cachedCoachVoice;
  const path = join(process.cwd(), 'lib', 'templates', 'v4_content', 'coach_voice_cs.json');
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

function formatMacroNumberCell(value) {
  if (value == null) {
    return '<span style="color:#6B5E4A">—</span>';
  }
  return `${value}<span style="font-size:14px;color:#8B7355;"> g</span>`;
}

function formatInlineMacro(value) {
  if (value == null) return '<span style="color:#6B5E4A;">—</span>';
  return `${value} g`;
}

function formatTargetMacro(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const rounded = Math.round(Number(value));
  return `${rounded}<span style="font-size:16px;color:#8B7355;font-weight:300;font-style:italic;"> g</span>`;
}

function formatKcalThousands(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const n = Math.round(Number(value));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

function getMottoForWeek(weekNumber, coachVoice) {
  const list = Array.isArray(coachVoice?.weekly_mottos) ? coachVoice.weekly_mottos : [];
  if (!list.length) {
    return {
      text: 'Nemusíš to mít rád. Stačí, že to děláš.',
      attribution: 'pravidlo tohoto týdne',
    };
  }
  const week = Number(weekNumber);
  const idx = Number.isFinite(week) && week >= 0 ? ((week % list.length) + list.length) % list.length : 0;
  const m = list[idx] || list[0];
  return {
    text: m?.text || list[0].text,
    attribution: m?.attribution || 'pravidlo tohoto týdne',
  };
}

function getCoachIntro(goal, coachVoice) {
  const intros = coachVoice?.coach_intros || {};
  return intros[goalKey(goal)] || intros.maintenance || '';
}

function getMacroCommentary(goal, coachVoice) {
  const map = coachVoice?.macro_commentary || {};
  return map[goalKey(goal)] || map.maintenance || {};
}

function getKcalLeadIn(goal, coachVoice) {
  const map = coachVoice?.kcal_lead_in || {};
  return map[goalKey(goal)] || map.maintenance || '';
}

function renderMacrosBlock(targets, commentary) {
  const rows = [
    {
      label: 'Bílkoviny',
      value: targets?.protein_g,
      comment: commentary.protein || '',
    },
    {
      label: 'Sacharidy',
      value: targets?.carbs_g,
      comment: commentary.carbs || '',
    },
    {
      label: 'Tuky',
      value: targets?.fat_g,
      comment: commentary.fat || '',
    },
  ];
  return rows
    .map((row) => {
      const valueHtml = formatTargetMacro(row.value);
      const commentHtml = row.comment
        ? `<td valign="middle" style="font-family:'Fraunces',Georgia,serif;font-size:16px;color:#B5A081;font-style:italic;font-weight:300;line-height:1.6;border-left:1px solid rgba(231,176,98,0.2);padding-left:32px;">
            ${escapeHtml(row.comment)}
          </td>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:40px;">
            <tr>
              <td valign="top" style="padding-right:32px;">
                <div class="serif" style="font-family:'Fraunces',Georgia,serif;font-size:44px;color:#F4E9D8;font-weight:300;line-height:1;letter-spacing:-1px;">
                  ${valueHtml}
                </div>
                <div style="font-family:'Fraunces',Georgia,serif;font-size:18px;color:#E7B062;font-style:italic;font-weight:400;margin-top:10px;">${escapeHtml(row.label)}</div>
              </td>
              ${commentHtml}
            </tr>
          </table>`;
    })
    .join('\n');
}

function renderHabits(habits) {
  if (!Array.isArray(habits) || habits.length === 0) return '';
  const roman = ['i.', 'ii.', 'iii.', 'iv.', 'v.', 'vi.', 'vii.'];
  return habits
    .map((habit, idx) => {
      const title = typeof habit === 'string' ? habit : habit?.title || habit?.text || '';
      const description = typeof habit === 'string' ? '' : habit?.description || habit?.detail || '';
      if (!title) return '';
      const numeral = roman[idx] || `${idx + 1}.`;
      const topBorder = idx === 0 ? '' : 'border-top:1px solid rgba(231,176,98,0.1);padding-top:32px;';
      const mb = idx < habits.length - 1 ? 'margin-bottom:24px;' : '';
      const descriptionHtml = description
        ? `<div style="font-family:'Fraunces',Georgia,serif;font-size:16px;color:#9B8B72;font-style:italic;font-weight:300;line-height:1.65;margin-top:10px;max-width:480px;">
              ${escapeHtml(description)}
            </div>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${mb}${topBorder}">
            <tr>
              <td valign="top" width="80" style="font-family:'Fraunces',Georgia,serif;font-size:28px;color:#E7B062;font-weight:300;padding:8px 0 0 0;font-style:italic;letter-spacing:-0.5px;">${numeral}</td>
              <td valign="top" style="padding:0 0 0 8px;">
                <div class="serif" style="font-family:'Fraunces',Georgia,serif;font-size:26px;color:#F4E9D8;font-weight:400;line-height:1.3;letter-spacing:-0.5px;">${escapeHtml(title)}</div>
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
        .slice(0, 5);
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
  const timeMeta = MEAL_TIME_LABEL[type] || MEAL_TIME_LABEL.breakfast;
  const label = MEAL_TYPE_LABELS[type] || type;
  const dayName = day?.day_name ?? day?.date ?? 'Den';
  const title = mealDisplayTitleForStructuredMeal(meal, planJson?.html || '', dayName);
  const recipeUrl = mealRecipeUrl(meal, appBaseUrl);
  const macros = mealMacros(meal);
  const recipeLink = recipeUrl
    ? `<a href="${escapeHtml(recipeUrl)}" target="_blank" rel="noopener noreferrer" style="font-family:'Fraunces',Georgia,serif;font-size:14px;color:#E7B062;letter-spacing:0.3px;font-style:italic;text-decoration:none;border-bottom:1px solid rgba(231,176,98,0.4);padding-bottom:3px;">Recept →</a>`
    : '';

  return `<tr><td class="px-mobile" style="padding:64px 64px 0 64px;">

          <div style="font-family:'Fraunces',Georgia,serif;font-size:14px;color:#E7B062;font-style:italic;letter-spacing:1px;margin-bottom:8px;">
            ${escapeHtml(timeMeta.time_word)} · ${escapeHtml(timeMeta.time)}
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
            <tr>
              <td valign="bottom">
                <div class="meal-name serif" style="font-family:'Fraunces',Georgia,serif;font-size:36px;color:#F4E9D8;font-weight:400;line-height:1.1;letter-spacing:-1px;">
                  ${escapeHtml(title || 'Zdravé jídlo')}
                </div>
                <div style="font-family:'Fraunces',Georgia,serif;font-size:15px;color:#8B7355;font-style:italic;margin-top:8px;">
                  ${escapeHtml(label)}
                </div>
              </td>
              <td align="right" valign="bottom">
                ${recipeLink}
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid rgba(231,176,98,0.12);">
            <tr>
              <td width="25%" style="padding:24px 0;">
                <div class="macro-num serif" style="font-family:'Fraunces',Georgia,serif;font-size:30px;color:#F4E9D8;font-weight:300;line-height:1;letter-spacing:-0.5px;">${formatMacroNumberCell(macros.protein_g)}</div>
                <div style="font-family:'Fraunces',Georgia,serif;font-size:13px;color:#8B7355;font-style:italic;margin-top:8px;">Bílkoviny</div>
              </td>
              <td width="25%" style="padding:24px 0;">
                <div class="macro-num serif" style="font-family:'Fraunces',Georgia,serif;font-size:30px;color:#F4E9D8;font-weight:300;line-height:1;letter-spacing:-0.5px;">${formatMacroNumberCell(macros.carbs_g)}</div>
                <div style="font-family:'Fraunces',Georgia,serif;font-size:13px;color:#8B7355;font-style:italic;margin-top:8px;">Sacharidy</div>
              </td>
              <td width="25%" style="padding:24px 0;">
                <div class="macro-num serif" style="font-family:'Fraunces',Georgia,serif;font-size:30px;color:#F4E9D8;font-weight:300;line-height:1;letter-spacing:-0.5px;">${formatMacroNumberCell(macros.fat_g)}</div>
                <div style="font-family:'Fraunces',Georgia,serif;font-size:13px;color:#8B7355;font-style:italic;margin-top:8px;">Tuky</div>
              </td>
              <td width="25%" style="padding:24px 0;">
                <div class="macro-num serif" style="font-family:'Fraunces',Georgia,serif;font-size:30px;color:#F4E9D8;font-weight:300;line-height:1;letter-spacing:-0.5px;">${formatMacroNumberCell(macros.fiber_g)}</div>
                <div style="font-family:'Fraunces',Georgia,serif;font-size:13px;color:#8B7355;font-style:italic;margin-top:8px;">Vláknina</div>
              </td>
            </tr>
          </table>

        </td></tr>`;
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
  const kcalDisplay = dailyKcal != null
    ? `${dailyKcal}`
    : '<span style="color:#6B5E4A">—</span>';

  return `<tr><td class="px-mobile" style="padding:48px 64px 0 64px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid rgba(231,176,98,0.25);border-bottom:1px solid rgba(231,176,98,0.25);">
            <tr>
              <td style="padding:32px 0;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div style="font-family:'Fraunces',Georgia,serif;font-size:14px;color:#8B7355;font-style:italic;letter-spacing:0.5px;">Celkem za den</div>
                    </td>
                    <td align="right" class="serif" style="font-family:'Fraunces',Georgia,serif;font-size:38px;color:#F4E9D8;font-weight:300;letter-spacing:-1.2px;">
                      ${kcalDisplay} <span style="font-size:14px;color:#8B7355;font-style:italic;letter-spacing:0;">kcal</span>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:16px;font-family:'Fraunces',Georgia,serif;font-size:15px;color:#9B8B72;line-height:1.7;font-style:italic;">
                  Bílkoviny ${formatInlineMacro(dailyProtein)} &nbsp;·&nbsp; Sacharidy ${formatInlineMacro(dailyCarbs)} &nbsp;·&nbsp; Tuky ${formatInlineMacro(dailyFat)} &nbsp;·&nbsp; Vláknina ${formatInlineMacro(dailyFiber)}
                </div>
              </td>
            </tr>
          </table>
        </td></tr>`;
}

function renderWorkout(day, coachVoice) {
  const workout = day?.workout || {};
  const exercises = Array.isArray(workout?.exercises)
    ? workout.exercises
    : Array.isArray(day?.exercises)
      ? day.exercises
      : [];

  if (!exercises.length) {
    const restText = coachVoice?.workout_rest_text || 'Pohyb. Dnes odpočinek. Tělo to potřebuje.';
    return `<tr><td class="px-mobile" style="padding:64px 64px 0 64px;">
          <div style="font-family:'Fraunces',Georgia,serif;font-size:14px;color:#E7B062;font-style:italic;letter-spacing:1px;margin-bottom:8px;">
            Pohyb
          </div>
          <div class="meal-name serif" style="font-family:'Fraunces',Georgia,serif;font-size:36px;color:#F4E9D8;font-weight:400;line-height:1.1;letter-spacing:-1px;">
            ${escapeHtml(restText)}
          </div>
        </td></tr>`;
  }

  const intro = coachVoice?.workout_intro || 'Krátký, ale poctivý.';
  const fallback = coachVoice?.workout_fallback || 'Třicet minut. Žádné výmluvy. Pokud nezvládneš všechno, udělej alespoň první cvik.';
  const roman = ['i.', 'ii.', 'iii.', 'iv.', 'v.', 'vi.', 'vii.', 'viii.', 'ix.', 'x.'];

  const exerciseRows = exercises
    .map((ex, idx) => {
      const name = String(ex?.name || ex?.exercise_name || 'Cvik');
      const sets = ex?.sets != null ? String(ex.sets) : '—';
      const reps = ex?.reps != null ? String(ex.reps) : '—';
      const repsUnit = ex?.duration_seconds
        ? `${ex.sets ?? '—'} × ${ex.duration_seconds} s`
        : `${sets} × ${reps}`;
      const numeral = roman[idx] || `${idx + 1}.`;
      const isLast = idx === exercises.length - 1;
      const borderBottom = isLast ? '' : 'border-bottom:1px solid rgba(231,176,98,0.08);';
      return `<tr>
              <td style="padding:24px 0;${borderBottom}">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="font-family:'Fraunces',Georgia,serif;font-size:18px;color:#E7B062;font-style:italic;font-weight:300;width:60px;">${numeral}</td>
                    <td valign="middle" style="font-family:'Fraunces',Georgia,serif;font-size:22px;color:#F4E9D8;font-weight:400;letter-spacing:-0.3px;">${escapeHtml(name)}</td>
                    <td align="right" valign="middle" style="font-family:'Fraunces',Georgia,serif;font-size:18px;color:#B5A081;font-weight:300;font-style:italic;">${escapeHtml(repsUnit)}</td>
                  </tr>
                </table>
              </td>
            </tr>`;
    })
    .join('\n');

  return `<tr><td class="px-mobile" style="padding:64px 64px 0 64px;">

          <div style="font-family:'Fraunces',Georgia,serif;font-size:14px;color:#E7B062;font-style:italic;letter-spacing:1px;margin-bottom:8px;">
            Pohyb
          </div>

          <div class="meal-name serif" style="font-family:'Fraunces',Georgia,serif;font-size:36px;color:#F4E9D8;font-weight:400;line-height:1.1;letter-spacing:-1px;margin-bottom:24px;">
            ${escapeHtml(intro)}
          </div>

          <div style="font-family:'Fraunces',Georgia,serif;font-size:16px;color:#9B8B72;font-style:italic;font-weight:300;line-height:1.7;max-width:480px;margin-bottom:40px;">
            ${escapeHtml(fallback)}
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid rgba(231,176,98,0.12);">
            ${exerciseRows}
          </table>

        </td></tr>`;
}

function renderDayCard(day, index, planJson, appBaseUrl, coachVoice) {
  const dayName = day?.day_name || `Den ${index + 1}`;
  const rawDate = typeof day?.date === 'string' ? day.date.replace(/T.*/, '').slice(0, 10) : '';
  const validFrom = String(planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : /^\d{4}-\d{2}-\d{2}$/.test(validFrom)
      ? addCalendarDaysIsoPrague(validFrom, index)
      : '';
  const dateWords = formatDayDateWords(iso) || formatDayDateNumeric(iso) || '';
  const ordinalDay = dayOrdinalCs(index + 1);
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  const mealsHtml = meals.map((meal) => renderMealCard(meal, day, planJson, appBaseUrl)).join('\n');
  const dailyTotalHtml = renderDailyTotal(day);
  const workoutHtml = renderWorkout(day, coachVoice);

  return `<tr><td class="px-mobile" style="padding:48px 64px 0 64px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg, #2A1A0C 0%, #4A2D14 40%, #7A4F26 75%, #E7B062 100%);">
            <tr>
              <td style="padding:64px 48px;">
                <div style="font-family:'Fraunces',Georgia,serif;font-size:13px;color:rgba(244,233,216,0.6);font-style:italic;letter-spacing:1px;margin-bottom:20px;">
                  ${escapeHtml(ordinalDay)}
                </div>
                <div class="day-headline serif" style="font-family:'Fraunces',Georgia,serif;font-size:56px;color:#F4E9D8;font-weight:300;letter-spacing:-2px;line-height:1.0;">
                  ${escapeHtml(dayName)}<br>
                  <em style="font-style:italic;font-weight:300;color:rgba(244,233,216,0.75);font-size:32px;letter-spacing:-0.5px;">${escapeHtml(dateWords)}</em>
                </div>
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
export function buildWeeklyPlanEmailV4Document(options = {}) {
  const planJson = options.structuredPlanJson;
  const days = Array.isArray(planJson?.days) ? planJson.days : [];
  const targets = planJson?.targets ?? {};
  const bm = options.bodyMetrics && typeof options.bodyMetrics === 'object' ? options.bodyMetrics : {};
  const appBaseUrl = String(options.appBaseUrl || getPublicAppUrl() || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const ctaUrl = String(options.ctaUrl || appBaseUrl).replace(/\/$/, '');
  const rawFirstName = String(options.firstName || bm?.name || '').trim().split(/\s+/)[0] || '';
  const vocativeName = rawFirstName ? toCzechVocative(rawFirstName) : '';
  const validFrom =
    String(options.validFrom || planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10) ||
    (typeof days[0]?.date === 'string' ? days[0].date.replace(/T.*/, '').slice(0, 10) : '');

  const coachVoice = loadCoachVoice();
  const goal = bm?.goal || planJson?.goal;

  const headerDateNumeric =
    formatDayDateNumeric(validFrom) ||
    formatDayDateNumeric(typeof days[0]?.date === 'string' ? days[0].date : '');
  const headerDayName = days[0]?.day_name || 'Pondělí';
  const headerDateLabel = headerDateNumeric
    ? `${headerDayName} · ${headerDateNumeric}`
    : headerDayName;

  const weekNumber = isoWeekNumber(validFrom) ?? 1;
  const motto = getMottoForWeek(weekNumber, coachVoice);
  const coachIntro = getCoachIntro(goal, coachVoice);
  const macroCommentary = getMacroCommentary(goal, coachVoice);
  const kcalLeadIn = getKcalLeadIn(goal, coachVoice);

  const targetKcal = Math.round(Number(targets.calories_per_day) || 0) || null;
  const targetKcalFormatted = targetKcal != null ? formatKcalThousands(targetKcal) : '—';
  const targetsForMacros = {
    protein_g: targets?.protein_g,
    carbs_g: targets?.carbs_g,
    fat_g: targets?.fat_g,
  };
  const macrosHtml = renderMacrosBlock(targetsForMacros, macroCommentary);
  const habitsHtml = renderHabits(extractHabits(planJson));
  const daysHtml = days.map((day, index) => renderDayCard(day, index, planJson, appBaseUrl, coachVoice)).join('\n');

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
    ? `<tr><td style="background:#0B0908;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <table class="container" width="720" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:720px;">
              <tr><td class="px-mobile" style="padding:0 64px 32px 64px;">
                ${options.loginBlock}
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>`
    : '';

  const planChangeNote = options.planChangeContext
    ? `<tr><td style="background:#0B0908;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <table class="container" width="720" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:720px;">
              <tr><td class="px-mobile" style="padding:0 64px 24px 64px;">
                <div style="font-family:'Fraunces',Georgia,serif;font-size:15px;color:#B5A081;font-style:italic;line-height:1.7;padding:20px 24px;background:#15110B;border-left:2px solid #E7B062;">
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

  return applyVars(html, {
    user_vocative: escapeHtml(vocativeName || 'Ahoj'),
    hero_subtitle: escapeHtml(coachVoice?.hero_subtitle || 'Sedm dní. Začínáme.'),
    hero_coach_intro: escapeHtml(coachIntro),
    header_date_label: escapeHtml(headerDateLabel),
    days_count: String(days.length || 7),
    meals_count: String(mealsCount || days.length * 3),
    workouts_count: String(workoutsCount),
    height: escapeHtml(String(bm?.height_cm ?? '—')),
    weight: escapeHtml(String(bm?.weight_kg ?? '—')),
    goal_text: goalTextHtml(goal),
    target_kcal_formatted: targetKcalFormatted,
    kcal_lead_in: escapeHtml(kcalLeadIn),
    weekly_motto: escapeHtml(motto.text),
    weekly_motto_attribution: escapeHtml(motto.attribution),
    coach_signature_text: escapeHtml(coachVoice?.coach_signature_text || 'Drž se. Když budeš mít otázky, napiš mi. Vidíme se za týden.'),
    coach_signature_name: escapeHtml(coachVoice?.coach_signature_name || '— Tvůj kouč'),
    cta_url: escapeHtml(ctaUrl),
  });
}

export default buildWeeklyPlanEmailV4Document;
