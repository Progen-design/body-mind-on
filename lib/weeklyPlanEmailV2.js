import { readFileSync } from 'fs';
import { join } from 'path';
import { escapeHtml } from './emailTemplates.js';
import { mealDisplayTitleForStructuredMeal } from './mealDisplayNameHelpers.js';
import { addCalendarDaysIsoPrague } from './czechCalendar.js';
import { getPublicAppUrl } from './siteUrls.js';

const MEAL_TYPE_LABELS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

const MEAL_THEME = {
  breakfast: {
    icon: '☀',
    time: '07:30',
    color: '#FBBF24',
    gradient: 'rgba(251,191,36,0.18)',
    cardGradient: 'rgba(251,191,36,0.06)',
  },
  lunch: {
    icon: '◐',
    time: '13:00',
    color: '#A855F7',
    gradient: 'rgba(168,85,247,0.18)',
    cardGradient: 'rgba(168,85,247,0.06)',
  },
  dinner: {
    icon: '☾',
    time: '19:00',
    color: '#EC4899',
    gradient: 'rgba(236,72,153,0.18)',
    cardGradient: 'rgba(236,72,153,0.06)',
  },
  snack: {
    icon: '◆',
    time: '16:00',
    color: '#22D3EE',
    gradient: 'rgba(34,211,238,0.18)',
    cardGradient: 'rgba(34,211,238,0.06)',
  },
};

const DAY_SHORT = {
  Pondělí: 'PO',
  Úterý: 'UT',
  Středa: 'ST',
  Čtvrtek: 'CT',
  Pátek: 'PA',
  Sobota: 'SO',
  Neděle: 'NE',
};

const HABIT_COLORS = ['#A855F7', '#EC4899', '#22D3EE', '#FBBF24', '#10B981'];
const MONTHS_CS = [
  'ledna',
  'února',
  'března',
  'dubna',
  'května',
  'června',
  'července',
  'srpna',
  'září',
  'října',
  'listopadu',
  'prosince',
];

let cachedTemplate = null;

function loadTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const path = join(process.cwd(), 'lib', 'templates', 'bmon_weekly_plan_email_v2.html');
  cachedTemplate = readFileSync(path, 'utf8');
  return cachedTemplate;
}

function goalLabelCs(goal) {
  const map = { redukce: 'Redukce', nabirani_svaly: 'Nabírání svalů', udrzovani: 'Udržování' };
  return map[goal] || 'Udržování';
}

function formatDateCsLong(isoDateYmd) {
  const iso = String(isoDateYmd || '').replace(/T.*/, '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${MONTHS_CS[m - 1]} ${y}`;
}

function isoWeekNumber(isoDateYmd) {
  const iso = String(isoDateYmd || '').replace(/T.*/, '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const date = new Date(`${iso}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return String(Math.ceil(((date - yearStart) / 86400000 + 1) / 7)).padStart(2, '0');
}

function macroBarPairFromTarget(target, maxTarget) {
  const t = Number(target) || 0;
  const max = Number(maxTarget) || 1;
  const width = Math.min(100, Math.max(8, Math.round((t / max) * 100)));
  return { width, rest: 100 - width };
}

function applyVars(html, vars) {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value == null ? '' : String(value));
  }
  return out;
}

function mealRecipeUrl(meal, appBaseUrl) {
  const recipeId = meal?.recipe?.id ?? meal?.recipe_id ?? null;
  const ridNum = recipeId != null && Number.isFinite(Number(recipeId)) ? Number(recipeId) : null;
  if (ridNum == null) return '';
  return `${appBaseUrl}/api/spoonacular-recipe?id=${ridNum}&format=html`;
}

function mealMacros(meal) {
  const r = meal?.recipe;
  if (!r || meal?.recipe_verified !== true) {
    return { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, calories: 0 };
  }
  return {
    protein_g: Math.round(Number(r.protein_g) || 0),
    carbs_g: Math.round(Number(r.carbs_g) || 0),
    fat_g: Math.round(Number(r.fat_g) || 0),
    fiber_g: Math.round(Number(r.fiber_g) || 0),
    calories: Math.round(Number(r.calories) || 0),
  };
}

