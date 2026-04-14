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

/** Zachová data-* a id z původních atributů <p …>. */
function dataAttrsFromPAttrs(attrs) {
  if (!attrs || typeof attrs !== 'string') return '';
  const parts = attrs.match(/\s+(?:data-[a-z0-9_-]+|id)="[^"]*"/gi);
  return parts ? parts.join('') : '';
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

/** Denní makra z <ul> jako tagy včetně 🔵🟡🔴 pro B/S/T. */
function formatMacrosBlockHtml(rawUlBlock) {
  const cal = rawUlBlock.match(/Kalorie[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const prot = rawUlBlock.match(/Bílkoviny[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const carbs = rawUlBlock.match(/Sacharidy[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const fat = rawUlBlock.match(/Tuky[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();

  const pillCal = (value) =>
    value
      ? `<span style="display:inline-block;margin:4px 8px 4px 0;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:700;font-family:Arial,sans-serif;background:rgba(148,163,184,0.2);color:#e2e8f0;border:1px solid rgba(148,163,184,0.35);">⚡ Kalorie ${escapeHtml(value)}</span>`
      : '';
  const pillB = (value) =>
    value
      ? `<span style="display:inline-block;margin:4px 8px 4px 0;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:700;font-family:Arial,sans-serif;background:rgba(37,99,235,0.28);color:#93c5fd;border:1px solid rgba(59,130,246,0.5);">🔵 Bílkoviny ${escapeHtml(value)}</span>`
      : '';
  const pillS = (value) =>
    value
      ? `<span style="display:inline-block;margin:4px 8px 4px 0;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:700;font-family:Arial,sans-serif;background:rgba(234,179,8,0.22);color:#fde047;border:1px solid rgba(250,204,21,0.45);">🟡 Sacharidy ${escapeHtml(value)}</span>`
      : '';
  const pillT = (value) =>
    value
      ? `<span style="display:inline-block;margin:4px 8px 4px 0;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:700;font-family:Arial,sans-serif;background:rgba(220,38,38,0.22);color:#fca5a5;border:1px solid rgba(248,113,113,0.45);">🔴 Tuky ${escapeHtml(value)}</span>`
      : '';

  const pills = [pillCal(cal), pillB(prot), pillS(carbs), pillT(fat)].join('');

  if (!pills.trim()) {
    return styleListForEmail(rawUlBlock);
  }
  return `<div style="margin:0;padding:4px 0;line-height:1.8;font-family:Arial,sans-serif;" role="list" aria-label="Denní makra">${pills}</div>`;
}

/** Jídlo s obrázkem Spoonacular (meal.image_url): 100×100, border-radius 12px. */
function wrapMealParagraphsWithThumbnails(html) {
  return html.replace(
    /<p([^>]*\sdata-image-url="([^"]*)"[^>]*)>([\s\S]*?)<\/p>/gi,
    (full, attrs, url, inner) => {
      const safeUrl = escapeHtml(url);
      const innerClean = inner.trim();
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;">
  <tr>
    <td width="112" valign="top" style="padding:0;width:112px;vertical-align:top;">
      <img src="${safeUrl}" alt="" width="100" height="100" style="display:block;width:100px;height:100px;max-width:100px;border-radius:12px;object-fit:cover;border:1px solid rgba(124,58,237,0.4);box-shadow:0 4px 16px rgba(0,0,0,0.3);" />
    </td>
    <td valign="middle" style="padding:0 0 0 14px;color:${EMAIL_TEXT};font-size:14px;line-height:1.55;font-family:Arial,sans-serif;">${innerClean}</td>
  </tr>
</table>`;
    }
  );
}

/** Cviky s náhledem GIF (data-gif-url z planRenderer). */
function wrapExerciseListItemsWithGifs(html) {
  return html.replace(
    /<li([^>]*)\sdata-gif-url="([^"]*)"([^>]*)>([\s\S]*?)<\/li>/gi,
    (_, before, url, after, inner) => {
      const safeUrl = escapeHtml(url);
      const text = inner.trim();
      return `<li style="margin:0 0 12px;padding:0;list-style:none;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>
      <td width="68" valign="middle" style="padding:0;width:68px;">
        <img src="${safeUrl}" alt="" width="60" height="60" style="display:block;width:60px;height:60px;max-width:60px;border-radius:12px;object-fit:cover;border:1px solid rgba(124,58,237,0.35);" />
      </td>
      <td valign="middle" style="padding:0 0 0 12px;color:${EMAIL_TEXT};font-size:14px;line-height:1.45;font-family:Arial,sans-serif;"><span style="font-size:16px;margin-right:6px;" aria-hidden="true">🏋️</span>${text}</td>
    </tr>
  </table>
</li>`;
    }
  );
}

function styleTrainingUl(html) {
  return html.replace(
    /<ul([^>]*)>/gi,
    '<ul style="margin:8px 0 0;padding:0 0 0 20px;list-style:disc;list-style-position:outside;"$1>'
  );
}

/**
 * Transformuje HTML plánu pro e-mail: karty, tmavý prémiový vzhled, náhledy jídel/cviků, makra jako tagy.
 */
export function formatPlanHtmlForEmail(html) {
  if (!html || typeof html !== 'string') return '';
  let out = html;

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

  // 2) Makra → pill tagy
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
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(124,58,237,0.45);color:${EMAIL_ACCENT};font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Denní cíle · makra</td></tr>
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

  // 4) Trénink – úvod (obecné zásady)
  let trainingHeroBlock = '';
  const trainingRegex = /<h3[^>]*>[^<]*(?:Tréninkový plán|Trénink)[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i;
  const trainingMatch = out.match(trainingRegex);
  if (trainingMatch && trainingMatch[1].trim()) {
    const trainingContent = trainingMatch[1].trim()
      .replace(/<p[^>]*>/gi, '<p style="margin:0 0 12px;color:#cbd5e1;font-size:14px;line-height:1.65;">')
      .replace(/<b>/gi, '<b style="color:#94a3b8;">');
    out = out.replace(trainingMatch[0], '');
    trainingHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background:${EMAIL_CARD};border-radius:14px;border:1px solid rgba(124,58,237,0.3);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(124,58,237,0.35);color:${EMAIL_ACCENT};font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Trénink · přehled</td></tr>
  <tr><td style="padding:18px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.65;">${trainingContent}</td></tr>
</table>`;
  }

  // Jídelníček + denní karty (jídla + trénink)
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

        const trainingRe = /(<p[^>]*>\s*<b>\s*Trénink tento den:\s*<\/b>\s*<\/p>\s*)([\s\S]*)$/i;
        const tm = dayContent.match(trainingRe);
        let mealOnly = dayContent;
        let trainingRest = '';
        if (tm) {
          mealOnly = dayContent.slice(0, tm.index).trim();
          trainingRest = dayContent.slice(tm.index).trim();
        }

        let content = mealOnly;
        content = replaceMealOpening(content, 'Snídaně', '🌅 Snídaně', true);
        content = replaceMealOpening(content, 'Oběd', '☀️ Oběd', true);
        content = replaceMealOpening(content, 'Večeře', '🌙 Večeře', false);
        content = replaceMealOpening(content, 'Svačina', '🍎 Svačina', false);
        content = replaceMealOpening(content, 'Breakfast', '🌅 Snídaně', true);
        content = replaceMealOpening(content, 'Lunch', '☀️ Oběd', true);
        content = replaceMealOpening(content, 'Dinner', '🌙 Večeře', false);
        content = replaceMealOpening(content, 'Snack', '🍎 Svačina', false);

        content = boldMealTitleAfterLabel(content);
        content = transformMealNutritionLinesToMacroTags(content);

        content = content.replace(
          /<p(?!\s[^>]*style=)([^>]*)>/gi,
          `<p style="margin:0 0 10px;color:#94a3b8;font-size:13px;line-height:1.5;font-family:Arial,sans-serif;"$1>`
        );

        content = wrapMealParagraphsWithThumbnails(content);

        let trainingHtml = '';
        if (trainingRest) {
          let t = trainingRest;
          t = t.replace(
            /<p[^>]*>\s*<b>\s*Trénink tento den:\s*<\/b>\s*<\/p>/gi,
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px;"><tr><td class="email-section-h" style="padding:12px 0 10px;border-top:2px solid rgba(124,58,237,0.4);border-bottom:3px solid ${EMAIL_ACCENT};color:#ffffff;font-weight:800;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;font-family:Arial,sans-serif;">Trénink</td></tr></table>
<p style="margin:0 0 10px;color:#94a3b8;font-size:13px;font-weight:600;font-family:Arial,sans-serif;">Cviky a objem</p>`
          );
          t = styleTrainingUl(t);
          t = wrapExerciseListItemsWithGifs(t);
          t = t.replace(/<li(?!\s[^>]*style=)([^>]*)>/gi, `<li style="margin:6px 0;color:${EMAIL_TEXT};font-size:14px;line-height:1.45;font-family:Arial,sans-serif;"$1>`);
          t = t.replace(
            /<li style="margin:6px 0;color:#e2e8f0;font-size:14px;line-height:1.45;font-family:Arial,sans-serif;"([^>]*)>([^<]+)<\/li>/gi,
            `<li style="margin:6px 0;color:${EMAIL_TEXT};font-size:14px;line-height:1.45;font-family:Arial,sans-serif;"$1><span style="font-size:16px;margin-right:6px;" aria-hidden="true">🏋️</span>$2</li>`
          );
          trainingHtml = t;
        }

        const dayInner = content + trainingHtml;
        mealHtml += `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${EMAIL_CARD};border-radius:16px;border:1px solid rgba(124,58,237,0.25);overflow:hidden;font-family:Arial,sans-serif;" bgcolor="${EMAIL_CARD}">
  <tr><td style="padding:14px 18px;background:linear-gradient(90deg,#1a1a2e 0%,#252547 100%);color:#ffffff;font-weight:700;font-size:15px;letter-spacing:-0.02em;border-bottom:1px solid rgba(124,58,237,0.35);">${escapeHtml(dayName)}</td></tr>
  <tr><td style="padding:18px 18px;color:${EMAIL_TEXT};font-size:14px;line-height:1.55;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td class="email-section-h" style="padding:0 0 10px;border-bottom:3px solid ${EMAIL_ACCENT};color:#ffffff;font-weight:800;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;">Jídelníček</td></tr></table>
    ${dayInner}
  </td></tr>
</table>`;
      }
    }

    const mealSectionTitle = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 16px;font-family:Arial,sans-serif;"><tr><td class="email-section-h" style="padding:6px 0 12px;border-bottom:3px solid ${EMAIL_ACCENT};color:#ffffff;font-weight:800;font-size:20px;letter-spacing:-0.02em;">🍽️ Jídelníček</td></tr><tr><td style="padding:10px 0 0;color:#94a3b8;font-size:13px;">Každý den v kartě · náhledy jídel (Spoonacular)</td></tr></table>`;
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

  return numbersHeroBlock + macrosHeroBlock + mindsetHeroBlock + trainingHeroBlock + out;
}

/**
 * Kompletní HTML dokument pro e-mail s plánem.
 * @param {string} [firstName] – křestní jméno pro pozdrav
 * @param {string} [ctaUrl] – primární CTA (výchozí /trener)
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
  const trenerUrl = `${app}/trener`;
  const planCta = (ctaUrl || trenerUrl).replace(/\/$/, '');
  const year = new Date().getFullYear();

  const namePart = (firstName || '').trim().split(/\s+/)[0] || '';
  const greetingLine = planChangeContext
    ? (namePart ? `Hej ${escapeHtml(namePart)}, upravili jsme plán podle tvých změn 💪` : 'Hej, upravili jsme plán podle tvých změn 💪')
    : (namePart ? `Hej ${escapeHtml(namePart)}, tvůj plán je připraven 💪` : 'Hej, tvůj plán je připraven 💪');

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

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Tvůj osobní plán Body &amp; Mind ON</title>
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .email-outer-pad { padding: 16px 10px !important; }
      .email-card { width: 100% !important; max-width: 100% !important; border-radius: 12px !important; }
      .email-body-pad { padding: 18px 14px 8px !important; }
      .email-plan-pad { padding: 16px 12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_BG};color:${EMAIL_TEXT};font-family:Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_BG};" bgcolor="${EMAIL_BG}">
    <tr>
      <td align="center" class="email-outer-pad" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width:600px;width:100%;margin:0 auto;background-color:${EMAIL_CARD};border-radius:16px;overflow:hidden;border:1px solid rgba(124,58,237,0.35);" bgcolor="${EMAIL_CARD}">
          <tr>
            <td align="center" style="padding:0;background:linear-gradient(135deg,#1a1a2e 0%,#2e1065 45%,#1a1a2e 100%);border-bottom:2px solid rgba(124,58,237,0.5);" bgcolor="#1a1a2e">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:26px 22px 20px;">
                    <p style="margin:0 0 4px;font-size:11px;color:#c4b5fd;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;font-family:Arial,sans-serif;">Body &amp; Mind ON</p>
                    <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;font-family:Arial,sans-serif;">Body &amp; Mind <span style="color:${EMAIL_ACCENT};">ON</span></h1>
                    <p style="margin:10px 0 0;font-size:13px;color:#94a3b8;max-width:320px;font-family:Arial,sans-serif;">Osobní plán · jídlo a trénink</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-body-pad" style="padding:24px 20px 8px;background-color:${EMAIL_CARD};color:${EMAIL_TEXT};" bgcolor="${EMAIL_CARD}">
              <p style="margin:0 0 10px;font-size:19px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;line-height:1.35;">${greetingLine}</p>
              <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.55;font-family:Arial,sans-serif;">Níže máš přehled jídelníčku a tréninku. Plán v plné kvalitě otevřeš v aplikaci.</p>
              ${loginBlock}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;background-color:#16162f;border:1px solid rgba(124,58,237,0.25);border-radius:14px;" bgcolor="#16162f">
                <tr>
                  <td class="email-plan-pad" style="padding:20px 16px;color:${EMAIL_TEXT};font-size:14px;line-height:1.55;font-family:Arial,sans-serif;">
                    ${safePlanHtml}
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 24px;">
                <tr>
                  <td align="center" style="padding:8px 0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(planCta)}" style="height:50px;v-text-anchor:middle;width:320px;" arcsize="14%" stroke="f" fillcolor="#7c3aed">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">Otevřít plán v aplikaci</center>
                    </v:roundrect>
                    <![endif]-->
                    <a href="${escapeHtml(planCta)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:16px 36px;border-radius:999px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:Arial,sans-serif;letter-spacing:0.02em;background:linear-gradient(135deg,#6d28d9 0%,${EMAIL_ACCENT} 50%,#5b21b6 100%);box-shadow:0 6px 24px rgba(124,58,237,0.35);mso-hide:all;">Otevřít plán v aplikaci</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 18px;text-align:center;font-size:12px;color:#64748b;font-family:Arial,sans-serif;">Přihlášení: <a href="${escapeHtml(loginUrl)}" style="color:${EMAIL_ACCENT};text-decoration:none;">${escapeHtml(loginUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 18px;text-align:center;font-size:12px;color:#64748b;border-top:1px solid rgba(124,58,237,0.25);background-color:${EMAIL_BG};font-family:Arial,sans-serif;" bgcolor="${EMAIL_BG}">
              <p style="margin:0 0 12px;line-height:1.6;">
                <a href="mailto:info@bodyandmindon.cz?subject=Odhl%C3%A1%C5%A1en%C3%AD%20z%20e-mail%C5%AF" style="color:#94a3b8;text-decoration:underline;">Odhlášení z e-mailů</a>
                <span style="color:#475569;padding:0 6px;">|</span>
                ${socialRow}
              </p>
              <p style="margin:0 0 8px;">&copy; ${year} Body &amp; Mind ON</p>
              <p style="margin:0;"><a href="${escapeHtml(profileUrl)}" style="color:${EMAIL_ACCENT};text-decoration:none;">Nastavení profilu</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
