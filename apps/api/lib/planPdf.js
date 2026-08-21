/**
 * Generátor HTML pro export jídelníčku do PDF (html2pdf.js).
 * Vizuálně blízký profilu a týdennímu e-mailu včetně odkazů na recepty a nákup.
 */

import { mealDisplayTitleForStructuredMeal } from './mealDisplayNameHelpers.js';
import { mealRecipeUrl } from './mealRecipeLink.js';
import { getPublicAppUrl } from './siteUrls.js';

const BRAND_PURPLE = '#7c3aed';
const BRAND_PURPLE_LIGHT = '#a78bfa';
const PAGE_BG = '#0b1220';
const CARD_BG = 'rgba(255,255,255,0.03)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const TEXT_PRIMARY = '#e9d5ff';
const TEXT_MID = '#cbd5e1';
const TEXT_MUTED = '#94a3b8';

const MEAL_EMOJI = {
  Snídaně: '🌅',
  Oběd: '☀️',
  Večeře: '🌙',
  Svačina: '🍎',
};

const STRUCTURED_MEAL_TYPE_CS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

const MACRO_PILL_STYLES = {
  kcal: { border: 'rgba(167, 139, 250, 0.55)', bg: 'rgba(76, 29, 149, 0.22)', value: '#f8fafc' },
  protein: { border: 'rgba(59, 130, 246, 0.65)', bg: 'rgba(30, 58, 138, 0.22)', value: '#f8fafc' },
  carbs: { border: 'rgba(234, 179, 8, 0.65)', bg: 'rgba(120, 53, 15, 0.22)', value: '#f8fafc' },
  fat: { border: 'rgba(239, 68, 68, 0.65)', bg: 'rgba(127, 29, 29, 0.22)', value: '#f8fafc' },
  fiber: { border: 'rgba(34, 197, 94, 0.65)', bg: 'rgba(20, 83, 45, 0.22)', value: '#f8fafc' },
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainText(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function mealTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (STRUCTURED_MEAL_TYPE_CS[t]) return STRUCTURED_MEAL_TYPE_CS[t];
  if (typeof type === 'string' && type.trim()) return type.trim();
  return 'Jídlo';
}

function mealEmoji(label) {
  return MEAL_EMOJI[label] || '🍽️';
}

function formatCsDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
  } catch (_) {
    return iso;
  }
}

function pickStructuredMealForDay(structDay, mealLabel, fallbackIdx) {
  if (!structDay || !Array.isArray(structDay.meals) || structDay.meals.length === 0) return null;
  const want = String(mealLabel || '').toLowerCase();
  const wantTypeKey = Object.keys(STRUCTURED_MEAL_TYPE_CS).find(
    (k) => STRUCTURED_MEAL_TYPE_CS[k].toLowerCase() === want
  );
  if (wantTypeKey) {
    const hit = structDay.meals.find((m) => String(m?.type || '').toLowerCase() === wantTypeKey);
    if (hit) return hit;
  }
  return structDay.meals[fallbackIdx] ?? null;
}

function macrosForMeal(structMeal) {
  if (!structMeal) return null;
  const r = structMeal.recipe && typeof structMeal.recipe === 'object' ? structMeal.recipe : null;
  const cal = r?.calories ?? structMeal?.calories;
  const protein = r?.protein_g ?? structMeal?.protein_g;
  const carbs = r?.carbs_g ?? structMeal?.carbs_g;
  const fat = r?.fat_g ?? structMeal?.fat_g;
  const fiber = r?.fiber_g ?? structMeal?.fiber_g;
  const out = {};
  if (cal != null && Number.isFinite(Number(cal))) out.cal = Math.round(Number(cal));
  if (protein != null && Number.isFinite(Number(protein))) out.protein = Math.round(Number(protein));
  if (carbs != null && Number.isFinite(Number(carbs))) out.carbs = Math.round(Number(carbs));
  if (fat != null && Number.isFinite(Number(fat))) out.fat = Math.round(Number(fat));
  if (fiber != null && Number.isFinite(Number(fiber))) out.fiber = Math.round(Number(fiber));
  return Object.keys(out).length ? out : null;
}

