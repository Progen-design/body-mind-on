/**
 * Šablony a transformace HTML pro transakční e-maily s plánem.
 * Inline CSS + tabulky kvůli Gmailu / Outlooku.
 */

import { getPublicAppUrl } from './siteUrls.js';
import {
  getPlanOutputMode,
  shouldIncludeTrainingInEmail,
  shouldStripMediaFromPlanEmail,
} from './planOutputMode.js';

export function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Odstraní potenciálně nebezpečné tagy z HTML (script, style, iframe, on* atributy). */
export function sanitizePlanHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
  return s.trim();
}

const EMAIL_TEXT = '#e8ecf4';
const EMAIL_MUTED = '#94a3b8';
const EMAIL_CARD = '#14121f';
const EMAIL_BG = '#0a0814';
const EMAIL_ACCENT = '#a78bfa';
const EMAIL_ACCENT_DEEP = '#7c3aed';

function goalLabelCs(goal) {
  const map = { redukce: 'Redukce', nabirani_svaly: 'Nabírání svalů', udrzovani: 'Udržování' };
  return map[goal] || 'Udržování';
}

/** Premium hero card s gradient pruhem a velkým štítkem nahoře. */
function buildEmailHeroCard({ label, accent = '#a78bfa', innerHtml }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-radius:18px;border:1px solid rgba(167,139,250,0.28);overflow:hidden;font-family:Arial,sans-serif;background-color:${EMAIL_CARD};" bgcolor="${EMAIL_CARD}">
  <tr><td bgcolor="${accent}" height="3" style="height:3px;font-size:3px;line-height:3px;background-color:${accent};">&nbsp;</td></tr>
  <tr><td bgcolor="${EMAIL_CARD}" style="padding:16px 18px 6px;background-color:${EMAIL_CARD};color:${accent};font-weight:800;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-family:Arial,sans-serif;">${escapeHtml(label)}</td></tr>
  <tr><td bgcolor="${EMAIL_CARD}" style="padding:6px 18px 18px;background-color:${EMAIL_CARD};color:${EMAIL_TEXT};font-family:Arial,sans-serif;">${innerHtml}</td></tr>
</table>`;
}

/** Sloupec se statistickou hodnotou — ikona, popisek, hodnota. */
function buildStatColumn({ icon, label, value, valueColor = '#ffffff', bgColor = '#1d1532', borderColor = 'rgba(167,139,250,0.28)' }) {
  return `<td valign="top" align="center" width="33%" style="padding:6px 5px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bgColor}" style="border-collapse:separate;background-color:${bgColor};border:1px solid ${borderColor};border-radius:14px;">
      <tr><td align="center" style="padding:14px 6px 12px;font-family:Arial,sans-serif;">
        <div style="font-size:22px;line-height:1;">${icon}</div>
        <div style="margin:8px 0 4px;font-size:9px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_MUTED};">${escapeHtml(label)}</div>
        <div style="font-size:18px;font-weight:900;color:${valueColor};letter-spacing:-0.02em;line-height:1.2;">${value}</div>
      </td></tr>
    </table>
  </td>`;
}

/** „Tvoje čísla“ z aktuálního řádku body_metrics (ne ze zamčeného plan_html). */
function buildTvojeCislaHeroBlockFromBodyMetrics(bm) {
  if (!bm || typeof bm !== 'object') return '';
  const height =
    bm.height_cm != null && String(bm.height_cm).trim() !== '' ? escapeHtml(String(bm.height_cm)) + '<span style="font-size:10px;font-weight:700;color:#94a3b8;margin-left:2px;">cm</span>' : '—';
  const weight =
    bm.weight_kg != null && String(bm.weight_kg).trim() !== '' ? escapeHtml(String(bm.weight_kg)) + '<span style="font-size:10px;font-weight:700;color:#94a3b8;margin-left:2px;">kg</span>' : '—';
  const goalEsc = `<span style="font-size:14px;">${escapeHtml(goalLabelCs(bm.goal))}</span>`;
  const innerHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:6px 0 0;">
    <tr>
      ${buildStatColumn({ icon: '📏', label: 'Výška', value: height })}
      ${buildStatColumn({ icon: '⚖️', label: 'Váha', value: weight })}
      ${buildStatColumn({ icon: '🎯', label: 'Cíl', value: goalEsc })}
    </tr>
  </table>`;
  return buildEmailHeroCard({ label: 'Tvoje údaje', accent: '#a78bfa', innerHtml });
}

function styleListForEmail(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/<ul[^>]*>/gi, `<ul style="margin:0 0 12px;padding:0;list-style:none;color:${EMAIL_TEXT};font-size:14px;line-height:1.65;font-family:Arial,sans-serif;">`)
    .replace(/<li[^>]*>/gi, `<li style="margin:6px 0;padding-left:18px;position:relative;background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%228%22 height=%228%22><circle cx=%224%22 cy=%224%22 r=%223%22 fill=%22%23a78bfa%22/></svg>');background-repeat:no-repeat;background-position:0 9px;">`);
}

/** Zachová data-* a id z původních atributů <p …> (bez atributů náhledů jídel / médií cviků). */
function dataAttrsFromPAttrs(attrs) {
  if (!attrs || typeof attrs !== 'string') return '';
  const parts = attrs.match(/\s+(?:data-[a-z0-9_-]+|id)="[^"]*"/gi);
  if (!parts) return '';
  return parts
    .filter(
      (p) =>
        !/\bdata-image-url\s*=/i.test(p) &&
        !/\bdata-gif-url\s*=/i.test(p) &&
        !/\bdata-image-trust-level\s*=/i.test(p)
    )
    .join('');
}

