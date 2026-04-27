/**
 * Šablony a transformace HTML pro transakční e-maily s plánem.
 * Inline CSS + tabulky kvůli Gmailu / Outlooku.
 */

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

const EMAIL_TEXT = '#e2e8f0';
const EMAIL_CARD = '#1a1a2e';
const EMAIL_BG = '#0f0f1a';
const EMAIL_ACCENT = '#7c3aed';

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

function replaceMealOpening(html, mealNamePattern, emojiLabel, withBottomBorder) {
  const border = withBottomBorder ? `border-bottom:1px solid rgba(124,58,237,0.25);` : '';
  const re = new RegExp(`<p([^>]*)>\\s*<b>\\s*${mealNamePattern}\\s*:?\\s*<\\/b>`, 'gi');
  return html.replace(re, (_, attrs) => {
    const dataAttrs = dataAttrsFromPAttrs(attrs);
    return `<p style="margin:0 0 12px;padding:10px 0;${border}color:${EMAIL_TEXT};font-size:14px;line-height:1.55;font-family:Arial,sans-serif;"${dataAttrs}><span style="color:${EMAIL_ACCENT};font-weight:700;font-size:13px;letter-spacing:0.02em;">${emojiLabel}</span> `;
  });
}

/** Tučný název jídla hned za štítkem typu jídla (text až do konce odstavce). */
function boldMealTitleAfterLabel(html) {
  return html.replace(
    /(<span style="[^"]*color:\s*#7c3aed[^"]*">[^<]*<\/span>)\s+([^<]+)(?=<\/p>)/gi,
    (_, span, title) => `${span} <strong style="color:#f8fafc;font-weight:700;">${title.trim()}</strong>`
  );
}

const RECIPE_LINK_A_STYLE =
  'display:inline-block;font-size:11px;font-weight:600;color:#7c3aed;text-decoration:none;padding:3px 10px;border:1px solid rgba(124,58,237,0.4);border-radius:5px;margin-top:5px;letter-spacing:0.3px;';