function macrosForDayTotals(structDay) {
  if (!structDay) return null;
  const t = structDay.totals && typeof structDay.totals === 'object' ? structDay.totals : null;
  if (t) {
    const out = {};
    if (t.calories != null) out.cal = Math.round(Number(t.calories));
    if (t.protein_g != null) out.protein = Math.round(Number(t.protein_g));
    if (t.carbs_g != null) out.carbs = Math.round(Number(t.carbs_g));
    if (t.fat_g != null) out.fat = Math.round(Number(t.fat_g));
    if (Object.keys(out).length) return out;
  }
  if (Array.isArray(structDay.meals) && structDay.meals.length > 0) {
    const out = { cal: 0, protein: 0, carbs: 0, fat: 0 };
    let any = false;
    structDay.meals.forEach((m) => {
      const macros = macrosForMeal(m);
      if (!macros) return;
      any = true;
      if (macros.cal) out.cal += macros.cal;
      if (macros.protein) out.protein += macros.protein;
      if (macros.carbs) out.carbs += macros.carbs;
      if (macros.fat) out.fat += macros.fat;
    });
    return any ? out : null;
  }
  return null;
}

function macroPillHtml(label, value, tone) {
  const style = MACRO_PILL_STYLES[tone] || MACRO_PILL_STYLES.kcal;
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;border:2px solid ${style.border};background:${style.bg};font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.35;">
    <span style="font-weight:700;color:#cbd5e1;">${escapeHtml(label)}</span>
    <span style="font-weight:800;color:${style.value};margin-left:6px;">${escapeHtml(value)}</span>
  </span>`;
}

function macrosRowHtml(macros) {
  if (!macros) return '';
  const parts = [];
  if (macros.cal != null) parts.push(macroPillHtml('cca', `${macros.cal} kcal`, 'kcal'));
  if (macros.protein != null) parts.push(macroPillHtml('Bílkoviny', `${macros.protein} g`, 'protein'));
  if (macros.carbs != null) parts.push(macroPillHtml('Sacharidy', `${macros.carbs} g`, 'carbs'));
  if (macros.fat != null) parts.push(macroPillHtml('Tuky', `${macros.fat} g`, 'fat'));
  if (macros.fiber != null) parts.push(macroPillHtml('Vláknina', `${macros.fiber} g`, 'fiber'));
  if (!parts.length) return '';
  return `<div style="margin:8px 0 0;">${parts.join('')}</div>`;
}

function linkButtonHtml(href, label, accent = BRAND_PURPLE_LIGHT) {
  if (!href) return '';
  const safeHref = escapeHtml(href);
  return `<a href="${safeHref}" style="display:inline-block;margin-top:8px;padding:7px 14px;border-radius:10px;border:1px solid rgba(167,139,250,0.45);background:rgba(124,58,237,0.25);color:${accent};font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a>
    <div style="margin-top:4px;font-family:Helvetica,Arial,monospace;font-size:8px;color:${TEXT_MUTED};word-break:break-all;line-height:1.4;">${safeHref}</div>`;
}

function recipeBlockHtml(structMeal) {
  const url = mealRecipeUrl(structMeal);
  if (!url) return '';
  return linkButtonHtml(url, 'Recept →');
}

function workoutBlockHtml(structDay) {
  const wk = structDay?.workout;
  if (!wk) return '';
  const exercises = Array.isArray(wk.exercises) ? wk.exercises : [];
  const isRest =
    !exercises.length ||
    /odpoč|rest|volno/i.test(String(wk.title || wk.focus || wk.label || '').trim());

  const headTitle = wk.title || wk.focus || wk.label || (isRest ? 'Odpočinek' : 'Trénink');
  let inner = '';
  if (isRest && !exercises.length) {
    inner = `<p style="margin:0;color:${TEXT_MID};font-size:12px;line-height:1.55;font-family:Helvetica,Arial,sans-serif;">Odpočinek</p>`;
  } else {
    const items = exercises
      .map((ex, i) => {
        const name = plainText(
          ex?.name_cs || ex?.name || ex?.label || ex?.title || ex?.exercise_name || ''
        );
        const meta = [];
        if (ex?.sets != null && ex?.reps != null) meta.push(`${ex.sets}×${ex.reps}`);
        else if (ex?.sets != null) meta.push(`${ex.sets} sérií`);
        else if (ex?.reps != null) meta.push(`${ex.reps} opak.`);
        if (ex?.duration_min != null) meta.push(`${ex.duration_min} min`);
        const metaStr = meta.length ? ` · ${meta.join(' · ')}` : '';
        return `<li style="margin:0 0 4px;color:${TEXT_MID};font-size:12px;line-height:1.5;">${escapeHtml(name || `Cvik ${i + 1}`)}<span style="color:${TEXT_MUTED};">${escapeHtml(metaStr)}</span></li>`;
      })
      .join('');
    inner = `<ul style="margin:6px 0 0;padding-left:18px;">${items}</ul>`;
  }

  return `<div style="margin-top:12px;padding:12px 14px;border:1px solid ${CARD_BORDER};border-radius:12px;background:rgba(15,23,42,0.55);page-break-inside:avoid;">
    <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_PURPLE_LIGHT};font-family:Helvetica,Arial,sans-serif;margin-bottom:4px;">Trénink tento den</div>
    <div style="font-size:13px;font-weight:700;color:${TEXT_PRIMARY};font-family:Helvetica,Arial,sans-serif;margin-bottom:4px;">${escapeHtml(plainText(headTitle))}</div>
    ${inner}
  </div>`;
}

function resolveMealTitle(day, meal, mi, mealOverrides, di, planHtml) {
  const overrideKey = `${day.originalIndex ?? di}_${mi}`;
  const override = mealOverrides?.[overrideKey] || null;
  if (override?.title) return plainText(override.title) || 'Jídlo';
  const label = mealTypeLabel(meal?.type);
  const structMeal = pickStructuredMealForDay(day.structDay, label, mi);
  if (structMeal) {
    const fromStruct = mealDisplayTitleForStructuredMeal(structMeal, planHtml || '', day.dayName || '');
    if (fromStruct) return plainText(fromStruct);
  }
  return plainText(meal?.text || meal?.fullHtml || '') || 'Jídlo';
}

function buildDayCard(day, di, mealOverrides, planHtml) {
  const dayName = day.dayName || `Den ${di + 1}`;
  const dateStr = day.dateStr || (day.structDay?.date ? formatCsDate(day.structDay.date) : '');
  const isToday = day.isToday;
  const dayHeaderRight = isToday
    ? `<span style="display:inline-block;background:#ffffff;color:${BRAND_PURPLE};padding:3px 9px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Dnes</span>`
    : dateStr
      ? `<span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#ede9fe;letter-spacing:0.04em;">${escapeHtml(dateStr)}</span>`
      : '';

  const dayTotals = macrosForDayTotals(day.structDay);
  const dayKcalOnly = dayTotals?.cal != null ? Math.round(dayTotals.cal) : null;

  const mealRows = (day.meals || [])
    .map((meal, mi) => {
      const label = mealTypeLabel(meal?.type);
      const dishTitle = resolveMealTitle(day, meal, mi, mealOverrides, di, planHtml);
      const structMeal = pickStructuredMealForDay(day.structDay, label, mi);
      const macros = macrosForMeal(structMeal);
      const recipeHtml = recipeBlockHtml(structMeal);

      return `<tr><td style="padding:0 0 10px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${CARD_BORDER};border-radius:14px;background:${CARD_BG};page-break-inside:avoid;">
          <tr>
            <td width="44" valign="top" style="padding:12px 4px 12px 12px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(124,58,237,0.2);text-align:center;line-height:36px;font-size:18px;">${mealEmoji(label)}</div>
            </td>
            <td valign="top" style="padding:11px 14px 12px 6px;">
              <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_PURPLE_LIGHT};">${escapeHtml(label)}</div>
              <div style="margin-top:2px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.35;">${escapeHtml(dishTitle)}</div>
              ${macrosRowHtml(macros)}
              ${recipeHtml}
            </td>
          </tr>
        </table>
      </td></tr>`;
    })
    .join('');

  const workoutHtml = workoutBlockHtml(day.structDay);
  const dayTotalHtml = dayKcalOnly != null
    ? `<p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${TEXT_MID};"><strong style="color:${TEXT_PRIMARY};">Celkem za den:</strong> ${escapeHtml(dayKcalOnly.toLocaleString('cs-CZ'))} kcal</p>`
    : '';

  return `<div style="page-break-inside:avoid;margin:0 0 18px 0;border:1px solid ${CARD_BORDER};border-radius:16px;overflow:hidden;background:${CARD_BG};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:linear-gradient(135deg,${BRAND_PURPLE} 0%,${BRAND_PURPLE_LIGHT} 100%);">
      <tr>
        <td style="padding:12px 16px;font-family:Helvetica,Arial,sans-serif;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:-0.01em;">${escapeHtml(dayName)}${dateStr && !isToday ? ` (${escapeHtml(dateStr)})` : ''}${isToday ? ' – dnes' : ''}</td>
        <td align="right" style="padding:12px 16px;">${dayHeaderRight}</td>
      </tr>
    </table>
    <div style="padding:12px 14px 14px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${TEXT_MUTED};margin-bottom:8px;font-family:Helvetica,Arial,sans-serif;">Co dnes jíst</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${mealRows}</table>
      ${dayTotalHtml}
      ${workoutHtml}
    </div>
  </div>`;
}

