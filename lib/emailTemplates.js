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

/** „Tvoje čísla“ z aktuálního řádku body_metrics (ne ze zamčeného plan_html). */
function buildTvojeCislaHeroBlockFromBodyMetrics(bm) {
  if (!bm || typeof bm !== 'object') return '';
  const height =
    bm.height_cm != null && String(bm.height_cm).trim() !== '' ? escapeHtml(String(bm.height_cm)) : '—';
  const weight =
    bm.weight_kg != null && String(bm.weight_kg).trim() !== '' ? escapeHtml(String(bm.weight_kg)) : '—';
  const goalEsc = escapeHtml(goalLabelCs(bm.goal));
  const numbersContent = `<ul style="margin:0;padding-left:20px;color:${EMAIL_TEXT};font-size:14px;line-height:1.65;font-family:Arial,sans-serif;"><li style="margin:6px 0;"><strong>Výška:</strong> ${height} cm</li><li style="margin:6px 0;"><strong>Váha:</strong> ${weight} kg</li><li style="margin:6px 0;"><strong>Cíl:</strong> ${goalEsc}</li></ul>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:16px;border:1px solid rgba(167,139,250,0.26);overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.28);" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(167,139,250,0.22);color:${EMAIL_ACCENT};font-weight:800;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Tvoje údaje</td></tr>
  <tr><td style="padding:16px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.6;">${numbersContent}</td></tr>
</table>`;
}

function styleListForEmail(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/<ul[^>]*>/gi, `<ul style="margin:0 0 16px;padding-left:20px;color:${EMAIL_TEXT};font-size:14px;line-height:1.65;font-family:Arial,sans-serif;">`)
    .replace(/<li[^>]*>/gi, '<li style="margin:6px 0;">');
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
    .replace(/<div[^>]*\bplan-exercise-no-media\b[^>]*>[\s\S]*?<\/div>/gi, '');
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

/** Řádek výživy u jídla → kompaktní odznaky podle B/S/T z planRendereru. */
function transformMealNutritionLinesToMacroTags(html) {
  return html.replace(
    /<p[^>]*class="meal-nutrition-line"[^>]*>\s*<small>([^<]*)<\/small>\s*<\/p>/gi,
    (_, inner) => {
      const raw = String(inner).replace(/\u00a0/g, ' ').replace(/\bzdraví\b/gi, 'hodnocení');
      const b = raw.match(/\bB\s*(\d+)\s*g\b/i)?.[1];
      const s = raw.match(/\bS\s*(\d+)\s*g\b/i)?.[1];
      const t = raw.match(/\bT\s*(\d+)\s*g\b/i)?.[1];
      const tag = (label, val, border, glow, fg, bg) =>
        `<span style="display:inline-block;margin:3px 8px 3px 0;padding:6px 11px;border-radius:999px;font-size:11px;font-weight:800;font-family:Arial,sans-serif;background:${bg};color:${fg};border:1px solid ${border};letter-spacing:0.03em;box-shadow:0 0 12px ${glow};">${label} ${escapeHtml(val)} g</span>`;
      const tags = [];
      if (b) tags.push(tag('Bílkoviny', b, 'rgba(96,165,250,0.45)', 'rgba(59,130,246,0.15)', '#dbeafe', 'rgba(59,130,246,0.14)'));
      if (s) tags.push(tag('Sacharidy', s, 'rgba(251,191,36,0.42)', 'rgba(251,191,36,0.12)', '#fef9c3', 'rgba(251,191,36,0.11)'));
      if (t) tags.push(tag('Tuky', t, 'rgba(248,113,113,0.42)', 'rgba(248,113,113,0.12)', '#fee2e2', 'rgba(239,68,68,0.11)'));
      if (!tags.length) {
        return `<p style="margin:0 0 8px;color:${EMAIL_MUTED};font-size:12px;font-family:Arial,sans-serif;line-height:1.45;"><small>${escapeHtml(raw)}</small></p>`;
      }
      return `<div style="margin:2px 0 12px;line-height:1.65;font-family:Arial,sans-serif;">${tags.join('')}</div>`;
    }
  );
}