/** Odkaz na recept v e-mailu: doplní jen u odstavce s data-recipe-id, pokud už není plan-meal-external-recipe (nový renderer). */
function appendInlineRecipeLinksForEmailMeals(html) {
  if (!html || typeof html !== 'string') return html;
  const app = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  return html.replace(
    /<p([^>]*\bdata-recipe-id\s*=\s*["'](\d+)["'][^>]*)>([\s\S]*?)<\/p>(?!\s*<p[^>]*\bplan-meal-external-recipe\b)/gi,
    (full, attrs, id) => {
      if (/meal-nutrition-line|plan-meal-external-recipe/i.test(attrs)) return full;
      const href = `${app}/api/spoonacular-recipe?id=${encodeURIComponent(id)}`;
      const wrap = `<p style="margin:2px 0 12px;line-height:1.4;font-family:Arial,sans-serif;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="${RECIPE_LINK_A_STYLE}">📖 Recept</a></p>`;
      return full + wrap;
    }
  );
}

/** Řádek výživy u jídla → barevné tagy 🔵🟡🔴 podle B/S/T z planRendereru. */
function transformMealNutritionLinesToMacroTags(html) {
  return html.replace(
    /<p[^>]*class="meal-nutrition-line"[^>]*>\s*<small>([^<]*)<\/small>\s*<\/p>/gi,
    (_, inner) => {
      const raw = String(inner).replace(/\u00a0/g, ' ');
      const b = raw.match(/\bB\s*(\d+)\s*g\b/i)?.[1];
      const s = raw.match(/\bS\s*(\d+)\s*g\b/i)?.[1];
      const t = raw.match(/\bT\s*(\d+)\s*g\b/i)?.[1];
      const tags = [];
      if (b) {
        tags.push(
          `<span style="display:inline-block;margin:4px 8px 4px 0;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;font-family:Arial,sans-serif;background:rgba(37,99,235,0.28);color:#93c5fd;border:1px solid rgba(59,130,246,0.5);">🔵 Bílkoviny ${escapeHtml(b)} g</span>`
        );
      }
      if (s) {
        tags.push(
          `<span style="display:inline-block;margin:4px 8px 4px 0;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;font-family:Arial,sans-serif;background:rgba(234,179,8,0.22);color:#fde047;border:1px solid rgba(250,204,21,0.45);">🟡 Sacharidy ${escapeHtml(s)} g</span>`
        );
      }
      if (t) {
        tags.push(
          `<span style="display:inline-block;margin:4px 8px 4px 0;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;font-family:Arial,sans-serif;background:rgba(220,38,38,0.22);color:#fca5a5;border:1px solid rgba(248,113,113,0.45);">🔴 Tuky ${escapeHtml(t)} g</span>`
        );
      }
      if (!tags.length) {
        return `<p style="margin:0 0 8px;color:#94a3b8;font-size:12px;font-family:Arial,sans-serif;"><small>${escapeHtml(inner)}</small></p>`;
      }
      return `<div style="margin:0 0 14px;line-height:1.6;font-family:Arial,sans-serif;">${tags.join('')}</div>`;
    }
  );
}

/** Denní makra z <ul> jako čtyřsloupcová karta (e-mail). */
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

  const spacer = `<td style="width:8px;font-size:1px;line-height:1px;">&nbsp;</td>`;

  const macroCell = (bigHtml, subLabel, border, color, bg) =>
    `<td style="text-align:center;padding:16px;background:${bg};border:1px solid ${border};border-radius:12px;">
      <div style="font-size:22px;font-weight:800;color:${color};font-family:Arial,sans-serif;">${bigHtml}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;font-family:Arial,sans-serif;">${subLabel}</div>
    </td>`;

  const cells = [];
  if (calNum) {
    cells.push(macroCell(calNum, 'kcal', 'rgba(124,58,237,0.2)', '#a78bfa', 'rgba(124,58,237,0.08)'));
  }
  if (protNum) {
    cells.push(macroCell(`${protNum}g`, 'bílkoviny', 'rgba(59,130,246,0.2)', '#60a5fa', 'rgba(59,130,246,0.08)'));
  }
  if (carbsNum) {
    cells.push(macroCell(`${carbsNum}g`, 'sacharidy', 'rgba(251,191,36,0.2)', '#fbbf24', 'rgba(251,191,36,0.08)'));
  }
  if (fatNum) {
    cells.push(macroCell(`${fatNum}g`, 'tuky', 'rgba(239,68,68,0.2)', '#f87171', 'rgba(239,68,68,0.08)'));
  }

  if (!cells.length) return styleListForEmail(rawUlBlock);

  const rowInner = cells.map((td, i) => (i === 0 ? td : spacer + td)).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;font-family:Arial,sans-serif;"><tr>${rowInner}</tr></table>`;
}

/**
 * Transformuje HTML plánu pro e-mail: karty, tmavý prémiový vzhled, makra, trénink v denních kartách (bez obrázků).
 */
export function formatPlanHtmlForEmail(html) {
  if (!html || typeof html !== 'string') return '';
  let out = sanitizePlanHtml(html);
  out = out.replace(/<h3[^>]*>\s*[^<]*Tréninkový plán[^<]*<\/h3>[\s\S]*?(?=<h3[^>]*>|$)/gi, '');
  out = out.replace(/<p[^>]*>\s*<(?:b|strong)>\s*Trénink tento den:\s*<\/(?:b|strong)>\s*<\/p>\s*<ul[\s\S]*?<\/ul>/gi, '');
  out = out.replace(/<p[^>]*>\s*<(?:b|strong)>\s*Trénink tento den:\s*<\/(?:b|strong)>\s*<\/p>/gi, '');

  // 1) Tvoje čísla
  let numbersHeroBlock = '';
  const numbersRegex = /<h3[^>]*>[^<]*Tvoje čísla[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  const numbersMatch = out.match(numbersRegex);
  if (numbersMatch && numbersMatch[1].trim()) {
    const numbersContent = styleListForEmail(numbersMatch[1].trim());
    out = out.replace(numbersMatch[0], '');
    numbersHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:14px;border:1px solid rgba(124,58,237,0.35);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(124,58,237,0.4);color:${EMAIL_ACCENT};font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Tvoje čísla</td></tr>
  <tr><td style="padding:16px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.6;">${numbersContent}</td></tr>
</table>`;
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
    macrosHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:14px;border:1px solid rgba(124,58,237,0.4);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(124,58,237,0.45);color:${EMAIL_ACCENT};font-weight:700;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;">📊 Denní cíle</td></tr>
  <tr><td style="padding:16px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.6;">${macrosInner}</td></tr>
</table>`;
  }

  // 3) Mindset
  let mindsetHeroBlock = '';
  const mindsetRegex = /<h3[^>]*>[^<]*Mindset na tento týden[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  const mindsetMatch = out.match(mindsetRegex);
  if (mindsetMatch) {
    const mindsetContent = mindsetMatch[1].trim()
      .replace(/<p[^>]*>/gi, '<p style="margin:0 0 12px;color:#e9d5ff;font-size:15px;line-height:1.7;">')
      .replace(/<b>/gi, '<b style="color:#ffffff;">');
    out = out.replace(mindsetMatch[0], '');
    mindsetHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:14px;border:1px solid rgba(124,58,237,0.35);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(124,58,237,0.4);color:${EMAIL_ACCENT};font-weight:700;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Mindset na tento týden</td></tr>
  <tr><td style="padding:18px 18px;color:${EMAIL_TEXT};">${mindsetContent}</td></tr>
</table>`;
  }

  // Jídelníček + denní karty (pouze jídla)
  const dayMatch = out.match(/<h3[^>]*>([^<]*(?:Jídelníček|jidelníček)[^<]*)<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i);
  if (dayMatch) {
    const beforeMeal = out.slice(0, dayMatch.index);
    const afterMeal = out.slice(dayMatch.index + dayMatch[0].length);
    const mealSection = dayMatch[2];

    const dayBlocks = mealSection.split(/(?=<h4[^>]*>)/i).filter(Boolean);
    let mealHtml = '';
    for (const block of dayBlocks) {
      const h4Match = block.match(/^<h4[^>]*>([^<]*)<\/h4>([\s\S]*)$/i);
      if (h4Match) {
        const dayName = (h4Match[1] || '').trim();
        const rawContent = (h4Match[2] || '').trim();
        const dayContent = rawContent.replace(/<h4[\s\S]*/i, '').trim();

        let content = dayContent
          .replace(/<p[^>]*>\s*<(?:b|strong)>\s*Trénink tento den:\s*<\/(?:b|strong)>\s*<\/p>\s*<ul[\s\S]*?<\/ul>/gi, '')
          .replace(/<p[^>]*>\s*<(?:b|strong)>\s*Trénink tento den:\s*<\/(?:b|strong)>\s*<\/p>/gi, '')
          .trim();
        content = replaceMealOpening(content, 'Snídaně', '🌅 Snídaně', true);
        content = replaceMealOpening(content, 'Oběd', '☀️ Oběd', true);
        content = replaceMealOpening(content, 'Večeře', '🌙 Večeře', false);
        content = replaceMealOpening(content, 'Svačina', '🍎 Svačina', false);
        content = replaceMealOpening(content, 'Breakfast', '🌅 Snídaně', true);
        content = replaceMealOpening(content, 'Lunch', '☀️ Oběd', true);
        content = replaceMealOpening(content, 'Dinner', '🌙 Večeře', false);
        content = replaceMealOpening(content, 'Snack', '🍎 Svačina', false);

        content = boldMealTitleAfterLabel(content);
        content = appendInlineRecipeLinksForEmailMeals(content);
        content = transformMealNutritionLinesToMacroTags(content);

        content = content.replace(
          /<p(?!\s[^>]*style=)([^>]*)>/gi,
          `<p style="margin:0 0 10px;color:#94a3b8;font-size:13px;line-height:1.5;font-family:Arial,sans-serif;"$1>`
        );

        content = stripPlanMediaAttrsFromHtml(content);

        const dayInner = content;
        mealHtml += `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:16px;border:1px solid rgba(124,58,237,0.25);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;background:linear-gradient(90deg,#1a1a2e 0%,#252547 100%);color:#ffffff;font-weight:700;font-size:15px;letter-spacing:-0.02em;border-bottom:1px solid rgba(124,58,237,0.35);">${escapeHtml(dayName)}</td></tr>
  <tr><td style="padding:18px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.55;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td class="email-section-h" style="padding:0 0 10px;border-bottom:3px solid ${EMAIL_ACCENT};color:#ffffff;font-weight:800;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;">Co dnes jíst</td></tr></table>
    ${dayInner}
  </td></tr>
</table>`;
      }
    }

    const mealSectionTitle = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 16px;font-family:Arial,sans-serif;"><tr><td class="email-section-h" style="padding:6px 0 12px;border-bottom:3px solid ${EMAIL_ACCENT};color:#ffffff;font-weight:800;font-size:20px;letter-spacing:-0.02em;">🍽️ Tvůj jídelní plán</td></tr><tr><td style="padding:10px 0 0;color:#94a3b8;font-size:13px;">Přehled jídel a výživových hodnot · den po dni</td></tr></table>`;
    out = beforeMeal + mealSectionTitle + mealHtml + afterMeal;
  }

  const sectionCards = [
    { re: /<h3[^>]*>[^<]*Suplementace[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Suplementace', icon: '💊' },
    { re: /<h3[^>]*>[^<]*Regenerace[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Regenerace', icon: '🛏️' },
    { re: /<h3[^>]*>[^<]*Nákupní seznam[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i, title: 'Nákupní seznam', icon: '🛒' },
  ];
  for (const { re, title, icon } of sectionCards) {
    const m = out.match(re);
    if (m && m[1].trim()) {
      const cardContent = styleListForEmail(m[1].trim());
      const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:14px;border:1px solid rgba(124,58,237,0.35);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(124,58,237,0.4);color:${EMAIL_ACCENT};font-weight:700;font-size:14px;">${icon} ${escapeHtml(title)}</td></tr>
  <tr><td style="padding:16px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.6;">${cardContent}</td></tr>
</table>`;
      out = out.replace(m[0], card);
    }
  }

  out = out.replace(/<h3([^>]*)>([^<]*)<\/h3>/gi, (_, attrs, title) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px;font-family:Arial,sans-serif;"><tr><td style="padding:8px 0;border-bottom:1px solid rgba(124,58,237,0.35);color:${EMAIL_TEXT};font-weight:700;font-size:16px;">${escapeHtml((title || '').trim())}</td></tr></table>`
  );

  out = stripPlanMediaAttrsFromHtml(out);
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
  const app = (appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const profileUrl = `${app}/profil`;
  const planCta = (ctaUrl || profileUrl).replace(/\/$/, '');
  const year = new Date().getFullYear();

  const namePart = (firstName || '').trim().split(/\s+/)[0] || '';
  const greetingLine = planChangeContext
    ? (namePart ? `Hej ${escapeHtml(namePart)}, upravili jsme jídelní plán podle tvých změn 💪` : 'Hej, upravili jsme jídelní plán podle tvých změn 💪')
    : (namePart ? `Hej ${escapeHtml(namePart)}, tvůj jídelní plán je připraven 💪` : 'Hej, tvůj jídelní plán je připraven 💪');

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

  const emailOuterBg = '#0a0a0f';

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
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${emailOuterBg};color:${EMAIL_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${emailOuterBg};" bgcolor="${emailOuterBg}">
    <tr>
      <td align="center" class="email-outer-pad" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width:600px;width:100%;margin:0 auto;">
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#1a0533 0%,#0f0f1a 100%);border-radius:20px 20px 0 0;padding:40px 40px 32px;text-align:center;border-bottom:1px solid rgba(139,92,246,0.3);">
              <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:12px;padding:10px 20px;margin-bottom:20px;">
                <span style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">BODY &amp; MIND ON</span>
              </div>
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#f8fafc;line-height:1.2;font-family:Arial,sans-serif;">Tvůj týdenní plán 💪</h1>
              <p style="margin:0 0 12px;font-size:15px;color:#94a3b8;font-family:Arial,sans-serif;">Personalizovaný jídelníček a trénink připraven pro tebe</p>
              <p style="margin:0;font-size:15px;color:#e2e8f0;font-family:Arial,sans-serif;line-height:1.5;">${greetingLine}</p>
            </td>
          </tr>
          <tr>
            <td class="email-body-pad" style="padding:0;background-color:#0f0f1a;" bgcolor="#0f0f1a">
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
            <td style="background:#0f0f1a;padding:24px 32px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(planCta)}" style="height:48px;v-text-anchor:middle;width:300px;" arcsize="12%" stroke="f" fillcolor="#7c3aed">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Zobrazit plán v aplikaci</center>
              </v:roundrect>
              <![endif]-->
              <a href="${escapeHtml(planCta)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;letter-spacing:0.5px;font-family:Arial,sans-serif;mso-hide:all;">Zobrazit plán v aplikaci →</a>
              <p style="margin:20px 0 0;font-size:12px;color:#64748b;font-family:Arial,sans-serif;">Přihlášení: <a href="${escapeHtml(loginUrl)}" style="color:${EMAIL_ACCENT};text-decoration:none;">${escapeHtml(loginUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#070710;border-radius:0 0 20px 20px;padding:24px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.04);">
              <p style="margin:0 0 12px;line-height:1.6;font-size:12px;color:#334155;font-family:Arial,sans-serif;">
                <a href="mailto:info@bodyandmindon.cz?subject=Odhl%C3%A1%C5%A1en%C3%AD%20z%20e-mail%C5%AF" style="color:#64748b;text-decoration:underline;">Odhlášení z e-mailů</a>
                <span style="color:#475569;padding:0 6px;">|</span>
                ${socialRow}
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#334155;font-family:Arial,sans-serif;">Body &amp; Mind ON | Tvůj osobní AI fitness asistent</p>
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