function dailyMacrosBlock(dailyMacros) {
  if (!Array.isArray(dailyMacros) || dailyMacros.length === 0) return '';
  const cells = dailyMacros
    .map((m) => {
      const value = escapeHtml(String(m?.value || '—'));
      const label = escapeHtml(String(m?.label || ''));
      return `<td style="padding:0 6px 0 0;vertical-align:top;width:25%;">
        <div style="text-align:center;background:rgba(15,23,42,0.55);border:2px solid rgba(167,139,250,0.35);border-radius:999px;padding:12px 10px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${BRAND_PURPLE_LIGHT};">${value}</div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};margin-top:2px;">${label}</div>
        </div>
      </td>`;
    })
    .join('');
  return `<div style="page-break-inside:avoid;margin:0 0 16px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${TEXT_PRIMARY};margin-bottom:10px;">Denní cíle · makra</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${cells}</tr></table>
  </div>`;
}

function brandHeader({ planValidFrom, planValidUntil }) {
  const fromStr = planValidFrom ? formatCsDate(String(planValidFrom).split('T')[0]) : '';
  const untilStr = planValidUntil ? formatCsDate(String(planValidUntil).split('T')[0]) : '';
  const dateLine = fromStr && untilStr
    ? `Platnost plánu: ${fromStr} – ${untilStr}`
    : 'Týdenní plán s recepty a pohybem';
  return `<div style="page-break-inside:avoid;margin:0 0 16px;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,#1c1036 0%,#3b1d72 60%,${BRAND_PURPLE} 100%);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:22px 24px 20px;font-family:Helvetica,Arial,sans-serif;color:#ffffff;">
        <div style="display:inline-block;background:rgba(255,255,255,0.12);padding:6px 14px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#f3e8ff;">BODY &amp; MIND ON</div>
        <h1 style="margin:12px 0 6px 0;font-size:24px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;">Tvůj osobní jídelní plán</h1>
        <div style="font-size:12px;font-weight:600;color:#ddd6fe;letter-spacing:0.02em;">${escapeHtml(dateLine)}</div>
      </td></tr>
    </table>
  </div>`;
}