function defaultWorkoutCardHtml() {
  const workoutList =
    `<ul style="margin:0;padding-left:18px;color:${EMAIL_TEXT};font-size:13px;line-height:1.55;font-family:Arial,sans-serif;"><li style="margin:6px 0;">Odpočinek — pohyb máš naplánovaný jako volný den.</li></ul>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;background:linear-gradient(145deg,rgba(124,58,237,0.12) 0%,rgba(30,27,46,0.85) 100%);border:1px solid rgba(167,139,250,0.28);border-radius:14px;overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,0.22);" bgcolor="#1c1828"><tr><td style="padding:11px 14px;border-bottom:1px solid rgba(167,139,250,0.22);color:${EMAIL_ACCENT};font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">Pohyb v tento den</td></tr><tr><td style="padding:13px 14px;">${workoutList}</td></tr></table>`;
}

function extractWorkoutBlock(content) {
  if (!content || typeof content !== 'string') return { mealContent: '', workoutCardHtml: defaultWorkoutCardHtml() };
  const workoutRe = /<p[^>]*>\s*<(?:b|strong)>\s*Trénink tento den:\s*<\/(?:b|strong)>\s*<\/p>\s*(<ul[\s\S]*?<\/ul>)?/i;
  const m = content.match(workoutRe);
  if (!m) return { mealContent: content, workoutCardHtml: defaultWorkoutCardHtml() };

  const workoutListRaw = (m[1] || '').trim();
  let workoutList = '<p style="margin:0;color:#e2e8f0;font-size:13px;line-height:1.55;font-family:Arial,sans-serif;">Odpočinek.</p>';
  let workoutMeta = '';
  let workoutLinks = '';
  if (workoutListRaw) {
    const liRe = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
    const cards = [];
    let liMatch;
    while ((liMatch = liRe.exec(workoutListRaw)) !== null) {
      const attrs = liMatch[1] || '';
      const labelHtml = String(liMatch[2] || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const wgerId = attrs.match(/\bdata-wger-exercise-id\s*=\s*["'](\d+)["']/i)?.[1] || '';
      const apiLinks = wgerId
        ? `<div style="margin-top:8px;line-height:1.6;"><a href="https://wger.de/en/exercise/${encodeURIComponent(wgerId)}/view" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0;padding:6px 11px;border-radius:999px;border:1px solid rgba(167,139,250,0.4);color:${EMAIL_ACCENT};text-decoration:none;font-size:11px;font-weight:700;font-family:Arial,sans-serif;background:rgba(124,58,237,0.12);">Popis cviku</a></div>`
        : '';
      cards.push(
        `<div style="margin:0 0 10px;padding:11px 12px;background:rgba(22,18,38,0.75);border:1px solid rgba(167,139,250,0.15);border-radius:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);"><div style="margin:0;color:#f8fafc;font-size:13px;line-height:1.5;font-weight:700;font-family:Arial,sans-serif;">${escapeHtml(labelHtml || 'Cvik')}</div>${apiLinks}</div>`
      );
    }
    if (cards.length > 0) {
      workoutList = cards.join('');
      workoutMeta = `<p style="margin:0 0 10px;color:${EMAIL_MUTED};font-size:12px;line-height:1.45;font-family:Arial,sans-serif;">U některých cviků je pod názvem odkaz na krátký popis pohybu.</p>`;
      workoutLinks = `<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(167,139,250,0.18);line-height:1.6;"><a href="https://wger.de/en/exercise/overview/" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:6px 11px;border-radius:999px;border:1px solid rgba(167,139,250,0.4);color:${EMAIL_ACCENT};text-decoration:none;font-size:11px;font-weight:700;font-family:Arial,sans-serif;background:rgba(124,58,237,0.12);">Další nápady na cviky</a></div>`;
    }
  }

  const workoutCardHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;background:linear-gradient(145deg,rgba(124,58,237,0.12) 0%,rgba(30,27,46,0.85) 100%);border:1px solid rgba(167,139,250,0.28);border-radius:14px;overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,0.22);" bgcolor="#1c1828"><tr><td style="padding:11px 14px;border-bottom:1px solid rgba(167,139,250,0.22);color:${EMAIL_ACCENT};font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">Pohyb v tento den</td></tr><tr><td style="padding:13px 14px;">${workoutMeta}${workoutList}${workoutLinks}</td></tr></table>`;
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
      return `<div class="email-day-sum" style="margin:10px 0 4px;padding:12px 14px;border-radius:12px;background:rgba(22,18,38,0.85);border:1px solid rgba(167,139,250,0.22);color:${EMAIL_MUTED};font-size:12px;line-height:1.5;font-family:Arial,sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);"><span style="font-weight:700;color:${EMAIL_TEXT};letter-spacing:0.06em;text-transform:uppercase;font-size:10px;">Orientační součet dne</span><br/><span style="color:${EMAIL_TEXT};font-weight:600;margin-top:6px;display:inline-block;">${escapeHtml(normalized)}</span></div>`;
    }
  );
}