/** Odstraní z HTML atributy náhledů, vložená média a tagy obrázků (e-mail, digest, profil). */
export function stripPlanMediaAttrsFromHtml(html) {
  if (!html || typeof html !== 'string') return html;
  let s = html
    .replace(/\s+data-image-url="[^"]*"/gi, '')
    .replace(/\s+data-image-trust-level="[^"]*"/gi, '')
    .replace(/\s+data-gif-url="[^"]*"/gi, '')
    .replace(/\s+data-image-url='[^']*'/gi, '')
    .replace(/\s+data-image-trust-level='[^']*'/gi, '')
    .replace(/\s+data-gif-url='[^']*'/gi, '')
    .replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, '')
    .replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, '')
    .replace(/<source\b[^>]*>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<span[^>]*\bplan-trust-badge[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<span[^>]*\bplan-trust-sublabel[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<div[^>]*\bplan-meal-no-image\b[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*\bplan-exercise-no-media\b[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/\s+data-wger-exercise-id="[^"]*"/gi, '')
    .replace(/\s+data-exercise-key="[^"]*"/gi, '')
    .replace(/\s+data-wger-exercise-id='[^']*'/gi, '')
    .replace(/\s+data-exercise-key='[^']*'/gi, '');
  return s;
}

/** Odstraní z HTML blok „Trénink tento den“ (odstavec + seznam), např. v digestu nebo fallbacku bez cviků. */
export function stripInlineTrainingDayBlockFromHtml(html) {
  if (!html || typeof html !== 'string') return html;
  return html.replace(
    /<p[^>]*>\s*<(?:b|strong)>\s*Trénink tento den\s*:?\s*<\/(?:b|strong)>\s*<\/p>\s*<ul[\s\S]*?<\/ul>/gi,
    ''
  );
}

/**
 * Nutrition-only: odstraní sekce tréninku z HTML plánu před e-mailem / digestem.
 * Volitelný odstavec + ul bez závěrečného </ul> (kvůli poškozenému HTML).
 */
export function stripNutritionOnlyTrainingFromPlanHtml(html) {
  if (!html || typeof html !== 'string') return html;
  let s = stripInlineTrainingDayBlockFromHtml(html);
  s = s.replace(
    /<p[^>]*>\s*<(?:b|strong)>\s*Trénink tento den\s*:?\s*<\/(?:b|strong)>\s*<\/p>/gi,
    ''
  );
  s = s.replace(/<h3[^>]*>[^<]*Tréninkový\s+plán[^<]*<\/h3>[\s\S]*?(?=<h3[^>]*>|$)/gi, '');
  s = s.replace(/<h4[^>]*>[^<]*Tréninkový\s+plán[^<]*<\/h4>[\s\S]*?(?=<h[34][^>]*>|$)/gi, '');
  return s;
}

/** Jen úvodní sekce „Tréninkový plán“ (nad jídelníčkem) — v e-mailu s tréninkem ji vynecháme, denní bloky řeší karty. */
export function stripGlobalTrainingPlanIntroFromHtml(html) {
  if (!html || typeof html !== 'string') return html;
  return html.replace(/<h3[^>]*>[^<]*Tréninkový\s+plán[^<]*<\/h3>[\s\S]*?(?=<h3[^>]*>|$)/gi, '');
}

function replaceMealOpening(html, mealNamePattern, typeLabel, withBottomBorder) {
  const border = withBottomBorder ? `border-bottom:1px solid rgba(167,139,250,0.18);` : '';
  const re = new RegExp(`<p([^>]*)>\\s*<(?:b|strong)>\\s*${mealNamePattern}\\s*:?\\s*<\\/(?:b|strong)>`, 'gi');
  return html.replace(re, (_, attrs) => {
    const dataAttrs = dataAttrsFromPAttrs(attrs);
    return `<p style="margin:0 0 12px;padding:10px 0;${border}color:${EMAIL_TEXT};font-size:14px;line-height:1.55;font-family:Arial,sans-serif;"${dataAttrs}><span style="color:${EMAIL_ACCENT};font-weight:800;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">${typeLabel}</span> `;
  });
}

/** Tučný název jídla hned za štítkem typu jídla (text až do konce odstavce). */
function boldMealTitleAfterLabel(html) {
  return html.replace(
    /(<span style="[^"]*color:\s*#[0-9a-fA-F]{3,8}[^"]*">[^<]*<\/span>)\s+([^<]+)(?=<\/p>)/gi,
    (_, span, title) => `${span} <strong style="color:#f8fafc;font-weight:700;">${title.trim()}</strong>`
  );
}

const RECIPE_LINK_A_STYLE =
  'display:inline-block;font-size:11px;font-weight:700;color:#ede9fe;text-decoration:none;padding:6px 12px;border:1px solid rgba(167,139,250,0.45);border-radius:999px;margin-top:4px;letter-spacing:0.04em;background:rgba(124,58,237,0.18);font-family:Arial,sans-serif;';

/** Odkaz na recept v e-mailu: doplní jen u odstavce s data-recipe-id, pokud už není plan-meal-external-recipe (nový renderer). */
function appendInlineRecipeLinksForEmailMeals(html) {
  if (!html || typeof html !== 'string') return html;
  const app = getPublicAppUrl();
  return html.replace(
    /<p([^>]*\bdata-recipe-id\s*=\s*["'](\d+)["'][^>]*)>([\s\S]*?)<\/p>(?!\s*<p[^>]*\bplan-meal-external-recipe\b)(?!\s*<p[^>]*>\s*<a[^>]*href\s*=\s*["'][^"']*spoonacular-recipe)/gi,
    (full, attrs, id, inner) => {
      if (/meal-nutrition-line|plan-meal-external-recipe/i.test(attrs)) return full;
      if (/spoonacular-recipe|\/api\/spoonacular-recipe/i.test(inner || '')) return full;
      const href = `${app}/api/spoonacular-recipe?id=${encodeURIComponent(id)}&format=html`;
      const wrap = `<p style="margin:4px 0 14px;line-height:1.4;font-family:Arial,sans-serif;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="${RECIPE_LINK_A_STYLE}">Recept</a></p>`;
      return full + wrap;
    }
  );
}

/** Jedna „pilulka“ makra jako vlastní řádek (žádný horizontální scroll na úzkém Gmailu). */
function mealMacroPillStackedRow(label, val, borderHex, fg, bgHex) {
  return `<tr><td style="padding:0 0 6px 0;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="${bgHex}" style="padding:8px 13px;border-radius:999px;background-color:${bgHex};border:2px solid ${borderHex};color:${fg};font-size:11px;font-weight:800;font-family:Arial,sans-serif;line-height:1.35;">${label}&nbsp;${escapeHtml(
    val
  )}&nbsp;g</td></tr></table></td></tr>`;
}

/** Řádek výživy u jídla → kompaktní odznaky podle B/S/T z planRendereru (řádek &lt;td&gt; pro Gmail). */
function transformMealNutritionLinesToMacroTags(html) {
  return html.replace(
    /<p[^>]*class="meal-nutrition-line"[^>]*>\s*<small>([^<]*)<\/small>\s*<\/p>/gi,
    (_, inner) => {
      const raw = String(inner).replace(/\u00a0/g, ' ').replace(/\bzdraví\b/gi, 'hodnocení');
      let b = raw.match(/\bB\s*(\d+)\s*g\b/i)?.[1];
      let s = raw.match(/\bS\s*(\d+)\s*g\b/i)?.[1];
      let t = raw.match(/\bT\s*(\d+)\s*g\b/i)?.[1];
      if (!b) b = raw.match(/Bílkoviny\s+(\d+)\s*g\b/i)?.[1];
      if (!s) s = raw.match(/Sacharidy\s+(\d+)\s*g\b/i)?.[1];
      if (!t) t = raw.match(/Tuky\s+(\d+)\s*g\b/i)?.[1];
      let fiber = raw.match(/\bVláknina\s+(\d+)\s*g\b/i)?.[1];
      const cells = [];
      if (b) cells.push(mealMacroPillStackedRow('Bílkoviny', b, '#3b82f6', '#dbeafe', '#152642'));
      if (s) cells.push(mealMacroPillStackedRow('Sacharidy', s, '#ca8a04', '#fef9c3', '#2a2310'));
      if (t) cells.push(mealMacroPillStackedRow('Tuky', t, '#ef4444', '#fee2e2', '#2a1518'));
      if (fiber) cells.push(mealMacroPillStackedRow('Vláknina', fiber, '#22c55e', '#dcfce7', '#132618'));
      if (!cells.length) {
        return `<p style="margin:0 0 8px;color:${EMAIL_MUTED};font-size:12px;font-family:Arial,sans-serif;line-height:1.45;"><small>${escapeHtml(raw)}</small></p>`;
      }
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;font-family:Arial,sans-serif;">${cells.join('')}</table>`;
    }
  );
}

function defaultWorkoutCardHtml() {
  const inner = workoutNumberedRow(1, 'Odpočinek — pohyb máš naplánovaný jako volný den.');
  return buildWorkoutMovementCard(inner);
}

function extractWorkoutBlock(content) {
  if (!content || typeof content !== 'string') return { mealContent: '', workoutCardHtml: defaultWorkoutCardHtml() };
  const workoutRe = /<p[^>]*>\s*<(?:b|strong)>\s*Trénink tento den:\s*<\/(?:b|strong)>\s*<\/p>\s*(<ul[\s\S]*?<\/ul>)?/i;
  const m = content.match(workoutRe);
  if (!m) return { mealContent: content, workoutCardHtml: defaultWorkoutCardHtml() };

  const workoutListRaw = (m[1] || '').trim();
  const profilUrl = escapeHtml(`${getPublicAppUrl().replace(/\/$/, '')}/profil`);
  let workoutMeta = `<p style="margin:0 0 12px;color:${EMAIL_MUTED};font-size:12px;line-height:1.55;font-family:Arial,sans-serif;">Popis pohybu, videa a úpravy plánu máš v <a href="${profilUrl}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_ACCENT};font-weight:700;text-decoration:underline;">aplikaci</a> po přihlášení v záložce Profil.</p>`;
  let workoutList = workoutNumberedRow(1, 'Odpočinek.');
  if (workoutListRaw) {
    const liRe = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
    const cards = [];
    let liMatch;
    let idx = 0;
    while ((liMatch = liRe.exec(workoutListRaw)) !== null) {
      idx += 1;
      const labelHtml = String(liMatch[2] || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      cards.push(workoutNumberedRow(idx, labelHtml || 'Cvik'));
    }
    if (cards.length > 0) {
      workoutList = cards.join('');
    }
  }

  const workoutCardHtml = buildWorkoutMovementCard(`${workoutMeta}${workoutList}`);
  return { mealContent: content.replace(workoutRe, '').trim(), workoutCardHtml };
}

function normalizeDayHeadingsInMealSection(html) {
  if (!html || typeof html !== 'string') return html;
  const dayLabelRe = /^(pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
  let out = html.replace(/<p[^>]*>\s*<(?:b|strong)>\s*([^<:]{2,24})\s*<\/(?:b|strong)>\s*<\/p>/gi, (full, rawLabel) => {
    const label = String(rawLabel || '').trim();
    if (!dayLabelRe.test(label)) return full;
    return `<h4>${escapeHtml(label)}</h4>`;
  });
  out = out.replace(/<h3[^>]*>\s*([^<]{2,24})\s*<\/h3>/gi, (full, rawLabel) => {
    const label = String(rawLabel || '').trim();
    if (!dayLabelRe.test(label)) return full;
    return `<h4>${escapeHtml(label)}</h4>`;
  });
  return out;
}

function styleDailySummaryLine(html) {
  if (!html || typeof html !== 'string') return html;
  return html.replace(
    /<p[^>]*>\s*<small>\s*<em>\s*Součet dne\s*\(orientačně\)\s*:\s*([^<]*)<\/em>\s*<\/small>\s*<\/p>/gi,
    (_, summary) => {
      const text = String(summary || '').trim();
      const normalized = text.replace(/\s*,\s*/g, ' · ');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-day-sum" style="margin:12px 0 6px;border-radius:14px;border:1px solid rgba(167,139,250,0.26);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="#1c1730"><tr><td width="5" style="width:5px;background-color:#a78bfa;" bgcolor="#a78bfa">&nbsp;</td><td style="padding:12px 14px;background-color:#1c1730;" bgcolor="#1c1730"><span style="font-weight:700;color:${EMAIL_TEXT};letter-spacing:0.06em;text-transform:uppercase;font-size:10px;">Orientační součet dne</span><br/><span style="color:${EMAIL_TEXT};font-weight:600;margin-top:6px;display:inline-block;font-size:13px;line-height:1.45;">${escapeHtml(normalized)}</span></td></tr></table>`;
    }
  );
}

/** Jednotlivá jídla jako samostatné „mini karty“ uvnitř denního bloku (jen e-mail). */
function wrapPremiumMealMiniCards(html) {
  if (!html || typeof html !== 'string') return html;
  const re =
    /<p style="margin:0 0 12px;padding:10px 0[^"]*"[^>]*>[\s\S]*?(?=<p style="margin:0 0 12px;padding:10px 0|<table[^>]*class="email-day-sum"|<div class="email-day-sum"|$)/gi;
  const wrapOpen = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;border-radius:16px;border:1px solid rgba(196,181,253,0.28);overflow:hidden;" bgcolor="#252038"><tr><td width="6" style="width:6px;background-color:#a78bfa;" bgcolor="#a78bfa">&nbsp;</td><td style="padding:15px 16px 16px 14px;background-color:#1e1a2f;" bgcolor="#1e1a2f">`;
  const wrapClose = '</td></tr></table>';
  return html.replace(re, (block) => wrapOpen + block.trim() + wrapClose);
}

/** Sloupec makra (Kcal/B/S/T) — barevný kvadrant s velkou hodnotou. */
function buildMacroColumn({ value, unit, label, accent, bg, border }) {
  return `<td valign="top" align="center" width="25%" style="padding:5px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="border-collapse:separate;background-color:${bg};border:1px solid ${border};border-radius:14px;">
      <tr><td bgcolor="${accent}" height="3" style="height:3px;font-size:3px;line-height:3px;background-color:${accent};border-radius:14px 14px 0 0;">&nbsp;</td></tr>
      <tr><td align="center" style="padding:11px 4px 12px;font-family:Arial,sans-serif;">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:${accent};">${escapeHtml(label)}</div>
        <div style="margin-top:6px;font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;line-height:1;">${escapeHtml(value)}<span style="font-size:11px;font-weight:700;color:#94a3b8;margin-left:2px;">${escapeHtml(unit)}</span></div>
      </td></tr>
    </table>
  </td>`;
}

/** Denní makra z <ul> jako 4-sloupcový stat blok (e-mail). */
function formatMacrosBlockHtml(rawUlBlock) {
  const cal = rawUlBlock.match(/Kalorie[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const prot = rawUlBlock.match(/Bílkoviny[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const carbs = rawUlBlock.match(/Sacharidy[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const fat = rawUlBlock.match(/Tuky[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();

  const calNum = cal ? escapeHtml(cal.replace(/\s*kcal/gi, '').trim()) : '';
  const protNum = prot ? escapeHtml(prot.replace(/\s*g\s*$/i, '').trim()) : '';
  const carbsNum = carbs ? escapeHtml(carbs.replace(/\s*g\s*$/i, '').trim()) : '';
  const fatNum = fat ? escapeHtml(fat.replace(/\s*g\s*$/i, '').trim()) : '';

  if (!calNum && !protNum && !carbsNum && !fatNum) {
    return styleListForEmail(rawUlBlock);
  }

  const cols = [];
  if (calNum) cols.push(buildMacroColumn({ value: calNum, unit: 'kcal', label: 'Kalorie', accent: '#a78bfa', bg: '#1f1633', border: 'rgba(167,139,250,0.32)' }));
  if (protNum) cols.push(buildMacroColumn({ value: protNum, unit: 'g', label: 'Bílk.', accent: '#60a5fa', bg: '#162038', border: 'rgba(96,165,250,0.32)' }));
  if (carbsNum) cols.push(buildMacroColumn({ value: carbsNum, unit: 'g', label: 'Sach.', accent: '#facc15', bg: '#241e10', border: 'rgba(250,204,21,0.32)' }));
  if (fatNum) cols.push(buildMacroColumn({ value: fatNum, unit: 'g', label: 'Tuky', accent: '#f87171', bg: '#2a1718', border: 'rgba(248,113,113,0.32)' }));

  if (!cols.length) return styleListForEmail(rawUlBlock);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:6px 0 0;font-family:Arial,sans-serif;"><tr>${cols.join('')}</tr></table>`;
}

/**
 * E-mailové klienty často ignorují &lt;details&gt; — seznam surovin do e-mailu nedáváme.
 * Blok surovin z HTML odstraníme; návod k receptům je jednou nad jídelníčkem (recipeHintOnce).
 */
function compactMealIngredientBlocksForEmail(html, _profileUrl) {
  if (!html || typeof html !== 'string') return html;
  const re =
    /<p([^>]*class="[^"]*meal-ingredient-portions-h[^"]*"[^>]*)>([\s\S]*?)<\/p>\s*<ul([^>]*class="[^"]*meal-ingredient-portions[^"]*"[^>]*)>([\s\S]*?)<\/ul>/gi;
  return html.replace(re, () => '');
}

const MINDSET_CHECK_MARK_TABLE = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;"><tr><td bgcolor="#5b21b6" style="width:34px;height:34px;border-radius:17px;background-color:#5b21b6;text-align:center;color:#faf5ff;font-size:15px;font-weight:800;line-height:34px;font-family:Arial,sans-serif;">&#10003;</td></tr></table>`;

/** Odstavec(e) mindsetu → řádky s fajfkou (bez obrázků, čistě tabulky). */
function formatMindsetTipsTable(rawMindsetHtml) {
  if (!rawMindsetHtml || typeof rawMindsetHtml !== 'string') return '';
  const extracted = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pm;
  while ((pm = pRe.exec(rawMindsetHtml)) !== null) {
    const inner = (pm[1] || '').trim();
    if (inner) extracted.push(inner);
  }
  if (!extracted.length) {
    const fallback = rawMindsetHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (fallback) extracted.push(escapeHtml(fallback));
    else return '';
  }
  if (
    extracted.length === 1 &&
    !/<[a-z][\s\S]*>/i.test(extracted[0]) &&
    extracted[0].length > 55 &&
    extracted[0].includes(',')
  ) {
    const chunks = extracted[0]
      .split(/\s*,\s+/)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (chunks.length > 1) {
      extracted.length = 0;
      for (const ch of chunks) {
        const piece = ch.endsWith('.') ? ch : `${ch}.`;
        extracted.push(escapeHtml(piece));
      }
    }
  }
  return extracted
    .map(
      (inner) =>
        `<tr><td width="50" valign="top" style="padding:12px 6px 14px 4px;">${MINDSET_CHECK_MARK_TABLE}</td><td valign="top" style="padding:12px 10px 14px 4px;color:${EMAIL_TEXT};font-size:15px;line-height:1.62;font-family:Arial,sans-serif;">${inner}</td></tr>`
    )
    .join('');
}

function buildWorkoutMovementCard(innerHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;border-radius:16px;border:1px solid rgba(196,181,253,0.32);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="#1c1828">
  <tr><td colspan="2" height="4" style="height:4px;font-size:4px;line-height:4px;background-color:#a78bfa;" bgcolor="#a78bfa">&nbsp;</td></tr>
  <tr><td colspan="2" style="padding:12px 16px;border-bottom:1px solid rgba(167,139,250,0.24);background-color:#2a1f48;" bgcolor="#2a1f48">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="color:#e9d5ff;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;font-family:Arial,sans-serif;">Pohyb v tento den</td>
      <td align="right" style="color:#c4b5fd;font-size:11px;font-weight:800;font-family:Arial,sans-serif;letter-spacing:0.06em;">Aktivity</td>
    </tr></table>
  </td></tr>
  <tr><td colspan="2" style="padding:14px 14px 16px;background-color:#171328;" bgcolor="#171328">${innerHtml}</td></tr>
</table>`;
}

function workoutNumberedRow(index, labelText) {
  const n = String(index);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;border-radius:14px;border:1px solid rgba(167,139,250,0.22);overflow:hidden;" bgcolor="#221c32"><tr>
  <td width="46" valign="top" style="padding:12px 6px 12px 12px;background-color:#1a1530;" bgcolor="#1a1530">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td bgcolor="#4c1d95" width="32" height="32" style="width:32px;height:32px;border-radius:16px;background-color:#4c1d95;text-align:center;line-height:32px;color:#ede9ff;font-size:13px;font-weight:800;font-family:Arial,sans-serif;">${escapeHtml(n)}</td></tr></table>
  </td>
  <td valign="middle" style="padding:12px 14px 12px 4px;color:#f8fafc;font-size:14px;line-height:1.5;font-weight:700;font-family:Arial,sans-serif;">${escapeHtml(labelText || 'Aktivita')}</td>
</tr></table>`;
}

/** Velký section header s čísly 01/02/03… — vizuální rytmus mezi hlavními sekcemi e-mailu. */
function buildEmailSectionHeader({ index, eyebrow, title, subtitle, accent = '#a78bfa' }) {
  const indexLabel = String(index).padStart(2, '0');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:36px 0 18px;font-family:Arial,sans-serif;"><tr>
    <td valign="middle" style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" width="38" style="width:38px;padding:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td bgcolor="${accent}" width="38" height="38" style="width:38px;height:38px;background-color:${accent};background-image:linear-gradient(135deg,${accent} 0%,#7c3aed 100%);border-radius:12px;text-align:center;line-height:38px;color:#ffffff;font-size:13px;font-weight:900;font-family:Arial,sans-serif;letter-spacing:0.06em;box-shadow:0 6px 18px rgba(124,58,246,0.45);">${indexLabel}</td>
        </tr></table></td>
        <td valign="middle" style="padding:0 0 0 14px;">
          <div style="font-size:9px;font-weight:800;letter-spacing:0.24em;text-transform:uppercase;color:${accent};font-family:Arial,sans-serif;">${escapeHtml(eyebrow || 'Sekce')}</div>
          <div style="margin-top:3px;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.025em;line-height:1.15;font-family:Arial,sans-serif;">${escapeHtml(title)}</div>
        </td>
        <td valign="middle" align="right" style="padding:0 0 0 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr>
            <td height="2" bgcolor="${accent}" width="40" style="width:40px;height:2px;background-color:${accent};font-size:0;line-height:0;border-radius:2px;">&nbsp;</td>
            <td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>
            <td height="2" bgcolor="${accent}" width="14" style="width:14px;height:2px;background-color:${accent};opacity:0.55;font-size:0;line-height:0;border-radius:2px;">&nbsp;</td>
            <td width="4" style="width:4px;font-size:0;line-height:0;">&nbsp;</td>
            <td height="2" bgcolor="${accent}" width="6" style="width:6px;height:2px;background-color:${accent};opacity:0.3;font-size:0;line-height:0;border-radius:2px;">&nbsp;</td>
          </tr></table>
        </td>
      </tr></table>
      ${subtitle ? `<div style="margin:12px 0 0;color:${EMAIL_MUTED};font-size:13px;line-height:1.55;font-family:Arial,sans-serif;">${escapeHtml(subtitle)}</div>` : ''}
    </td>
  </tr></table>`;
}

/** Velký kombinovaný „snapshot" – jméno, 3 osobní údaje, 4 makra. Jeden mocný blok místo dvou karet. */
function buildSnapshotCardCombined({ bm, macrosUlBlock, firstName }) {
  if (!bm || typeof bm !== 'object') return '';
  const heightVal = bm.height_cm != null && String(bm.height_cm).trim() !== '' ? escapeHtml(String(bm.height_cm)) : '—';
  const weightVal = bm.weight_kg != null && String(bm.weight_kg).trim() !== '' ? escapeHtml(String(bm.weight_kg)) : '—';
  const goalText = escapeHtml(goalLabelCs(bm.goal));
  const namePart = (firstName || '').trim().split(/\s+/)[0] || '';
  const initial = namePart ? escapeHtml(namePart.slice(0, 1).toUpperCase()) : 'B';

  let macroRow = '';
  if (macrosUlBlock) {
    const cal = macrosUlBlock.match(/Kalorie[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
    const prot = macrosUlBlock.match(/Bílkoviny[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
    const carbs = macrosUlBlock.match(/Sacharidy[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
    const fat = macrosUlBlock.match(/Tuky[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
    const calNum = cal ? escapeHtml(cal.replace(/\s*kcal/gi, '').trim()) : '';
    const protNum = prot ? escapeHtml(prot.replace(/\s*g\s*$/i, '').trim()) : '';
    const carbsNum = carbs ? escapeHtml(carbs.replace(/\s*g\s*$/i, '').trim()) : '';
    const fatNum = fat ? escapeHtml(fat.replace(/\s*g\s*$/i, '').trim()) : '';
    const cols = [];
    if (calNum) cols.push(buildMacroColumn({ value: calNum, unit: 'kcal', label: 'Kalorie', accent: '#a78bfa', bg: '#1f1633', border: 'rgba(167,139,250,0.32)' }));
    if (protNum) cols.push(buildMacroColumn({ value: protNum, unit: 'g', label: 'Bílk.', accent: '#60a5fa', bg: '#162038', border: 'rgba(96,165,250,0.32)' }));
    if (carbsNum) cols.push(buildMacroColumn({ value: carbsNum, unit: 'g', label: 'Sach.', accent: '#facc15', bg: '#241e10', border: 'rgba(250,204,21,0.32)' }));
    if (fatNum) cols.push(buildMacroColumn({ value: fatNum, unit: 'g', label: 'Tuky', accent: '#f87171', bg: '#2a1718', border: 'rgba(248,113,113,0.32)' }));
    if (cols.length) {
      macroRow = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0;font-family:Arial,sans-serif;"><tr>${cols.join('')}</tr></table>`;
    }
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-radius:20px;border:1px solid rgba(167,139,250,0.32);overflow:hidden;font-family:Arial,sans-serif;background-color:${EMAIL_CARD};box-shadow:0 18px 48px rgba(76,29,149,0.45);" bgcolor="${EMAIL_CARD}">
    <tr><td bgcolor="#7c3aed" height="3" style="height:3px;font-size:3px;line-height:3px;background-color:#7c3aed;background-image:linear-gradient(90deg,#a78bfa 0%,#7c3aed 50%,#ec4899 100%);">&nbsp;</td></tr>
    <tr><td bgcolor="${EMAIL_CARD}" style="padding:20px 20px 8px;background-color:${EMAIL_CARD};background-image:radial-gradient(ellipse 80% 60% at 100% 0%, rgba(167,139,250,0.18) 0%, transparent 60%);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" width="56" style="padding:0 12px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td bgcolor="#5b21b6" width="48" height="48" style="width:48px;height:48px;background-color:#5b21b6;background-image:linear-gradient(135deg,#a78bfa,#5b21b6);border-radius:14px;text-align:center;line-height:48px;color:#ffffff;font-size:20px;font-weight:900;font-family:Arial,sans-serif;">${initial}</td>
            </tr></table>
          </td>
          <td valign="middle" style="padding:0;">
            <div style="font-size:9px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#a78bfa;font-family:Arial,sans-serif;">Tvůj snapshot</div>
            <div style="margin-top:3px;font-size:18px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;font-family:Arial,sans-serif;">${namePart ? `Ahoj, ${escapeHtml(namePart)}!` : 'Ahoj!'}</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td bgcolor="${EMAIL_CARD}" style="padding:8px 14px 4px;background-color:${EMAIL_CARD};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
        <tr>
          ${buildStatColumn({ icon: '📏', label: 'Výška', value: `${heightVal}<span style="font-size:10px;font-weight:700;color:#94a3b8;margin-left:2px;">cm</span>` })}
          ${buildStatColumn({ icon: '⚖️', label: 'Váha', value: `${weightVal}<span style="font-size:10px;font-weight:700;color:#94a3b8;margin-left:2px;">kg</span>` })}
          ${buildStatColumn({ icon: '🎯', label: 'Cíl', value: `<span style="font-size:14px;">${goalText}</span>` })}
        </tr>
      </table>
    </td></tr>
    ${macroRow ? `<tr><td bgcolor="${EMAIL_CARD}" style="padding:6px 18px 8px;background-color:${EMAIL_CARD};">
      <div style="margin:6px 0 8px;font-size:9px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#a78bfa;font-family:Arial,sans-serif;">Cílová denní bilance</div>
    </td></tr>
    <tr><td bgcolor="${EMAIL_CARD}" style="padding:0 14px 16px;background-color:${EMAIL_CARD};">${macroRow}</td></tr>` : '<tr><td bgcolor="' + EMAIL_CARD + '" style="padding:0 0 12px;background-color:' + EMAIL_CARD + ';">&nbsp;</td></tr>'}
    <tr><td bgcolor="#13091e" style="padding:12px 20px;background-color:#13091e;border-top:1px solid rgba(167,139,250,0.16);color:${EMAIL_MUTED};font-size:12px;line-height:1.5;font-family:Arial,sans-serif;">Plán je nastaven přesně podle tvých čísel — recepty i tréninky tomu odpovídají.</td></tr>
  </table>`;
}

/**
 * Transformuje HTML plánu pro e-mail: karty, makra, jídla.
 * Trénink v těle e-mailu jen při plan output mode nutrition_training (viz getPlanOutputMode).
 * Obrázky a data-* médií se mažou vždy (shouldStripMediaFromPlanEmail).
 */
export function formatPlanHtmlForEmail(html, emailOptions = {}) {
  if (!html || typeof html !== 'string') return '';
  const mode = getPlanOutputMode(null, null, { outputMode: emailOptions.planOutputMode });
  const trainingInEmail = shouldIncludeTrainingInEmail(mode);
  const stripMedia = shouldStripMediaFromPlanEmail();
  const profileUrl = `${getPublicAppUrl().replace(/\/$/, '')}/profil`;
  const bmInject = emailOptions.bodyMetricsForEmail;
  const firstName = (emailOptions.firstName || '').trim();

  let out = sanitizePlanHtml(html);
  if (!trainingInEmail) {
    out = stripNutritionOnlyTrainingFromPlanHtml(out);
  } else {
    out = stripGlobalTrainingPlanIntroFromHtml(out);
  }

  // SECTION 01 — Snapshot: kombinace Tvoje čísla + Denní cíle do jedné premium karty
  const numbersRegex = /<h3[^>]*>[^<]*Tvoje čísla[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  const macrosRegex = /<h3[^>]*>[^<]*Denní cíle[^<]*(?:makra)?[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  const macrosMatch = out.match(macrosRegex);
  let macrosUlBlock = '';
  if (macrosMatch && macrosMatch[1].trim()) {
    macrosUlBlock = macrosMatch[1].match(/<ul[\s\S]*?<\/ul>/i)?.[0] || '';
    out = out.replace(macrosMatch[0], '');
  }

  let snapshotBlock = '';
  if (bmInject && typeof bmInject === 'object') {
    out = out.replace(numbersRegex, '');
    snapshotBlock =
      buildEmailSectionHeader({
        index: 1,
        eyebrow: 'Snapshot',
        title: firstName ? `Tvůj profil & cílová bilance` : 'Tvůj profil & cílová bilance',
        subtitle: 'Údaje z registrace + denní makra, podle kterých jsme plán postavili.',
        accent: '#a78bfa',
      }) + buildSnapshotCardCombined({ bm: bmInject, macrosUlBlock, firstName });
  } else {
    const numbersMatch = out.match(numbersRegex);
    let numHero = '';
    if (numbersMatch && numbersMatch[1].trim()) {
      const numbersContent = styleListForEmail(numbersMatch[1].trim());
      out = out.replace(numbersMatch[0], '');
      numHero = buildEmailHeroCard({ label: 'Tvoje údaje', accent: '#a78bfa', innerHtml: numbersContent });
    }
    let macroHero = '';
    if (macrosUlBlock) {
      const inner = formatMacrosBlockHtml(macrosUlBlock);
      macroHero = buildEmailHeroCard({ label: 'Denní cíle', accent: '#7c3aed', innerHtml: inner });
    }
    if (numHero || macroHero) {
      snapshotBlock =
        buildEmailSectionHeader({
          index: 1,
          eyebrow: 'Snapshot',
          title: 'Tvůj profil & cílová bilance',
          subtitle: 'Údaje, podle kterých jsme plán postavili.',
          accent: '#a78bfa',
        }) + numHero + macroHero;
    }
  }

  // SECTION 02 — Návyky na tento týden
  let mindsetBlock = '';
  const mindsetRegex = /<h3[^>]*>[^<]*Mindset na tento týden[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  const mindsetMatch = out.match(mindsetRegex);
  if (mindsetMatch) {
    const mindsetRawInner = mindsetMatch[1].trim().replace(/<b>/gi, '<b style="color:#ffffff;">');
    const tipRows = formatMindsetTipsTable(mindsetRawInner);
    const tipsTable = tipRows
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;border-collapse:collapse;">${tipRows}</table>`
      : `<p style="margin:0;color:${EMAIL_TEXT};font-size:15px;line-height:1.65;font-family:Arial,sans-serif;">${mindsetRawInner}</p>`;
    out = out.replace(mindsetMatch[0], '');
    mindsetBlock =
      buildEmailSectionHeader({
        index: 2,
        eyebrow: 'Hlava',
        title: 'Návyky pro tento týden',
        subtitle: 'Tři až pět zásad, které drží plán pohromadě.',
        accent: '#ec4899',
      }) + buildEmailHeroCard({ label: 'Tipy & návyky', accent: '#ec4899', innerHtml: tipsTable });
  }

  // Jídelníček + denní karty (jídla + trénink)
  const dayMatch = out.match(
    /<h3[^>]*>([^<]*(?:Jídelníček|jidelníček)[^<]*)<\/h3>([\s\S]*?)(?=<h3[^>]*>\s*(?:Suplementace|Regenerace|Nákupní seznam)\b|$)/i
  );
  if (dayMatch) {
    const beforeMeal = out.slice(0, dayMatch.index);
    const afterMeal = out.slice(dayMatch.index + dayMatch[0].length);
    const mealSection = normalizeDayHeadingsInMealSection(dayMatch[2]);

    const dayBlocks = mealSection.split(/(?=<h4[^>]*>)/i).filter(Boolean);
    let mealHtml = '';
    const dayOverrides = Array.isArray(emailOptions.dayHeadingOverrides) ? emailOptions.dayHeadingOverrides : null;
    let overrideIdx = 0;
    for (const block of dayBlocks) {
      const h4Match = block.match(/^<h4[^>]*>([^<]*)<\/h4>([\s\S]*)$/i);
      if (h4Match) {
        const dayNameRaw = (h4Match[1] || '').trim();
        const displayDayName =
          dayOverrides && dayOverrides[overrideIdx] != null && String(dayOverrides[overrideIdx]).trim()
            ? String(dayOverrides[overrideIdx]).trim()
            : dayNameRaw;
        overrideIdx += 1;
        const rawContent = (h4Match[2] || '').trim();
        const dayContent = rawContent.replace(/<h4[\s\S]*/i, '').trim();

        const { mealContent, workoutCardHtml } = extractWorkoutBlock(dayContent);
        let content = mealContent.trim();
        content = replaceMealOpening(content, 'Snídaně', 'Snídaně', true);
        content = replaceMealOpening(content, 'Oběd', 'Oběd', true);
        content = replaceMealOpening(content, 'Večeře', 'Večeře', false);
        content = replaceMealOpening(content, 'Svačina', 'Svačina', false);
        content = replaceMealOpening(content, 'Breakfast', 'Snídaně', true);
        content = replaceMealOpening(content, 'Lunch', 'Oběd', true);
        content = replaceMealOpening(content, 'Dinner', 'Večeře', false);
        content = replaceMealOpening(content, 'Snack', 'Svačina', false);

        content = boldMealTitleAfterLabel(content);
        content = transformMealNutritionLinesToMacroTags(content);
        content = compactMealIngredientBlocksForEmail(content, profileUrl);
        content = styleDailySummaryLine(content);
        content = wrapPremiumMealMiniCards(content);

        content = content.replace(
          /<p(?!\s[^>]*style=)([^>]*)>/gi,
          `<p style="margin:0 0 10px;color:${EMAIL_MUTED};font-size:13px;line-height:1.5;font-family:Arial,sans-serif;"$1>`
        );

        content = stripMedia ? stripPlanMediaAttrsFromHtml(content) : content;

        const trainingMailBlock = trainingInEmail && workoutCardHtml ? workoutCardHtml : '';
        const dayInner = `${content}${trainingMailBlock}`;
        mealHtml += `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;border-radius:20px;border:1px solid rgba(167,139,250,0.3);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td class="email-day-head" style="padding:22px 22px 20px;color:#ffffff;border-bottom:1px solid rgba(196,181,253,0.35);background:linear-gradient(135deg,#2e1d5c 0%,#3b1d72 60%,#7c3aed 100%);" bgcolor="#2a1f48">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="middle" style="padding:0;">
          <div style="font-size:10px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#ddd6fe;font-family:Arial,sans-serif;margin-bottom:4px;">Den ${overrideIdx}</div>
          <div style="font-size:23px;font-weight:900;line-height:1.18;font-family:Arial,sans-serif;letter-spacing:-0.03em;color:#ffffff;">${escapeHtml(displayDayName)}</div>
          <div style="margin-top:8px;height:3px;width:48px;border-radius:999px;background-color:#fde68a;" bgcolor="#fde68a"></div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:18px 18px 22px;color:${EMAIL_TEXT};font-size:14px;line-height:1.55;background-color:#14101f;" bgcolor="#14101f">
    ${dayInner}
  </td></tr>
</table>`;
      }
    }

    const mealSectionTitle = buildEmailSectionHeader({
      index: 3,
      eyebrow: 'Týden po dnech',
      title: 'Tvůj jídelníček · 7 dní',
      subtitle: 'Každý den vlastní karta s jídly, makry a tréninkem.',
      accent: '#7c3aed',
    });
    const recipeHintOnce = `<p style="margin:0 0 22px;padding:12px 16px;border-left:3px solid #a78bfa;color:${EMAIL_MUTED};font-size:13px;line-height:1.55;font-family:Arial,sans-serif;background-color:#161122;border-radius:0 12px 12px 0;" bgcolor="#161122"><strong style="color:#e2e8f0;">Tip:</strong> recept i suroviny po porcích jsou v aplikaci (záložka <strong style="color:#e2e8f0;">Profil</strong> → Jídelníček) — tady máš čistý přehled na týden.</p>`;
    out = beforeMeal + mealSectionTitle + recipeHintOnce + mealHtml + afterMeal;
  }

  const sectionCards = [
    { re: /<h3[^>]*>[^<]*Suplementace[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Suplementace', accent: '#34d399' },
    { re: /<h3[^>]*>[^<]*Regenerace[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Regenerace a odpočinek', accent: '#60a5fa' },
    { re: /<h3[^>]*>[^<]*Nákupní seznam[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Nákupní seznam', accent: '#facc15' },
  ];
  let extrasBlock = '';
  let extrasIndex = 4;
  for (const { re, title, accent } of sectionCards) {
    const m = out.match(re);
    if (m && m[1].trim()) {
      const cardContent = styleListForEmail(m[1].trim());
      const card = buildEmailHeroCard({ label: title, accent, innerHtml: cardContent });
      const sectionHeader = buildEmailSectionHeader({
        index: extrasIndex++,
        eyebrow: 'Doplnění',
        title,
        subtitle: null,
        accent,
      });
      extrasBlock += sectionHeader + card;
      out = out.replace(m[0], '');
    }
  }
  if (extrasBlock) {
    out = out + extrasBlock;
  }

  out = out.replace(/<h3([^>]*)>([^<]*)<\/h3>/gi, (_, attrs, title) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px;font-family:Arial,sans-serif;"><tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.22);color:${EMAIL_TEXT};font-weight:700;font-size:16px;">${escapeHtml((title || '').trim())}</td></tr></table>`
  );

  if (stripMedia) {
    out = stripPlanMediaAttrsFromHtml(out);
  }
  if (!trainingInEmail) {
    out = stripNutritionOnlyTrainingFromPlanHtml(out);
  }
  return snapshotBlock + mindsetBlock + out;
}

/**
 * Kompletní HTML dokument pro e-mail s plánem.
 * @param {string} [firstName] – křestní jméno pro pozdrav
 * @param {string} [ctaUrl] – primární CTA (výchozí odkaz do profilu v aplikaci)
 */
export function buildPlanEmailDocument({
  safePlanHtml,
  loginBlock,
  loginUrl,
  planChangeContext,
  appBaseUrl,
  firstName = '',
  ctaUrl,
}) {
  const app = (appBaseUrl || getPublicAppUrl()).replace(/\/$/, '');
  const profileUrl = `${app}/profil`;
  const planCta = (ctaUrl || profileUrl).replace(/\/$/, '');
  const year = new Date().getFullYear();

  const namePart = (firstName || '').trim().split(/\s+/)[0] || '';
  const greetingLine = planChangeContext
    ? (namePart ? `Ahoj ${escapeHtml(namePart)}, posíláme ti upravený plán podle posledních změn.` : 'Ahoj, posíláme ti upravený plán podle posledních změn.')
    : (namePart ? `Ahoj ${escapeHtml(namePart)}, tady máš celý týden přehledně: jídla, makra i pohyb.` : 'Ahoj, tady máš celý týden přehledně: jídla, makra i pohyb.');

  const fbUrl = (process.env.NEXT_PUBLIC_FACEBOOK_URL || '').trim();
  const igUrl = (process.env.NEXT_PUBLIC_INSTAGRAM_URL || '').trim();
  const webUrl = 'https://www.bodyandmindon.cz';
  const socialRow = [
    fbUrl
      ? `<a href="${escapeHtml(fbUrl)}" style="color:${EMAIL_ACCENT};text-decoration:none;font-weight:600;">Facebook</a>`
      : '',
    igUrl
      ? `<a href="${escapeHtml(igUrl)}" style="color:${EMAIL_ACCENT};text-decoration:none;font-weight:600;">Instagram</a>`
      : '',
    `<a href="${escapeHtml(webUrl)}" style="color:${EMAIL_ACCENT};text-decoration:none;font-weight:600;">Web</a>`,
  ]
    .filter(Boolean)
    .join(`<span style="color:#64748b;padding:0 8px;">|</span>`);

  const emailOuterBg = '#1a0e34';
  const heroSolid = '#3b1d72';

  return `<!DOCTYPE html>
<html lang="cs" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>Body &amp; Mind ON</title>
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <style type="text/css">
    table, td, p, h1, h2, h3 { font-family: Arial, sans-serif !important; }
    body, table.body-bg { background-color: ${emailOuterBg} !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .email-outer-pad { padding: 22px 12px !important; }
      .email-card { width: 100% !important; max-width: 100% !important; border-radius: 16px !important; }
      .email-body-pad { padding: 24px 16px 16px !important; }
      .email-plan-pad { padding: 18px 14px !important; }
      .email-hero-pad { padding: 36px 22px 30px !important; }
      .email-hero-h1 { font-size: 28px !important; line-height: 1.1 !important; }
      .email-stat-row td { display: block !important; width: 100% !important; padding: 0 0 8px 0 !important; }
      .email-day-head div:first-child { font-size: 19px !important; line-height: 1.2 !important; }
      .email-section-h { letter-spacing: 0.06em !important; font-size: 12px !important; }
    }
  </style>
</head>
<body bgcolor="${emailOuterBg}" style="margin:0;padding:0;background-color:${emailOuterBg};color:${EMAIL_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="body-bg" bgcolor="${emailOuterBg}" style="background-color:${emailOuterBg};background-image:radial-gradient(ellipse 70% 50% at 50% 0%, rgba(167,139,250,0.32) 0%, transparent 60%),radial-gradient(ellipse 50% 40% at 0% 30%, rgba(99,102,241,0.2) 0%, transparent 55%),radial-gradient(ellipse 50% 40% at 100% 70%, rgba(192,132,252,0.22) 0%, transparent 55%),url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Ccircle%20cx%3D%221.5%22%20cy%3D%221.5%22%20r%3D%221%22%20fill%3D%22%23a78bfa%22%20fill-opacity%3D%220.05%22%2F%3E%3C%2Fsvg%3E'),linear-gradient(180deg,#21133f 0%,${emailOuterBg} 50%,#0c061c 100%);">
    <tr>
      <td align="center" class="email-outer-pad" style="padding:36px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width:600px;width:100%;margin:0 auto;">
          <tr>
            <td bgcolor="${heroSolid}" align="center" class="email-hero-pad" style="background-color:${heroSolid};background-image:radial-gradient(ellipse 60% 50% at 18% 22%, rgba(167,139,250,0.45) 0%, transparent 55%),radial-gradient(ellipse 55% 45% at 82% 78%, rgba(236,72,153,0.3) 0%, transparent 55%),url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2236%22%20height%3D%2236%22%3E%3Ccircle%20cx%3D%221.5%22%20cy%3D%221.5%22%20r%3D%221%22%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.07%22%2F%3E%3C%2Fsvg%3E'),linear-gradient(160deg,#5b21b6 0%,#3b1d72 48%,#1e1148 100%);border-radius:22px 22px 0 0;padding:46px 36px 38px;text-align:center;">
              <!--[if mso]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="position:absolute;top:0;left:0;width:600px;height:340px;z-index:-1;mso-hide:all;">
                <v:fill type="gradient" color="#5b21b6" color2="#1e1148" angle="160" />
                <v:textbox inset="0,0,0,0"></v:textbox>
              </v:rect>
              <div>&nbsp;</div>
              <![endif]-->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px;">
                <tr>
                  <td bgcolor="#7c3aed" style="background-color:#7c3aed;background-image:linear-gradient(135deg,#c4b5fd 0%,#a78bfa 35%,#6366f1 70%,#4f46e5 100%);border-radius:999px;padding:11px 24px;">
                    <span style="color:#ffffff;font-size:11px;font-weight:900;letter-spacing:3.2px;text-transform:uppercase;font-family:Arial,sans-serif;">BODY &amp; MIND ON</span>
                  </td>
                </tr>
              </table>
              <div style="margin:0 0 14px;font-size:11px;font-weight:800;letter-spacing:0.32em;text-transform:uppercase;color:#c4b5fd;font-family:Arial,sans-serif;">Vítej v aplikaci · Tvůj plán</div>
              <h1 class="email-hero-h1" style="margin:0 0 16px;font-size:34px;font-weight:900;color:#ffffff;line-height:1.08;font-family:Arial,sans-serif;letter-spacing:-0.035em;">Tvůj týden,<br/>naplánovaný do detailu.</h1>
              <p style="margin:0 auto 4px;max-width:440px;font-size:15px;color:#ede9fe;font-family:Arial,sans-serif;line-height:1.6;">${greetingLine}</p>
              <p style="margin:6px auto 0;max-width:440px;font-size:13px;color:#c4b5fd;font-family:Arial,sans-serif;line-height:1.6;">Recepty, makra a pohyb na celý týden — všechno na jedné stránce.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="email-stat-row" style="margin:24px auto 6px;border-collapse:separate;">
                <tr>
                  <td style="padding:0 5px;"><div style="background-color:#241458;border:1px solid #6d4ec5;color:#ede9fe;padding:7px 14px;border-radius:999px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.04em;">7 dní jídla</div></td>
                  <td style="padding:0 5px;"><div style="background-color:#1e2055;border:1px solid #5b6bd9;color:#e0e7ff;padding:7px 14px;border-radius:999px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.04em;">Makra u jídel</div></td>
                  <td style="padding:0 5px;"><div style="background-color:#41174c;border:1px solid #a3408a;color:#fbcfe8;padding:7px 14px;border-radius:999px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.04em;">Pohyb na den</div></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#7c3aed" height="6" style="height:6px;font-size:6px;line-height:6px;background-color:#7c3aed;background-image:linear-gradient(90deg,#a78bfa 0%,#7c3aed 35%,#ec4899 70%,#fde68a 100%);">&nbsp;</td>
          </tr>
          <tr>
            <td bgcolor="#0d061a" align="center" style="background-color:#0d061a;padding:18px 28px;border-bottom:1px solid rgba(167,139,250,0.16);">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" style="padding:0 14px;color:#a78bfa;font-family:Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">7 dní</td>
                  <td style="color:#475569;padding:0 6px;font-family:Arial,sans-serif;">·</td>
                  <td align="center" style="padding:0 14px;color:#60a5fa;font-family:Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">B / S / T</td>
                  <td style="color:#475569;padding:0 6px;font-family:Arial,sans-serif;">·</td>
                  <td align="center" style="padding:0 14px;color:#ec4899;font-family:Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">Pohyb</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-body-pad" bgcolor="#13091e" style="padding:0;background-color:#13091e;background-image:radial-gradient(ellipse 70% 35% at 0% 18%, rgba(124,58,246,0.22) 0%, transparent 60%),radial-gradient(ellipse 60% 30% at 100% 48%, rgba(236,72,153,0.16) 0%, transparent 60%),radial-gradient(ellipse 70% 35% at 0% 80%, rgba(96,165,250,0.14) 0%, transparent 60%),url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2244%22%20height%3D%2244%22%3E%3Ccircle%20cx%3D%221.5%22%20cy%3D%221.5%22%20r%3D%221%22%20fill%3D%22%23a78bfa%22%20fill-opacity%3D%220.07%22%2F%3E%3C%2Fsvg%3E'),linear-gradient(185deg,#1a1030 0%,#120b22 42%,#0a0612 100%);">
              ${loginBlock}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
                <tr>
                  <td class="email-plan-pad" style="padding:24px 28px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.55;font-family:Arial,sans-serif;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#160f24" style="border:1px solid rgba(167,139,250,0.24);border-radius:18px;overflow:hidden;background-color:#160f24;box-shadow:0 24px 60px rgba(15,8,30,0.55);">
                      <tr><td bgcolor="#7c3aed" height="4" style="height:4px;font-size:4px;line-height:4px;background-color:#7c3aed;background-image:linear-gradient(90deg,#a78bfa 0%,#7c3aed 35%,#ec4899 70%,#fde68a 100%);">&nbsp;</td></tr>
                      <tr><td bgcolor="#160f24" style="padding:22px 20px 20px;background-color:#160f24;background-image:radial-gradient(ellipse 90% 35% at 0% 0%, rgba(124,58,246,0.18) 0%, transparent 60%),radial-gradient(ellipse 80% 30% at 100% 100%, rgba(236,72,153,0.1) 0%, transparent 60%);">
                    ${safePlanHtml}
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#1a0e34" align="center" style="background-color:#1a0e34;background-image:radial-gradient(ellipse 90% 80% at 50% 0%, rgba(124,58,246,0.32) 0%, transparent 60%),linear-gradient(180deg,#1d0e3d 0%,#100722 100%);padding:36px 32px 36px;text-align:center;border-top:1px solid rgba(167,139,250,0.22);">
              <div style="font-size:9px;font-weight:800;letter-spacing:0.32em;text-transform:uppercase;color:#a78bfa;font-family:Arial,sans-serif;margin:0 0 12px;">Pojď do akce</div>
              <h2 style="margin:0 0 10px;font-size:26px;font-weight:900;color:#ffffff;line-height:1.15;font-family:Arial,sans-serif;letter-spacing:-0.025em;">Tvůj týden začíná teď.</h2>
              <p style="margin:0 auto 24px;max-width:420px;font-size:14px;color:#cbd5e1;font-family:Arial,sans-serif;line-height:1.6;">Otevři aplikaci a začni první den naplno — recepty, makra a tréninky tě tam čekají.</p>
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(planCta)}" style="height:54px;v-text-anchor:middle;width:340px;" arcsize="50%" stroke="f" fillcolor="${EMAIL_ACCENT_DEEP}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Otevřít plán v aplikaci →</center>
              </v:roundrect>
              <![endif]-->
              <a href="${escapeHtml(planCta)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:${EMAIL_ACCENT_DEEP};background-image:linear-gradient(135deg,${EMAIL_ACCENT_DEEP} 0%,#4f46e5 60%,#3730a3 100%);color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;padding:18px 40px;border-radius:999px;letter-spacing:0.4px;font-family:Arial,sans-serif;mso-hide:all;line-height:1.2;">Otevřít plán v aplikaci  →</a>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0;border-collapse:separate;">
                <tr>
                  <td style="padding:0 8px;"><a href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_ACCENT};font-size:13px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;border-bottom:1px solid rgba(167,139,250,0.4);padding-bottom:1px;">Profil</a></td>
                  <td style="color:#475569;padding:0 4px;font-family:Arial,sans-serif;">·</td>
                  <td style="padding:0 8px;"><a href="${escapeHtml(loginUrl)}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_ACCENT};font-size:13px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;border-bottom:1px solid rgba(167,139,250,0.4);padding-bottom:1px;">Přihlášení</a></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#08050f" align="center" style="background-color:#08050f;border-radius:0 0 22px 22px;padding:24px 32px;text-align:center;border-top:1px solid rgba(167,139,250,0.1);">
              <p style="margin:0 0 14px;font-size:12px;color:#64748b;font-family:Arial,sans-serif;line-height:1.5;">Tip: ulož si odkaz do záložek — k plánu se dostaneš jedním klepnutím.</p>
              <p style="margin:0 0 12px;line-height:1.6;font-size:12px;color:#475569;font-family:Arial,sans-serif;">
                <a href="mailto:info@bodyandmindon.cz?subject=Odhl%C3%A1%C5%A1en%C3%AD%20z%20e-mail%C5%AF" style="color:#94a3b8;text-decoration:underline;">Odhlášení</a>
                <span style="color:#475569;padding:0 6px;">|</span>
                ${socialRow}
              </p>
              <p style="margin:0 0 6px;font-size:12px;color:#475569;font-family:Arial,sans-serif;">Body &amp; Mind ON · strava, pohyb, rutina v jedné aplikaci</p>
              <p style="margin:8px 0 0;font-size:11px;color:#475569;font-family:Arial,sans-serif;">&copy; ${year} Body &amp; Mind ON</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