function introBlock() {
  return `<p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${TEXT_MID};">
    Dny níže sledují tvůj uložený týden: jídla, automaticky dopočítaná makra z receptů a kde je dostupný i trénink.
    U každého jídla najdeš odkaz <strong style="color:${TEXT_PRIMARY};">Recept</strong> stejně jako v aplikaci a e-mailu.
  </p>`;
}

function footerBlock({ appBaseUrl, planId }) {
  const appUrl = String(appBaseUrl || getPublicAppUrl()).replace(/\/$/, '');
  const profilUrl = `${appUrl}/profil`;
  const planUrl = planId ? `${appUrl}/plan/${encodeURIComponent(String(planId))}` : appUrl;
  const year = new Date().getFullYear();

  return `<div style="margin-top:22px;padding-top:16px;border-top:1px solid ${CARD_BORDER};font-family:Helvetica,Arial,sans-serif;color:${TEXT_MUTED};font-size:11px;line-height:1.65;">
    <div style="font-size:12px;font-weight:700;color:${TEXT_PRIMARY};margin-bottom:8px;">Odkazy</div>
    <div style="margin-bottom:6px;">${linkButtonHtml(profilUrl, 'Plán v aplikaci (profil)')}</div>
    <div style="margin-bottom:6px;">${linkButtonHtml(planUrl, planId ? 'Plán v prohlížeči' : 'Aplikace Body & Mind ON')}</div>
    <div style="margin:14px 0 6px;font-size:12px;font-weight:700;color:${TEXT_PRIMARY};">Nákup surovin</div>
    <p style="margin:0 0 8px;color:${TEXT_MID};font-size:11px;">Seznam surovin najdeš v aplikaci u každého dne. Objednat můžeš přes:</p>
    <div style="margin-bottom:6px;">${linkButtonHtml('https://www.rohlik.cz/', 'Rohlík.cz')}</div>
    <div style="margin-bottom:6px;">${linkButtonHtml('https://www.kosik.cz/', 'Košík.cz')}</div>
    <div style="margin-bottom:10px;">${linkButtonHtml('https://shop.billa.cz/', 'Billa e-shop')}</div>
    <p style="margin:0;text-align:center;font-size:10px;color:${TEXT_MUTED};">&copy; ${year} Body &amp; Mind ON · ${escapeHtml(appUrl.replace(/^https?:\/\//, ''))}</p>
  </div>`;
}