/** Jednotlivá jídla jako samostatné „mini karty“ uvnitř denního bloku (jen e-mail). */
function wrapPremiumMealMiniCards(html) {
  if (!html || typeof html !== 'string') return html;
  const re =
    /<p style="margin:0 0 12px;padding:10px 0[^"]*"[^>]*>[\s\S]*?(?=<p style="margin:0 0 12px;padding:10px 0|<div class="email-day-sum"|$)/gi;
  const wrapOpen = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 11px;border-collapse:separate;border-spacing:0;background:linear-gradient(155deg,rgba(26,22,40,0.96) 0%,rgba(18,15,28,0.98) 100%);border-radius:14px;border:1px solid rgba(167,139,250,0.2);box-shadow:0 6px 22px rgba(0,0,0,0.32), 0 0 22px rgba(124,58,237,0.06);" bgcolor="#1a1628"><tr><td style="padding:13px 15px;">`;
  const wrapClose = '</td></tr></table>';
  return html.replace(re, (block) => wrapOpen + block.trim() + wrapClose);
}

/** Denní makra z <ul> jako řada kompaktních odznaků (e-mail). */
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

  const spacer = `<td style="width:8px;line-height:1px;font-size:1px;">&nbsp;</td>`;

  const chip = (mainHtml, hueBorder, hueGlow, hueText, hueBg) =>
    `<td style="vertical-align:middle;padding:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;"><tr><td style="padding:9px 14px;border-radius:999px;background:${hueBg};border:1px solid ${hueBorder};color:${hueText};font-size:13px;font-weight:800;font-family:Arial,sans-serif;line-height:1.25;white-space:nowrap;box-shadow:0 0 16px ${hueGlow};">${mainHtml}</td></tr></table></td>`;

  const cells = [];
  if (calNum) {
    cells.push(chip(`${calNum} kcal`, 'rgba(167,139,250,0.42)', 'rgba(124,58,237,0.18)', '#ede9fe', 'rgba(124,58,237,0.14)'));
  }
  if (protNum) {
    cells.push(chip(`${protNum} g bílk.`, 'rgba(96,165,250,0.45)', 'rgba(59,130,246,0.14)', '#dbeafe', 'rgba(59,130,246,0.12)'));
  }
  if (carbsNum) {
    cells.push(chip(`${carbsNum} g sach.`, 'rgba(251,191,36,0.42)', 'rgba(251,191,36,0.12)', '#fef3c7', 'rgba(251,191,36,0.1)'));
  }
  if (fatNum) {
    cells.push(chip(`${fatNum} g tuků`, 'rgba(248,113,113,0.42)', 'rgba(248,113,113,0.12)', '#fee2e2', 'rgba(239,68,68,0.1)'));
  }

  if (!cells.length) return styleListForEmail(rawUlBlock);

  const rowInner = cells.map((td, i) => (i === 0 ? td : spacer + td)).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;font-family:Arial,sans-serif;"><tr>${rowInner}</tr></table>`;
}

function ingredientCountPhraseCs(n) {
  const x = Number(n) || 0;
  if (x === 1) return '1 položka';
  if (x >= 2 && x <= 4) return `${x} položky`;
  return `${x} položek`;
}

/**
 * E-mailové klienty často ignorují &lt;details&gt; nebo ho mají pořád rozbalený — seznam surovin do e-mailu nedáváme,
 * jen krátký řádek + odkaz do aplikace (plný seznam je v profilu u jídla).
 */
