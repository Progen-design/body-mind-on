/** Czech copy for beta lifecycle emails — plain text + simple HTML. */

const APP = 'https://app.bodyandmindon.cz';

const TEMPLATES = {
  beta_welcome: {
    subject: 'Vítej v testování Body & Mind ON',
    text: `Ahoj,

děkujeme, že testuješ Body & Mind ON.

Dokonči vstupní dotazník a nech si vytvořit svůj osobní 7denní jídelníček a tréninkový plán:

${APP}/start

Až bude plán připravený, najdeš ho ve svém profilu.

Body & Mind ON`,
  },
  beta_plan_ready: {
    subject: 'Tvůj plán je připravený',
    text: `Ahoj,

tvůj 7denní jídelníček a tréninkový plán je připravený.

Otevři si dnešní jídla, trénink a návyky:

${APP}/profil

Budeme rádi za upřímnou zpětnou vazbu přímo v aplikaci.

Body & Mind ON`,
  },
  beta_no_plan_view_24h: {
    subject: 'Tvůj plán čeká v aplikaci',
    text: `Ahoj,

tvůj plán už je připravený.

Podívej se, co máš dnes naplánované:

${APP}/profil

Body & Mind ON`,
  },
  beta_no_first_action_48h: {
    subject: 'Začni jednou aktivitou',
    text: `Ahoj,

nemusíš splnit celý plán najednou.

Zkus dnes označit jako hotové jedno jídlo, trénink nebo návyk:

${APP}/profil

Body & Mind ON`,
  },
  beta_day3_feedback: {
    subject: 'Jak ti Body & Mind ON zatím vyhovuje?',
    text: `Ahoj,

jak ti zatím Body & Mind ON vyhovuje?

Napiš nám prosím krátce, co je dobré, nejasné nebo nereálné:

${APP}/profil

Zpětnou vazbu odešleš přímo v aplikaci.

Body & Mind ON`,
  },
  beta_day7_feedback: {
    subject: 'Jak hodnotíš Body & Mind ON?',
    text: `Ahoj,

děkujeme za otestování Body & Mind ON.

Napiš nám prosím:
- co bylo nejužitečnější,
- co ti chybělo,
- zda bys aplikaci používal/a dál.

Zpětnou vazbu můžeš poslat přímo v aplikaci:

${APP}/profil

Body & Mind ON`,
  },
};

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtmlParagraphs(text) {
  return String(text || '')
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split('\n').map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          return `<p style="margin:0 0 12px;"><a href="${escapeHtml(trimmed)}" style="color:#0ea5e9;">${escapeHtml(trimmed)}</a></p>`;
        }
        if (trimmed.startsWith('- ')) {
          return `<li style="margin:4px 0;color:#334155;">${escapeHtml(trimmed.slice(2))}</li>`;
        }
        return `<p style="margin:0 0 12px;color:#334155;line-height:1.6;">${escapeHtml(line)}</p>`;
      });
      const hasList = lines.some((l) => l.startsWith('<li'));
      if (hasList) {
        const items = lines.filter((l) => l.startsWith('<li')).join('');
        const rest = lines.filter((l) => !l.startsWith('<li')).join('');
        return `${rest}<ul style="margin:0 0 12px;padding-left:20px;">${items}</ul>`;
      }
      return lines.join('');
    })
    .join('');
}

/**
 * @param {string} triggerKey
 * @returns {{ subject: string, text: string, html: string }|null}
 */
export function getBetaLifecycleEmailContent(triggerKey) {
  const tpl = TEMPLATES[triggerKey];
  if (!tpl) return null;
  const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:24px 16px;background:#f8fafc;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
    <tr><td style="padding:28px 24px;">
      ${textToHtmlParagraphs(tpl.text)}
    </td></tr>
  </table>
</body>
</html>`;
  return { subject: tpl.subject, text: tpl.text, html };
}