function renderMacroCell(label, value, color, borderRight) {
  const border = borderRight ? 'border-right:1px solid #2A2440;padding-right:16px;' : 'padding-left:16px;';
  const pad = borderRight && label !== 'Bílkoviny' ? 'padding:0 16px;border-right:1px solid #2A2440;' : border;
  return `<td width="25%" style="${pad}">
      <div class="macro-label" style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:${color};letter-spacing:0.5px;font-weight:700;text-transform:uppercase;">${escapeHtml(label)}</div>
      <div class="macro-num" style="font-family:'JetBrains Mono',monospace;font-size:26px;color:#FFFFFF;font-weight:700;margin-top:6px;line-height:1;">${value}<span style="font-size:13px;color:#6B6480;font-weight:400;"> g</span></div>
    </td>`;
}

function renderMealCard(meal, day, planJson, appBaseUrl) {
  const type = meal?.type ?? 'breakfast';
  const theme = MEAL_THEME[type] || MEAL_THEME.breakfast;
  const label = MEAL_TYPE_LABELS[type] || type;
  const dayName = day?.day_name ?? day?.date ?? 'Den';
  const title = mealDisplayTitleForStructuredMeal(meal, planJson?.html || '', dayName);
  const recipeUrl = mealRecipeUrl(meal, appBaseUrl);
  const macros = mealMacros(meal);
  const topPad = type === 'breakfast' ? '12px' : '10px';
  const recipeBtn = recipeUrl
    ? `<a href="${escapeHtml(recipeUrl)}" class="btn-recipe" style="display:inline-block;padding:12px 18px;background:#1F1A2E;border:1px solid ${theme.color};font-family:'JetBrains Mono',monospace;font-size:11px;color:${theme.color};letter-spacing:1.5px;font-weight:700;text-decoration:none;">RECEPT →</a>`
    : '';

  return `<tr><td class="px-mobile" style="padding:${topPad} 40px 0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#15101F;border:1px solid #2A2440;background-image:linear-gradient(135deg, ${theme.cardGradient} 0%, transparent 50%);">
            <tr>
              <td style="background:linear-gradient(90deg, ${theme.gradient} 0%, rgba(0,0,0,0.02) 100%);padding:16px 28px;border-bottom:1px solid #2A2440;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${theme.color};letter-spacing:3px;font-weight:700;">
                  ${theme.icon} &nbsp; ${escapeHtml(label)} &nbsp;·&nbsp; ${theme.time}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div class="meal-name" style="font-family:'Inter',Arial,sans-serif;font-size:24px;color:#FFFFFF;font-weight:700;line-height:1.2;">${escapeHtml(title || 'Zdravé jídlo')}</div>
                    </td>
                    <td align="right" valign="top">${recipeBtn}</td>
                  </tr>
                </table>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                  <tr>
                    ${renderMacroCell('Bílkoviny', macros.protein_g, '#22D3EE', true)}
                    ${renderMacroCell('Sacharidy', macros.carbs_g, '#FBBF24', true)}
                    ${renderMacroCell('Tuky', macros.fat_g, '#EC4899', true)}
                    ${renderMacroCell('Vláknina', macros.fiber_g, '#10B981', false)}
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>`;
}