function compactMealIngredientBlocksForEmail(html, profileUrl) {
  if (!html || typeof html !== 'string') return html;
  const base = String(profileUrl || `${getPublicAppUrl().replace(/\/$/, '')}/profil`).replace(/\/$/, '');
  const href = escapeHtml(base);
  const re =
    /<p([^>]*class="[^"]*meal-ingredient-portions-h[^"]*"[^>]*)>([\s\S]*?)<\/p>\s*<ul([^>]*class="[^"]*meal-ingredient-portions[^"]*"[^>]*)>([\s\S]*?)<\/ul>/gi;
  return html.replace(re, (_pAttrs, _pInner, _ulAttrs, liBlock) => {
    const itemCount = (liBlock.match(/<li\b/gi) || []).length;
    const countBit =
      itemCount > 0 ? `Orientačně ${ingredientCountPhraseCs(itemCount)} — ` : '';
    const boxStyle =
      'margin:8px 0 14px;padding:12px 14px;border-radius:12px;background:rgba(124,58,237,0.1);border:1px solid rgba(167,139,250,0.35);color:#c4b5fd;font-size:12px;line-height:1.5;font-family:Arial,sans-serif;';
    return `<p style="${boxStyle}">${countBit}<strong>Suroviny</strong> si rozbalíš v aplikaci: <a href="${href}" style="color:#e9d5ff;font-weight:700;text-decoration:underline;">Profil → Jídelníček</a>, klepni na konkrétní jídlo.</p>`;
  });
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

  let out = sanitizePlanHtml(html);
  if (!trainingInEmail) {
    out = stripNutritionOnlyTrainingFromPlanHtml(out);
  } else {
    out = stripGlobalTrainingPlanIntroFromHtml(out);
  }

  // 1) Tvoje čísla — při předání body_metrics z DB aktuální hodnoty; jinak blok z HTML plánu
  let numbersHeroBlock = '';
  const numbersRegex = /<h3[^>]*>[^<]*Tvoje čísla[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  if (bmInject && typeof bmInject === 'object') {
    out = out.replace(numbersRegex, '');
    numbersHeroBlock = buildTvojeCislaHeroBlockFromBodyMetrics(bmInject);
  } else {
    const numbersMatch = out.match(numbersRegex);
    if (numbersMatch && numbersMatch[1].trim()) {
      const numbersContent = styleListForEmail(numbersMatch[1].trim());
      out = out.replace(numbersMatch[0], '');
      numbersHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:16px;border:1px solid rgba(167,139,250,0.26);overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.28);" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(167,139,250,0.22);color:${EMAIL_ACCENT};font-weight:800;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Tvoje údaje</td></tr>
  <tr><td style="padding:16px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.6;">${numbersContent}</td></tr>
</table>`;
    }
  }

  // 2) Makra → tabulka
  let macrosHeroBlock = '';
  const macrosRegex = /<h3[^>]*>[^<]*Denní cíle[^<]*(?:makra)?[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  const macrosMatch = out.match(macrosRegex);
  if (macrosMatch && macrosMatch[1].trim()) {
    const rawMacros = macrosMatch[1].trim();
    out = out.replace(macrosMatch[0], '');
    const macrosInner = /<ul[\s\S]*?<\/ul>/i.test(rawMacros)
      ? formatMacrosBlockHtml(rawMacros.match(/<ul[\s\S]*?<\/ul>/i)?.[0] || rawMacros)
      : styleListForEmail(rawMacros);
    macrosHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:16px;border:1px solid rgba(167,139,250,0.26);overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.28);" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(167,139,250,0.22);color:${EMAIL_ACCENT};font-weight:800;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Denní cíle</td></tr>
  <tr><td style="padding:16px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.6;">${macrosInner}</td></tr>
</table>`;
  }

  // 3) Mindset
  let mindsetHeroBlock = '';
  const mindsetRegex = /<h3[^>]*>[^<]*Mindset na tento týden[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  const mindsetMatch = out.match(mindsetRegex);
  if (mindsetMatch) {
    const mindsetContent = mindsetMatch[1].trim()
      .replace(/<p[^>]*>/gi, `<p style="margin:0 0 12px;color:${EMAIL_TEXT};font-size:15px;line-height:1.65;">`)
      .replace(/<b>/gi, '<b style="color:#ffffff;">');
    out = out.replace(mindsetMatch[0], '');
    mindsetHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:16px;border:1px solid rgba(167,139,250,0.26);overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.28);" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(167,139,250,0.22);color:${EMAIL_ACCENT};font-weight:800;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Návyky na tento týden</td></tr>
  <tr><td style="padding:18px 18px;color:${EMAIL_TEXT};">${mindsetContent}</td></tr>
</table>`;
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
        content = appendInlineRecipeLinksForEmailMeals(content);
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;background:${EMAIL_CARD};border-radius:20px;border:1px solid rgba(167,139,250,0.28);overflow:hidden;box-shadow:0 14px 40px rgba(0,0,0,0.42), 0 0 32px rgba(124,58,237,0.07);font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td class="email-day-head" style="padding:20px 20px 18px;background:linear-gradient(118deg,#352060 0%,#1a1530 46%,#0a0816 100%);color:#ffffff;border-bottom:1px solid rgba(196,181,253,0.38);box-shadow:inset 0 -1px 0 rgba(255,255,255,0.05);">
    <div style="font-size:21px;font-weight:800;line-height:1.22;font-family:Arial,sans-serif;letter-spacing:-0.03em;color:#faf5ff;">${escapeHtml(displayDayName)}</div>
    <div style="margin-top:10px;height:3px;width:52px;border-radius:999px;background:linear-gradient(90deg,#c4b5fd,rgba(196,181,253,0));opacity:0.9;"></div>
  </td></tr>
  <tr><td style="padding:18px 18px 22px;color:${EMAIL_TEXT};font-size:14px;line-height:1.55;background:linear-gradient(185deg,rgba(26,22,42,0.55) 0%,transparent 42%);">
    ${dayInner}
  </td></tr>
</table>`;
      }
    }

    const mealSectionTitle = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 14px;font-family:Arial,sans-serif;"><tr><td class="email-section-h" style="padding:0 0 8px;color:#f8fafc;font-weight:800;font-size:22px;letter-spacing:-0.03em;line-height:1.2;">Týdenní jídelníček</td></tr><tr><td style="padding:0;color:${EMAIL_MUTED};font-size:13px;line-height:1.55;">Každý den má vlastní kartu — přehledně, bez zbytečných opakování.</td></tr></table>`;
    const recipeHintOnce = `<p style="margin:0 0 22px;padding-left:14px;border-left:2px solid rgba(167,139,250,0.45);color:${EMAIL_MUTED};font-size:13px;line-height:1.55;font-family:Arial,sans-serif;">Postupy receptů a přesné suroviny doplníš v aplikaci u jednotlivých jídel (Profil → Jídelníček).</p>`;
    out = beforeMeal + mealSectionTitle + recipeHintOnce + mealHtml + afterMeal;
  }

  const sectionCards = [
    { re: /<h3[^>]*>[^<]*Suplementace[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Suplementace' },
    { re: /<h3[^>]*>[^<]*Regenerace[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Regenerace a odpočinek' },
    { re: /<h3[^>]*>[^<]*Nákupní seznam[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Nákupní seznam' },
  ];
  for (const { re, title } of sectionCards) {
    const m = out.match(re);
    if (m && m[1].trim()) {
      const cardContent = styleListForEmail(m[1].trim());
      const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:16px;border:1px solid rgba(167,139,250,0.26);overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.28);" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(167,139,250,0.22);color:${EMAIL_ACCENT};font-weight:800;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(title)}</td></tr>
  <tr><td style="padding:16px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.6;">${cardContent}</td></tr>
</table>`;
      out = out.replace(m[0], card);
    }
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
  return numbersHeroBlock + macrosHeroBlock + mindsetHeroBlock + out;
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
    ? (namePart ? `Ahoj ${escapeHtml(namePart)}, posíláme upravený plán podle tvých posledních změn.` : 'Ahoj, posíláme upravený plán podle tvých posledních změn.')
    : (namePart ? `Ahoj ${escapeHtml(namePart)}, tady máš přehledný jídelní plán na celý týden.` : 'Ahoj, tady máš přehledný jídelní plán na celý týden.');

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

  const emailOuterBg = '#05030c';

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Body &amp; Mind ON</title>
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .email-outer-pad { padding: 24px 12px !important; }
      .email-card { width: 100% !important; max-width: 100% !important; border-radius: 16px !important; }
      .email-body-pad { padding: 24px 16px 16px !important; }
      .email-plan-pad { padding: 18px 14px !important; }
      .email-day-head div:first-child { font-size: 19px !important; line-height: 1.2 !important; }
      .email-section-h { letter-spacing: 0.06em !important; font-size: 12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${emailOuterBg};color:${EMAIL_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${emailOuterBg};background-image:radial-gradient(ellipse 110% 85% at 50% -15%, rgba(124,58,246,0.22) 0%, transparent 48%),radial-gradient(ellipse 55% 45% at 100% 40%, rgba(99,102,241,0.14) 0%, transparent 42%),linear-gradient(185deg,#100818 0%,${emailOuterBg} 52%,#020106 100%);" bgcolor="${emailOuterBg}">
    <tr>
      <td align="center" class="email-outer-pad" style="padding:40px 20px;background-image:radial-gradient(ellipse 95% 75% at 50% 0%, rgba(167,139,250,0.16) 0%, transparent 58%);">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width:600px;width:100%;margin:0 auto;">
          <tr>
            <td align="center" style="background:radial-gradient(ellipse 85% 130% at 50% -25%, rgba(124,58,246,0.38) 0%, transparent 58%),linear-gradient(138deg,#1c1036 0%,#0e081c 52%,#050308 100%);border-radius:22px 22px 0 0;padding:42px 36px 34px;text-align:center;border-bottom:1px solid rgba(167,139,250,0.28);box-shadow:inset 0 1px 0 rgba(255,255,255,0.07);">
              <div style="display:inline-block;background:linear-gradient(135deg,#a78bfa,#6366f1 52%,#4f46e5);border-radius:999px;padding:10px 22px;margin-bottom:22px;box-shadow:0 4px 26px rgba(79,70,229,0.48), 0 0 22px rgba(167,139,250,0.25);">
                <span style="color:#ffffff;font-size:11px;font-weight:800;letter-spacing:2.8px;text-transform:uppercase;">BODY &amp; MIND ON</span>
              </div>
              <h1 style="margin:0 0 12px;font-size:29px;font-weight:800;color:#f8fafc;line-height:1.12;font-family:Arial,sans-serif;letter-spacing:-0.035em;">Tvůj týdenní plán</h1>
              <p style="margin:0;font-size:15px;color:#cbd5e1;font-family:Arial,sans-serif;line-height:1.55;">${greetingLine} Níže najdeš přehledný rozvrh; po přihlášení ho rozvineš v aplikaci.</p>
            </td>
          </tr>
          <tr>
            <td class="email-body-pad" style="padding:0;background:linear-gradient(185deg,#161026 0%,#0f0d18 38%,#0a0814 100%);" bgcolor="#0f0f1a">
              ${loginBlock}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
                <tr>
                  <td class="email-plan-pad" style="padding:28px 32px 24px;color:${EMAIL_TEXT};font-size:14px;line-height:1.55;font-family:Arial,sans-serif;">
                    ${safePlanHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#0f0f1a;padding:24px 32px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(planCta)}" style="height:48px;v-text-anchor:middle;width:300px;" arcsize="12%" stroke="f" fillcolor="${EMAIL_ACCENT_DEEP}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Zobrazit plán v aplikaci</center>
              </v:roundrect>
              <![endif]-->
              <a href="${escapeHtml(planCta)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:linear-gradient(135deg,${EMAIL_ACCENT_DEEP},#4f46e5);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:999px;letter-spacing:0.35px;font-family:Arial,sans-serif;box-shadow:0 8px 28px rgba(79,70,229,0.35);mso-hide:all;">Zobrazit plán v aplikaci</a>
              <p style="margin:20px 0 0;font-size:12px;color:#64748b;font-family:Arial,sans-serif;">Přihlášení: <a href="${escapeHtml(loginUrl)}" style="color:${EMAIL_ACCENT};text-decoration:none;">${escapeHtml(loginUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#06040f;border-radius:0 0 20px 20px;padding:24px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.04);">
              <p style="margin:0 0 12px;line-height:1.6;font-size:12px;color:#334155;font-family:Arial,sans-serif;">
                <a href="mailto:info@bodyandmindon.cz?subject=Odhl%C3%A1%C5%A1en%C3%AD%20z%20e-mail%C5%AF" style="color:#64748b;text-decoration:underline;">Odhlášení z e-mailů</a>
                <span style="color:#475569;padding:0 6px;">|</span>
                ${socialRow}
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#334155;font-family:Arial,sans-serif;">Body &amp; Mind ON · tvůj plán na stravu a pohyb</p>
              <p style="margin:0;font-size:11px;color:#1e293b;font-family:Arial,sans-serif;">Chceš změnit nastavení? <a href="${escapeHtml(profileUrl)}" style="color:${EMAIL_ACCENT};text-decoration:none;">Upravit profil</a></p>
              <p style="margin:12px 0 0;font-size:11px;color:#475569;font-family:Arial,sans-serif;">&copy; ${year} Body &amp; Mind ON</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
