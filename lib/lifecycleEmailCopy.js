/**
 * Texty lifecycle e-mailů.
 *
 * Pravidla, kterých se držím:
 *  - jeden e-mail = jedna myšlenka = jedno tlačítko
 *  - žádné „Ahoj šampione", žádné vykřičníky, žádné umělé odpočty
 *  - cena a datum stržení se říkají otevřeně, ne schovaně pod odkazem
 *  - odhlášení je vždycky vidět
 */
import { START_PRICE_LABEL, TRIAL_DAYS } from './pricingConstants.js';

const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz';
const PROFIL = `${APP}/profil`;

function layout({ title, body, ctaLabel, ctaHref, footnote }) {
  const cta = ctaLabel && ctaHref
    ? `<tr><td style="padding:28px 0 8px">
         <a href="${ctaHref}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px">${ctaLabel}</a>
       </td></tr>`
    : '';

  const note = footnote
    ? `<tr><td style="padding-top:20px;color:#64748b;font-size:13px;line-height:1.6">${footnote}</td></tr>`
    : '';

  return `<!doctype html>
<html lang="cs"><body style="margin:0;padding:0;background:#0b1020">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1020;padding:32px 16px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:linear-gradient(145deg,#141928,#201c38);border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:36px 32px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td style="color:#94a3b8;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700">Body &amp; Mind ON</td></tr>
    <tr><td style="padding-top:14px;color:#f8fafc;font-size:24px;font-weight:800;line-height:1.3">${title}</td></tr>
    <tr><td style="padding-top:16px;color:#cbd5e1;font-size:15px;line-height:1.65">${body}</td></tr>
    ${cta}
    ${note}
    <tr><td style="padding-top:28px;border-top:1px solid rgba(255,255,255,.1);color:#64748b;font-size:12px;line-height:1.6">
      Body &amp; Mind ON · <a href="mailto:info@bodyandmindon.cz" style="color:#94a3b8">info@bodyandmindon.cz</a><br>
      Nechceš tyhle e-maily? Vypni je v <a href="${PROFIL}" style="color:#94a3b8">nastavení profilu</a>.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** @type {Record<string, {subject:string, title:string, body:string, cta?:{label:string,href:string}, footnote?:string}>} */
const COPY = {

  // ── Neaktivoval ─────────────────────────────────────────────────────
  activate_1h: {
    subject: 'Tvůj plán je hotový — zbývá ho odemknout',
    title: 'Plán máš připravený',
    body: `Jídelníček i tréninkový plán jsou spočítané podle údajů, které jsi zadal. Čekají v profilu.<br><br>Odemkneš je jedním klikem — <strong>prvních ${TRIAL_DAYS} dní zdarma</strong>, platíš až ${TRIAL_DAYS + 1}. den.`,
    cta: { label: 'Odemknout plán', href: PROFIL },
    footnote: `Po zkušebním období ${START_PRICE_LABEL}. Zrušit můžeš kdykoliv jedním klikem v profilu.`,
  },

  activate_24h: {
    subject: 'Plán ti leží v profilu už den',
    title: 'Ještě jsi ho neotevřel',
    body: 'Nejtěžší je začít. Tvůj plán je hotový — nemusíš nic počítat ani vymýšlet, stačí ho otevřít a jít podle něj.<br><br>Prvních sedm dní tě nic nestojí.',
    cta: { label: 'Otevřít můj plán', href: PROFIL },
    footnote: `Po zkušebním období ${START_PRICE_LABEL}. Zrušíš kdykoliv.`,
  },

  activate_72h: {
    subject: 'Poslední připomínka',
    title: 'Nechám tě být',
    body: 'Tohle je poslední e-mail, kterým tě otravuju. Plán ti v profilu zůstane — kdykoliv se rozhodneš, je připravený.<br><br>Kdyby ti něco bránilo nebo něco nefungovalo, napiš mi. Odpovím osobně.',
    cta: { label: 'Otevřít plán', href: PROFIL },
    footnote: 'Napiš na info@bodyandmindon.cz — čtu to já, ne robot.',
  },

  // ── Trial běží ──────────────────────────────────────────────────────
  trial_welcome: {
    subject: 'Jak začít (přečteš za minutu)',
    title: 'Máš odemčeno. Teď to nejdůležitější.',
    body: `<strong>Začni jedním jídlem, ne celým jídelníčkem.</strong> Lidi, kterým to vydrží, nezačínají perfektně — začínají v malém.<br><br>Dnes stačí tohle:<br>1. otevři si dnešní jídelníček<br>2. udělej jedno jídlo podle něj<br>3. zapiš první trénink`,
    cta: { label: 'Otevřít dnešek', href: PROFIL },
  },

  trial_day3: {
    subject: 'Třetí den — proč váha skáče',
    title: 'Nezaleknout se čísla na váze',
    body: 'Váha ze dne na den kolísá podle vody, soli a spánku — klidně o kilo a půl. To není tuk.<br><br>Proto systém nikdy nemění plán podle jednoho vážení. Pracuje s klouzavým průměrem za sedm dní. <strong>Sleduj trend, ne jedno číslo.</strong>',
    cta: { label: 'Podívat se na trend', href: PROFIL },
  },

  trial_day5: {
    subject: 'Pátý den — plán se ti přizpůsobuje',
    title: 'Co se děje na pozadí',
    body: 'Každý týden systém vyhodnotí, jak se ti daří, a upraví kalorie, makra i objem tréninku. Nemusíš nic hlásit ani přepočítávat.<br><br>Čím víc toho zapíšeš, tím přesnější to bude.',
    cta: { label: 'Zapsat trénink', href: PROFIL },
  },

  trial_ends_tomorrow: {
    subject: `Zítra začíná předplatné (${START_PRICE_LABEL})`,
    title: 'Zkušební období končí zítra',
    body: `Zítra se ti strhne <strong>${START_PRICE_LABEL}</strong> a předplatné poběží dál. Nemusíš dělat vůbec nic.<br><br>Pokud pokračovat nechceš, <strong>zruš to dnes v profilu</strong> — jedním klikem, bez vysvětlování a bez poplatku.`,
    cta: { label: 'Otevřít profil', href: PROFIL },
    footnote: 'Píšu to dopředu, abys nebyl překvapený. Žádná platba by neměla přijít bez varování.',
  },
};

/**
 * @param {string} triggerKey
 * @returns {{subject:string, text:string, html:string}|null}
 */
export function getLifecycleEmailContent(triggerKey) {
  const c = COPY[triggerKey];
  if (!c) return null;

  const html = layout({
    title: c.title,
    body: c.body,
    ctaLabel: c.cta?.label,
    ctaHref: c.cta?.href,
    footnote: c.footnote,
  });

  const text = [
    c.title,
    '',
    c.body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
    '',
    c.cta ? `${c.cta.label}: ${c.cta.href}` : '',
    c.footnote ? `\n${c.footnote.replace(/<[^>]+>/g, '')}` : '',
    '',
    'Body & Mind ON · info@bodyandmindon.cz',
  ].filter(Boolean).join('\n');

  return { subject: c.subject, text, html };
}

export const LIFECYCLE_COPY_KEYS = Object.keys(COPY);
