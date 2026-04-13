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

function styleListForEmail(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/<ul[^>]*>/gi, '<ul style="margin:0 0 16px;padding-left:20px;color:#c8c8d4;font-size:14px;line-height:1.65;">')
    .replace(/<li[^>]*>/gi, '<li style="margin:6px 0;">');
}

/** Zachová data-* a id z původních atributů <p …>. */
function dataAttrsFromPAttrs(attrs) {
  if (!attrs || typeof attrs !== 'string') return '';
  const parts = attrs.match(/\s+(?:data-[a-z0-9_-]+|id)="[^"]*"/gi);
  return parts ? parts.join('') : '';
}

function replaceMealOpening(html, mealNamePattern, emojiLabel, withBottomBorder) {
  const border = withBottomBorder ? 'border-bottom:1px solid rgba(0,229,255,0.12);' : '';
  const re = new RegExp(`<p([^>]*)>\\s*<b>\\s*${mealNamePattern}\\s*:?\\s*<\\/b>`, 'gi');
  return html.replace(re, (_, attrs) => {
    const dataAttrs = dataAttrsFromPAttrs(attrs);
    return `<p style="margin:0 0 12px;padding:10px 0;${border}color:#e8e8f0;font-size:14px;line-height:1.55;"${dataAttrs}><span style="color:#00e5ff;font-weight:700;font-size:13px;letter-spacing:0.02em;">${emojiLabel}</span> `;
  });
}

