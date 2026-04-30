/**
 * Generátor HTML pro export jídelníčku do PDF (html2pdf.js).
 * Dark/colour design optimalizovaný pro tisk: bílé pozadí, purple akcenty.
 */

const BRAND_PURPLE = '#7c3aed';
const BRAND_PURPLE_LIGHT = '#a78bfa';
const TEXT_DARK = '#0f172a';
const TEXT_MID = '#475569';
const TEXT_MUTED = '#64748b';
const SURFACE_PAPER = '#ffffff';
const SURFACE_SOFT = '#f8fafc';
const SURFACE_BORDER = '#e2e8f0';

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
  const out = {};
  if (cal != null && Number.isFinite(Number(cal))) out.cal = Math.round(Number(cal));
  if (protein != null && Number.isFinite(Number(protein))) out.protein = Math.round(Number(protein));
  if (carbs != null && Number.isFinite(Number(carbs))) out.carbs = Math.round(Number(carbs));
  if (fat != null && Number.isFinite(Number(fat))) out.fat = Math.round(Number(fat));
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

function macroPillCell(label, value, unit, fillBg, borderColor, textColor) {
  return `<td style="padding:6px 6px 0 0;vertical-align:top;width:25%;"><div style="display:block;background:${fillBg};border:1px solid ${borderColor};border-radius:10px;padding:9px 10px;font-family:Helvetica,Arial,sans-serif;color:${textColor};line-height:1.2;text-align:left;">
    <div style="font-size:8px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">${escapeHtml(label)}</div>
    <div style="margin-top:3px;font-size:13px;font-weight:800;">${escapeHtml(String(value))}<span style="font-size:9px;font-weight:700;opacity:0.7;margin-left:2px;">${escapeHtml(unit)}</span></div>
  </div></td>`;
}

function macrosRow(macros) {
  if (!macros) return '';
  const cells = [];
  if (macros.cal != null) cells.push(macroPillCell('Kcal', macros.cal, 'kcal', '#f5f3ff', '#ddd6fe', '#5b21b6'));
  if (macros.protein != null) cells.push(macroPillCell('Bílk.', macros.protein, 'g', '#eff6ff', '#bfdbfe', '#1d4ed8'));
  if (macros.carbs != null) cells.push(macroPillCell('Sach.', macros.carbs, 'g', '#fefce8', '#fde68a', '#a16207'));
  if (macros.fat != null) cells.push(macroPillCell('Tuky', macros.fat, 'g', '#fef2f2', '#fecaca', '#b91c1c'));
  if (!cells.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;"><tr>${cells.join('')}</tr></table>`;
}

function workoutBlockHtml(structDay) {
  const wk = structDay?.workout;
  if (!wk) return '';
  const exercises = Array.isArray(wk.exercises) ? wk.exercises : [];
  const isRest =
    !exercises.length ||
    /odpoč|rest|volno/i.test(String(wk.title || wk.focus || wk.label || '').trim());
  if (!exercises.length && !isRest) return '';

  const headTitle = wk.title || wk.focus || wk.label || 'Pohyb';
  const intro = wk.intro || wk.description || '';
  let inner = '';
  if (isRest && !exercises.length) {
    inner = `<p style="margin:0;color:${TEXT_MID};font-size:11px;line-height:1.55;font-family:Helvetica,Arial,sans-serif;">Volný den — krátká procházka, lehký strečink nebo jen kvalitní spánek.</p>`;
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
        if (ex?.rest_sec != null) meta.push(`pauza ${ex.rest_sec}s`);
        const metaStr = meta.length ? ` · ${meta.join(' · ')}` : '';
        const safeName = escapeHtml(name || `Cvik ${i + 1}`);
        return `<tr>
          <td width="22" valign="top" style="padding:4px 6px 4px 0;">
            <div style="width:18px;height:18px;border-radius:9px;background:${BRAND_PURPLE};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:800;text-align:center;line-height:18px;">${i + 1}</div>
          </td>
          <td valign="top" style="padding:4px 0;font-family:Helvetica,Arial,sans-serif;color:${TEXT_DARK};font-size:11px;line-height:1.5;font-weight:600;">${safeName}<span style="color:${TEXT_MUTED};font-weight:500;">${escapeHtml(metaStr)}</span></td>
        </tr>`;
      })
      .join('');
    inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${items}</table>`;
  }

  const introHtml = intro
    ? `<p style="margin:0 0 6px;color:${TEXT_MID};font-size:11px;line-height:1.5;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(plainText(intro))}</p>`
    : '';

  return `<div style="margin-top:10px;padding:10px 12px;border:1px solid ${SURFACE_BORDER};border-radius:10px;background:${SURFACE_SOFT};page-break-inside:avoid;">
    <div style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_PURPLE};font-family:Helvetica,Arial,sans-serif;">Pohyb v tento den</div>
    <div style="margin:2px 0 6px;font-size:13px;font-weight:800;color:${TEXT_DARK};font-family:Helvetica,Arial,sans-serif;">${escapeHtml(plainText(headTitle))}</div>
    ${introHtml}${inner}
  </div>`;
}