/**
 * Postaví HTML pro PDF export jídelníčku.
 * @param {object} args
 * @param {Array} args.days – planWeekDays z PlanViewer
 * @param {object} [args.mealOverrides]
 * @param {string} [args.planValidFrom]
 * @param {string} [args.planValidUntil]
 * @param {Array<{label:string,value:string}>} [args.dailyMacros]
 * @param {string|null} [args.planId]
 * @param {string} [args.appBaseUrl]
 * @param {string} [args.planHtml]
 * @returns {string}
 */
export function buildPlanPdfHtml({
  days,
  mealOverrides,
  planValidFrom,
  planValidUntil,
  dailyMacros,
  planId,
  appBaseUrl,
  planHtml,
}) {
  const safeDays = Array.isArray(days) ? days : [];
  const baseUrl = appBaseUrl || getPublicAppUrl();
  const dayCards = safeDays.map((d, i) => buildDayCard(d, i, mealOverrides || {}, planHtml || '')).join('');
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:${TEXT_PRIMARY};background:${PAGE_BG};padding:18px;">
    ${brandHeader({ planValidFrom, planValidUntil })}
    ${dailyMacrosBlock(dailyMacros)}
    ${introBlock()}
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:${TEXT_PRIMARY};margin:0 0 10px;">Týden po dnech</div>
    ${dayCards}
    ${footerBlock({ appBaseUrl: baseUrl, planId: planId || null })}
  </div>`;
}