/** Makra z <ul><li><strong>…</strong> jako barevné pill tagy. */
function formatMacrosBlockHtml(rawUlBlock) {
  const cal = rawUlBlock.match(/Kalorie[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const prot = rawUlBlock.match(/Bílkoviny[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const carbs = rawUlBlock.match(/Sacharidy[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();
  const fat = rawUlBlock.match(/Tuky[^<]*<\/strong>\s*([^<]+)/i)?.[1]?.trim();

  const pill = (label, value, bg, color) => {
    if (!value) return '';
    return `<span style="display:inline-block;margin:4px 6px 4px 0;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;background:${bg};color:${color};border:1px solid rgba(255,255,255,0.08);">${escapeHtml(label)} ${escapeHtml(value)}</span>`;
  };

  const pills = [
    pill('Kalorie', cal, 'linear-gradient(135deg,#1a3a4a 0%,#0d2830 100%)', '#7ee8ff'),
    pill('Bílkoviny', prot, 'linear-gradient(135deg,#2d1f4e 0%,#1a1230 100%)', '#c4b5fd'),
    pill('Sacharidy', carbs, 'linear-gradient(135deg,#1e3d2a 0%,#0f2418 100%)', '#86efac'),
    pill('Tuky', fat, 'linear-gradient(135deg,#3d2a1a 0%,#24180f 100%)', '#fcd34d'),
  ].join('');

  if (!pills.trim()) {
    return styleListForEmail(rawUlBlock);
  }
  return `<div style="margin:0;padding:4px 0;line-height:1.8;" role="list" aria-label="Denní makra">${pills}</div>`;
}

/** Jídlo s obrázkem: řádek 80×80 + text. */
function wrapMealParagraphsWithThumbnails(html) {
  return html.replace(
    /<p([^>]*\sdata-image-url="([^"]*)"[^>]*)>([\s\S]*?)<\/p>/gi,
    (full, attrs, url, inner) => {
      const safeUrl = escapeHtml(url);
      const innerClean = inner.trim();
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;">
  <tr>
    <td width="88" valign="top" style="padding:0;width:88px;">
      <img src="${safeUrl}" alt="" width="80" height="80" style="display:block;width:80px;height:80px;max-width:80px;border-radius:20px;object-fit:cover;border:1px solid rgba(255,255,255,0.14);" />
    </td>
    <td valign="middle" style="padding:0 0 0 14px;color:#e8e8f0;font-size:14px;line-height:1.55;">${innerClean}</td>
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
        <img src="${safeUrl}" alt="" width="60" height="60" style="display:block;width:60px;height:60px;max-width:60px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,0.12);" />
      </td>
      <td valign="middle" style="padding:0 0 0 12px;color:#e8e8f0;font-size:14px;line-height:1.45;">${text}</td>
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
    numbersHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:#1a1a2e;border-radius:14px;border:1px solid rgba(0,229,255,0.22);overflow:hidden;" bgcolor="#1a1a2e">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(0,229,255,0.25);color:#00e5ff;font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Tvoje čísla</td></tr>
  <tr><td style="padding:16px 18px;color:#c8c8d4;font-size:14px;line-height:1.6;">${numbersContent}</td></tr>
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
    macrosHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:#141428;border-radius:14px;border:1px solid rgba(124,58,237,0.35);overflow:hidden;" bgcolor="#141428">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(124,58,237,0.4);color:#c4b5fd;font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Denní cíle · makra</td></tr>
  <tr><td style="padding:16px 18px;color:#c8c8d4;font-size:14px;line-height:1.6;">${macrosInner}</td></tr>
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
    mindsetHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:#1a1028;border-radius:14px;border:1px solid rgba(168,85,247,0.35);overflow:hidden;" bgcolor="#1a1028">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(168,85,247,0.35);color:#d8b4fe;font-weight:700;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Mindset na tento týden</td></tr>
  <tr><td style="padding:18px 18px;">${mindsetContent}</td></tr>
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
    trainingHeroBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background:#12121f;border-radius:14px;border:1px solid rgba(148,163,184,0.25);overflow:hidden;" bgcolor="#12121f">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(148,163,184,0.3);color:#94a3b8;font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Trénink · přehled</td></tr>
  <tr><td style="padding:18px 18px;color:#cbd5e1;font-size:14px;line-height:1.65;">${trainingContent}</td></tr>
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

        content = content.replace(
          /<p[^>]*class="meal-nutrition-line"[^>]*>/gi,
          '<p style="margin:0 0 6px 0;padding-left:2px;color:#8892a6;font-size:12px;line-height:1.4;" class="meal-nutrition-line">'
        );
        content = content.replace(
          /<p(?!\s[^>]*style=)([^>]*)>/gi,
          '<p style="margin:0 0 10px;color:#b8b8cc;font-size:13px;line-height:1.5;"$1>'
        );

        content = wrapMealParagraphsWithThumbnails(content);

        let trainingHtml = '';
        if (trainingRest) {
          let t = trainingRest;
          t = t.replace(
            /<p[^>]*>\s*<b>\s*Trénink tento den:\s*<\/b>\s*<\/p>/gi,
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 10px;"><tr><td style="padding:10px 0 6px;border-top:1px solid rgba(0,229,255,0.2);color:#00e5ff;font-weight:800;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">Trénink</td></tr></table>
<p style="margin:0 0 10px;color:#94a3b8;font-size:13px;font-weight:600;">Tento den</p>`
          );
          t = styleTrainingUl(t);
          t = wrapExerciseListItemsWithGifs(t);
          t = t.replace(/<li(?!\s[^>]*style=)([^>]*)>/gi, '<li style="margin:6px 0;color:#e8e8f0;font-size:14px;line-height:1.45;"$1>');
          trainingHtml = t;
        }

        const dayInner = content + trainingHtml;
        mealHtml += `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:#16162a;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;" bgcolor="#16162a">
  <tr><td style="padding:14px 18px;background:linear-gradient(90deg,#1e1e36 0%,#252542 100%);color:#ffffff;font-weight:700;font-size:15px;letter-spacing:-0.02em;">${escapeHtml(dayName)}</td></tr>
  <tr><td style="padding:18px 18px;color:#c8c8d4;font-size:14px;line-height:1.55;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr><td style="padding:0 0 8px;border-bottom:2px solid rgba(0,229,255,0.45);color:#ffffff;font-weight:800;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;">Jídelníček</td></tr></table>
    ${dayInner}
  </td></tr>
</table>`;
      }
    }

    const mealSectionTitle = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 14px;"><tr><td style="padding:4px 0 12px;border-bottom:2px solid rgba(0,229,255,0.5);color:#ffffff;font-weight:800;font-size:18px;letter-spacing:-0.03em;">🍽️ Jídelníček</td></tr><tr><td style="padding:8px 0 0;color:#8892a6;font-size:13px;">Kompletní týden · náhledy z Spoonacular</td></tr></table>`;
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
      const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:#16162a;border-radius:14px;border:1px solid rgba(124,58,237,0.3);overflow:hidden;" bgcolor="#16162a">
  <tr><td style="padding:14px 18px;border-bottom:1px solid rgba(124,58,237,0.35);color:#c4b5fd;font-weight:700;font-size:14px;">${icon} ${escapeHtml(title)}</td></tr>
  <tr><td style="padding:16px 18px;color:#c8c8d4;font-size:14px;line-height:1.6;">${cardContent}</td></tr>
</table>`;
      out = out.replace(m[0], card);
    }
  }

  out = out.replace(/<h3([^>]*)>([^<]*)<\/h3>/gi, (_, attrs, title) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px;"><tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.12);color:#e8e8f0;font-weight:700;font-size:16px;">${escapeHtml((title || '').trim())}</td></tr></table>`
  );

  return numbersHeroBlock + macrosHeroBlock + mindsetHeroBlock + trainingHeroBlock + out;
}

/**
 * Kompletní HTML dokument pro e-mail s plánem.
 */
export function buildPlanEmailDocument({
  safePlanHtml,
  loginBlock,
  loginUrl,
  planChangeContext,
  appBaseUrl,
}) {
  const app = (appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const profileUrl = `${app}/profil`;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Tvůj osobní plán Body &amp; Mind ON</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f1a;color:#e8e8f0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f1a;" bgcolor="#0f0f1a">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#13131f;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);" bgcolor="#13131f">
          <tr>
            <td align="center" style="padding:28px 24px 22px;background:linear-gradient(180deg,#1a1a2e 0%,#13131f 100%);border-bottom:1px solid rgba(0,229,255,0.15);" bgcolor="#1a1a2e">
              <p style="margin:0 0 6px;font-size:11px;color:#00e5ff;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Body &amp; Mind ON</p>
              <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;line-height:1.15;">Body &amp; Mind <span style="background:linear-gradient(90deg,#00e5ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">ON</span></h1>
              <p style="margin:10px 0 0;font-size:14px;color:#8892a6;max-width:320px;">Osobní plán · jídlo a trénink</p>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 22px 8px;background-color:#13131f;color:#e8e8f0;" bgcolor="#13131f">
              <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#ffffff;">${planChangeContext ? 'Změnil jsi preference – zde je nový plán.' : 'Tvůj plán je připraven.'}</p>
              <p style="margin:0 0 22px;font-size:14px;color:#8892a6;line-height:1.55;">Kompletní jídelníček a trénink najdeš v aplikaci; níže je přehledný náhled.</p>
              ${loginBlock}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;background-color:#18182a;border:1px solid rgba(255,255,255,0.06);border-radius:14px;" bgcolor="#18182a">
                <tr>
                  <td style="padding:22px 18px;color:#e8e8f0;font-size:14px;line-height:1.55;">
                    ${safePlanHtml}
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 24px;">
                <tr>
                  <td align="center" style="padding:8px 0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(loginUrl)}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="12%" stroke="f" fillcolor="#00a8c4">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">Zobrazit celý plán</center>
                    </v:roundrect>
                    <![endif]-->
                    <a href="${escapeHtml(loginUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 36px;border-radius:999px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.02em;background:linear-gradient(135deg,#00d4aa 0%,#00a8e8 50%,#7c3aed 100%);mso-hide:all;">Zobrazit celý plán</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 20px;text-align:center;font-size:12px;color:#5c6370;">Body &amp; Mind ON</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 20px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid rgba(255,255,255,0.06);background-color:#0f0f18;" bgcolor="#0f0f18">
              <p style="margin:0 0 10px;">&copy; ${year} Body &amp; Mind ON · <a href="https://www.bodyandmindon.cz" style="color:#00c8e8;text-decoration:none;">www.bodyandmindon.cz</a></p>
              <p style="margin:0;line-height:1.5;">
                <a href="${escapeHtml(profileUrl)}" style="color:#a78bfa;text-decoration:underline;">Nastavení účtu a e-mailů</a>
                <span style="color:#4b5563;"> · </span>
                <a href="mailto:info@bodyandmindon.cz?subject=Odhl%C3%A1%C5%A1en%C3%AD%20z%20e-mail%C5%AF" style="color:#8892a6;text-decoration:underline;">Odhlášení z e-mailů</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