function renderExercises(exercises) {
  if (!Array.isArray(exercises) || !exercises.length) {
    return `<div class="body-text" style="font-size:18px;color:#9690AB;line-height:1.6;">Odpočinek nebo lehká aktivita.</div>`;
  }
  return exercises
    .map((ex, idx) => {
      const name = escapeHtml(ex?.name || ex?.exercise_name || 'Cvik');
      const sets = ex?.sets != null ? String(ex.sets) : '—';
      const reps = ex?.reps != null ? String(ex.reps) : '—';
      const num = String(idx + 1).padStart(2, '0');
      const mb = idx < exercises.length - 1 ? 'margin-bottom:10px;' : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${mb}">
                  <tr>
                    <td width="56" style="background:#1F1A2E;text-align:center;font-family:'JetBrains Mono',monospace;font-size:18px;color:#EC4899;font-weight:700;padding:18px 0;">${num}</td>
                    <td style="padding:18px 24px;background:#0D0A1A;">
                      <div class="body-text" style="font-size:18px;color:#FFFFFF;font-weight:600;">${name}</div>
                    </td>
                    <td align="right" style="padding:18px 24px;background:#0D0A1A;font-family:'JetBrains Mono',monospace;font-size:18px;color:#22D3EE;font-weight:700;">${escapeHtml(sets)} × ${escapeHtml(reps)}</td>
                  </tr>
                </table>`;
    })
    .join('\n');
}

function renderDayCard(day, index, totalDays, appBaseUrl, planJson) {
  const dayIndex = String(index + 1).padStart(2, '0');
  const total = String(totalDays).padStart(2, '0');
  const dayName = day?.day_name || `Den ${index + 1}`;
  const dayShort = DAY_SHORT[dayName] || dayName.slice(0, 2).toUpperCase();
  const rawDate = typeof day?.date === 'string' ? day.date.replace(/T.*/, '').slice(0, 10) : '';
  const validFrom = String(planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : /^\d{4}-\d{2}-\d{2}$/.test(validFrom)
      ? addCalendarDaysIsoPrague(validFrom, index)
      : '';
  const dateCs = formatDateCsLong(iso);

  const meals = Array.isArray(day?.meals) ? day.meals : [];
  let dailyKcal = 0;
  let dailyProtein = 0;
  let dailyCarbs = 0;
  let dailyFat = 0;
  let dailyFiber = 0;
  for (const meal of meals) {
    const m = mealMacros(meal);
    dailyKcal += m.calories;
    dailyProtein += m.protein_g;
    dailyCarbs += m.carbs_g;
    dailyFat += m.fat_g;
    dailyFiber += m.fiber_g;
  }

  const workout = day?.workout || {};
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : Array.isArray(day?.exercises) ? day.exercises : [];
  const mealsHtml = meals.map((meal) => renderMealCard(meal, day, planJson, appBaseUrl)).join('\n');
  const bottomPad = index === totalDays - 1 ? '32px 40px 64px 40px' : '24px 40px 0 40px';

  return `<tr><td class="px-mobile" style="padding:${bottomPad};">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#7C3AED 0%,#A855F7 40%,#EC4899 100%);background-image:linear-gradient(135deg,#7C3AED 0%,#A855F7 40%,#EC4899 100%);">
            <tr>
              <td style="padding:28px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#FFFFFF;letter-spacing:3px;font-weight:700;opacity:0.85;margin-bottom:8px;">▌ DEN ${dayIndex} / ${total}</div>
                      <div class="day-headline" style="font-family:'Inter',Arial,sans-serif;font-size:30px;color:#FFFFFF;font-weight:800;letter-spacing:-0.8px;line-height:1.1;">${escapeHtml(dayName)}<br>${escapeHtml(dateCs)}</div>
                    </td>
                    <td align="right" valign="top" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#FFFFFF;letter-spacing:2px;font-weight:700;opacity:0.9;">
                      ${escapeHtml(dayShort)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>
        ${mealsHtml}
        <tr><td class="px-mobile" style="padding:16px 40px 0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#08060F;border:1px solid #A855F7;background-image:linear-gradient(90deg, rgba(168,85,247,0.08) 0%, rgba(236,72,153,0.08) 100%);">
            <tr>
              <td style="padding:24px 28px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#A855F7;letter-spacing:3px;font-weight:700;">▌ DENNÍ SOUČET</div>
                    </td>
                    <td align="right" style="font-family:'JetBrains Mono',monospace;font-size:24px;color:#FFFFFF;font-weight:700;">
                      ${dailyKcal} <span style="font-size:12px;color:#6B6480;letter-spacing:2px;">KCAL</span>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:14px;font-family:'Inter',Arial,sans-serif;font-size:14px;color:#B8B0CC;line-height:1.6;">
                  Bílkoviny <span style="color:#22D3EE;font-weight:700;">${dailyProtein} g</span> &nbsp;·&nbsp; Sacharidy <span style="color:#FBBF24;font-weight:700;">${dailyCarbs} g</span> &nbsp;·&nbsp; Tuky <span style="color:#EC4899;font-weight:700;">${dailyFat} g</span> &nbsp;·&nbsp; Vláknina <span style="color:#10B981;font-weight:700;">${dailyFiber} g</span>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td class="px-mobile" style="padding:24px 40px 0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#15101F;border:1px solid #2A2440;border-left:4px solid #EC4899;background-image:linear-gradient(135deg, rgba(236,72,153,0.08) 0%, transparent 70%);">
            <tr>
              <td style="padding:28px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#EC4899;letter-spacing:3px;font-weight:700;margin-bottom:8px;">▌ POHYB · TRÉNINK</div>
                <div class="meal-name" style="font-family:'Inter',Arial,sans-serif;font-size:22px;color:#FFFFFF;font-weight:700;margin-bottom:20px;">Aktivita pro tento den</div>
                ${renderExercises(exercises)}
                <div class="body-text" style="margin-top:18px;font-size:14px;color:#9690AB;line-height:1.6;">
                  Popis pohybu, videa a úpravy plánu máš v <a href="${escapeHtml(appBaseUrl)}" style="color:#EC4899;text-decoration:underline;font-weight:600;">aplikaci</a> po přihlášení.
                </div>
              </td>
            </tr>
          </table>
        </td></tr>`;
}

function extractHabits(planJson) {
  const candidates = [planJson?.habits, planJson?.mindset_week, planJson?.mindset];
  for (const item of candidates) {
    if (Array.isArray(item) && item.length) {
      return item
        .map((row) => (typeof row === 'string' ? row : row?.text || row?.title || ''))
        .map((row) => String(row || '').trim())
        .filter(Boolean)
        .slice(0, 5);
    }
  }
  return ['Drž se plánu.', 'Odpočívej mezi tréninky.', 'Dodržuj pitný režim.'];
}

function renderHabits(habits) {
  return habits
    .map((text, idx) => {
      const color = HABIT_COLORS[idx % HABIT_COLORS.length];
      const textColor = color === '#22D3EE' ? '#08060F' : '#FFFFFF';
      const num = String(idx + 1).padStart(2, '0');
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#15101F;border:1px solid #2A2440;margin-bottom:10px;">
            <tr>
              <td width="60" style="background:${color};text-align:center;font-family:'JetBrains Mono',monospace;font-size:22px;color:${textColor};font-weight:700;padding:24px 0;">${num}</td>
              <td class="body-text" style="padding:24px 28px;font-size:18px;color:#FFFFFF;font-weight:600;">${escapeHtml(text)}</td>
            </tr>
          </table>`;
    })
    .join('\n');
}

function countWorkoutDays(days) {
  let count = 0;
  for (const day of days) {
    const workout = day?.workout || {};
    const exercises = Array.isArray(workout?.exercises) ? workout.exercises : Array.isArray(day?.exercises) ? day.exercises : [];
    if (exercises.length) count += 1;
  }
  return count;
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
export function buildWeeklyPlanEmailV2Document(options = {}) {
  const planJson = options.structuredPlanJson;
  const days = Array.isArray(planJson?.days) ? planJson.days : [];
  const targets = planJson?.targets ?? {};
  const bm = options.bodyMetrics && typeof options.bodyMetrics === 'object' ? options.bodyMetrics : {};
  const appBaseUrl = String(options.appBaseUrl || getPublicAppUrl() || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const ctaUrl = String(options.ctaUrl || appBaseUrl).replace(/\/$/, '');
  const firstName = String(options.firstName || bm?.name || '').trim().split(/\s+/)[0] || 'ty';
  const validFrom =
    String(options.validFrom || planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10) ||
    (typeof days[0]?.date === 'string' ? days[0].date.replace(/T.*/, '').slice(0, 10) : '');
  const year = validFrom.slice(0, 4) || String(new Date().getFullYear());
  const weekNumber = isoWeekNumber(validFrom) || '01';

  const targetKcal = Math.round(Number(targets.calories_per_day) || 2000);
  const targetProtein = Math.round(Number(targets.protein_g) || 120);
  const targetCarbs = Math.round(Number(targets.carbs_g) || 220);
  const targetFat = Math.round(Number(targets.fat_g) || 65);
  const maxMacroTarget = Math.max(targetProtein, targetCarbs, targetFat, 1);
  const proteinBar = macroBarPairFromTarget(targetProtein, maxMacroTarget);
  const carbsBar = macroBarPairFromTarget(targetCarbs, maxMacroTarget);
  const fatBar = macroBarPairFromTarget(targetFat, maxMacroTarget);

  const mealsCount = days.reduce((sum, day) => sum + (Array.isArray(day?.meals) ? day.meals.length : 0), 0);
  const workoutsCount = Number(planJson?.workouts_per_week) || countWorkoutDays(days);

  let html = loadTemplate();
  const daysHtml = days.map((day, index) => renderDayCard(day, index, days.length, appBaseUrl, planJson)).join('\n');
  const habitsHtml = renderHabits(extractHabits(planJson));

  const loginBlock = options.loginBlock ? String(options.loginBlock) : '';
  const planChangeNote = options.planChangeContext
    ? `<tr><td align="center"><table class="container" width="720" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:720px;"><tr><td class="px-mobile" style="padding:16px 40px 0 40px;"><div style="font-size:15px;color:#B8B0CC;line-height:1.6;padding:18px 22px;background:#15101F;border-left:3px solid #FBBF24;">Aktualizovali jsme tvůj týdenní plán podle nejnovějších preferencí.</div></td></tr></table></td></tr>`
  : '';

  html = html.replace('<!--BMON_LOGIN_BLOCK-->', loginBlock);
  html = html.replace('<!--BMON_HABITS-->', habitsHtml);
  html = html.replace('<!--BMON_DAYS-->', daysHtml);

  if (planChangeNote) {
    html = html.replace('<!-- ============ HERO SECTION', `${planChangeNote}\n<!-- ============ HERO SECTION`);
  }

  return applyVars(html, {
    user_name: escapeHtml(firstName),
    week_number: escapeHtml(weekNumber),
    year: escapeHtml(year),
    height: escapeHtml(String(bm?.height_cm ?? '—')),
    weight: escapeHtml(String(bm?.weight_kg ?? '—')),
    goal: escapeHtml(goalLabelCs(bm?.goal)),
    target_kcal: escapeHtml(String(targetKcal)),
    target_protein_g: escapeHtml(String(targetProtein)),
    target_carbs_g: escapeHtml(String(targetCarbs)),
    target_fat_g: escapeHtml(String(targetFat)),
    protein_bar_width: proteinBar.width,
    protein_bar_rest: proteinBar.rest,
    carbs_bar_width: carbsBar.width,
    carbs_bar_rest: carbsBar.rest,
    fat_bar_width: fatBar.width,
    fat_bar_rest: fatBar.rest,
    days_count: String(days.length || 7).padStart(2, '0'),
    meals_count: String(mealsCount || days.length * 3).padStart(2, '0'),
    workouts_count: String(workoutsCount).padStart(2, '0'),
    app_base_url: escapeHtml(appBaseUrl),
    cta_url: escapeHtml(ctaUrl),
  });
}
