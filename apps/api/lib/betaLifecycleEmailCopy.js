/** Czech copy for beta lifecycle emails — plain text + simple HTML. */

const APP = 'https://app.bodyandmindon.cz';

const WELCOME_STEPS = [
  'Vyplň krátký vstupní dotazník.',
  'Nech si vytvořit osobní 7denní jídelníček a tréninkový plán.',
  'Otevři si sekci Dnes.',
  'Označ alespoň jedno jídlo, trénink nebo návyk jako hotový.',
  'Vyplň krátký denní check-in.',
  'Během několika dní aplikaci alespoň dvakrát otevři.',
  'Pošli nám zpětnou vazbu přímo v aplikaci.',
];

const WELCOME_FEEDBACK = [
  'co bylo dobré,',
  'co bylo nejasné,',
  'co působilo nereálně,',
  'co ti v aplikaci chybělo.',
];

const TEMPLATES = {
  beta_welcome: {
    subject: 'Vítej v testování Body & Mind ON',
    text: `Ahoj,

děkujeme, že testuješ Body & Mind ON.

Začni tady:

${APP}/start

Co máš udělat:

1. Vyplň krátký vstupní dotazník.
2. Nech si vytvořit osobní 7denní jídelníček a tréninkový plán.
3. Otevři si sekci Dnes.
4. Označ alespoň jedno jídlo, trénink nebo návyk jako hotový.
5. Vyplň krátký denní check-in.
6. Během několika dní aplikaci alespoň dvakrát otevři.
7. Pošli nám zpětnou vazbu přímo v aplikaci.

Potřebujeme vědět hlavně:

- co bylo dobré,
- co bylo nejasné,
- co působilo nereálně,
- co ti v aplikaci chybělo.

Nemusíš splnit celý plán. Jde hlavně o to zjistit, jestli je aplikace srozumitelná a plán reálně použitelný.

Body & Mind ON poskytuje obecná fitness a výživová doporučení a nenahrazuje lékaře, fyzioterapeuta ani jiného zdravotního odborníka.

Děkujeme za pomoc.

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

function buildWelcomeHtml() {
  const stepsHtml = WELCOME_STEPS.map(
    (step) => `<li style="margin:6px 0;color:#334155;line-height:1.5;">${escapeHtml(step)}</li>`,
  ).join('');
  const feedbackHtml = WELCOME_FEEDBACK.map(
    (item) => `<li style="margin:4px 0;color:#334155;">${escapeHtml(item)}</li>`,
  ).join('');
  const startUrl = `${APP}/start`;

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:24px 16px;background:#f8fafc;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
    <tr><td style="padding:28px 24px;">
      <p style="margin:0 0 12px;color:#334155;line-height:1.6;">Ahoj,</p>
      <p style="margin:0 0 20px;color:#334155;line-height:1.6;">děkujeme, že testuješ Body &amp; Mind ON.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:8px;background:#0ea5e9;">
            <a href="${startUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;line-height:1.4;">Začít testování</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#0f172a;font-weight:600;font-size:17px;">Co máš udělat</p>
      <ol style="margin:0 0 20px;padding-left:22px;">
        ${stepsHtml}
      </ol>
      <p style="margin:0 0 8px;color:#334155;line-height:1.6;">Potřebujeme vědět hlavně:</p>
      <p style="margin:0 0 8px;color:#0f172a;font-weight:600;font-size:17px;">Co nám napiš</p>
      <ul style="margin:0 0 20px;padding-left:20px;">
        ${feedbackHtml}
      </ul>
      <p style="margin:0 0 20px;color:#334155;line-height:1.6;">Nemusíš splnit celý plán. Jde hlavně o to zjistit, jestli je aplikace srozumitelná a plán reálně použitelný.</p>
      <p style="margin:0 0 20px;color:#64748b;font-size:13px;line-height:1.5;">Body &amp; Mind ON poskytuje obecná fitness a výživová doporučení a nenahrazuje lékaře, fyzioterapeuta ani jiného zdravotního odborníka.</p>
      <p style="margin:0 0 12px;color:#334155;line-height:1.6;">Děkujeme za pomoc.</p>
      <p style="margin:0;color:#334155;line-height:1.6;">Body &amp; Mind ON</p>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * @param {string} triggerKey
 * @returns {{ subject: string, text: string, html: string }|null}
 */
export function getBetaLifecycleEmailContent(triggerKey) {
  const tpl = TEMPLATES[triggerKey];
  if (!tpl) return null;

  const html = triggerKey === 'beta_welcome'
    ? buildWelcomeHtml()
    : `<!DOCTYPE html>
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