function buildDayCard(day, di, mealOverrides) {
  const dayName = day.dayName || `Den ${di + 1}`;
  const dateStr = day.dateStr || (day.structDay?.date ? formatCsDate(day.structDay.date) : '');
  const isToday = day.isToday;
  const dayHeaderRight = isToday
    ? `<span style="display:inline-block;background:#ffffff;color:${BRAND_PURPLE};padding:3px 9px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Dnes</span>`
    : dateStr
      ? `<span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#ede9fe;letter-spacing:0.04em;">${escapeHtml(dateStr)}</span>`
      : '';

  const dayTotals = macrosForDayTotals(day.structDay);
  const dayTotalsHtml = dayTotals ? `<div style="padding:10px 14px;background:${SURFACE_SOFT};border-bottom:1px solid ${SURFACE_BORDER};">
    <div style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${TEXT_MUTED};margin-bottom:4px;font-family:Helvetica,Arial,sans-serif;">Orientační součet dne</div>
    ${macrosRow(dayTotals)}
  </div>` : '';

  const mealRows = (day.meals || [])
    .map((meal, mi) => {
      const overrideKey = `${day.originalIndex ?? di}_${mi}`;
      const override = mealOverrides?.[overrideKey] || null;
      const label = mealTypeLabel(meal?.type);
      const titleRaw = override
        ? override.title || ''
        : meal?.text || meal?.fullHtml || '';
      const dishTitle = plainText(titleRaw) || 'Jídlo';
      const structMeal = pickStructuredMealForDay(day.structDay, label, mi);
      const macros = !override ? macrosForMeal(structMeal) : null;

      return `<tr><td style="padding:0 0 8px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${SURFACE_BORDER};border-radius:12px;background:${SURFACE_PAPER};page-break-inside:avoid;">
          <tr>
            <td width="44" valign="top" style="padding:12px 4px 12px 12px;">
              <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#ede9fe,#ddd6fe);text-align:center;line-height:36px;font-size:18px;">${mealEmoji(label)}</div>
            </td>
            <td valign="top" style="padding:11px 14px 12px 6px;">
              <div style="font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_PURPLE};">${escapeHtml(label)}</div>
              <div style="margin-top:2px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:${TEXT_DARK};line-height:1.35;">${escapeHtml(dishTitle)}</div>
              ${macrosRow(macros)}
            </td>
          </tr>
        </table>
      </td></tr>`;
    })
    .join('');

  const workoutHtml = workoutBlockHtml(day.structDay);

  return `<div style="page-break-inside:avoid;margin:0 0 16px 0;border:1px solid ${SURFACE_BORDER};border-radius:14px;overflow:hidden;background:${SURFACE_PAPER};box-shadow:0 1px 0 rgba(15,23,42,0.04);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:linear-gradient(135deg,${BRAND_PURPLE} 0%,${BRAND_PURPLE_LIGHT} 100%);">
      <tr>
        <td style="padding:12px 16px;font-family:Helvetica,Arial,sans-serif;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:-0.01em;">${escapeHtml(dayName)}</td>
        <td align="right" style="padding:12px 16px;">${dayHeaderRight}</td>
      </tr>
    </table>
    ${dayTotalsHtml}
    <div style="padding:12px 14px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${mealRows}</table>
      ${workoutHtml}
    </div>
  </div>`;
}

function brandHeader({ planValidFrom, planValidUntil }) {
  const fromStr = planValidFrom ? formatCsDate(planValidFrom) : '';
  const untilStr = planValidUntil ? formatCsDate(planValidUntil) : '';
  const dateLine = fromStr && untilStr
    ? `Platnost plánu: ${fromStr} – ${untilStr}`
    : 'Týdenní plán s recepty a pohybem';
  return `<div style="page-break-inside:avoid;margin:0 0 18px;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,#1c1036 0%,#3b1d72 60%,${BRAND_PURPLE} 100%);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:24px 26px 22px 26px;font-family:Helvetica,Arial,sans-serif;color:#ffffff;">
        <div style="display:inline-block;background:rgba(255,255,255,0.12);padding:6px 14px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#f3e8ff;">BODY &amp; MIND ON</div>
        <h1 style="margin:14px 0 6px 0;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;">Tvůj týdenní plán</h1>
        <div style="font-size:12px;font-weight:600;color:#ddd6fe;letter-spacing:0.02em;">${escapeHtml(dateLine)}</div>
      </td></tr>
    </table>
  </div>`;
}

function footerBlock() {
  const year = new Date().getFullYear();
  return `<div style="margin-top:20px;padding-top:14px;border-top:1px solid ${SURFACE_BORDER};font-family:Helvetica,Arial,sans-serif;color:${TEXT_MUTED};font-size:10px;line-height:1.5;text-align:center;">
    Recepty, suroviny a videa cviků najdeš v aplikaci na <a href="https://www.bodyandmindon.cz" style="color:${BRAND_PURPLE};text-decoration:none;font-weight:700;">www.bodyandmindon.cz</a> · &copy; ${year} Body &amp; Mind ON
  </div>`;
}

/**
 * Postaví HTML pro PDF export jídelníčku.
 * @param {object} args
 * @param {Array} args.days – planWeekDays z PlanViewer
 * @param {object} [args.mealOverrides]
 * @param {string} [args.planValidFrom]
 * @param {string} [args.planValidUntil]
 * @returns {string}
 */
export function buildPlanPdfHtml({ days, mealOverrides, planValidFrom, planValidUntil }) {
  const safeDays = Array.isArray(days) ? days : [];
  const dayCards = safeDays.map((d, i) => buildDayCard(d, i, mealOverrides || {})).join('');
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:${TEXT_DARK};background:${SURFACE_PAPER};padding:18px;">
    ${brandHeader({ planValidFrom, planValidUntil })}
    ${dayCards}
    ${footerBlock()}
  </div>`;
}
