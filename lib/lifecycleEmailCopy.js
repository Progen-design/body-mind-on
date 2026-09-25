/**
 * Texty lifecycle e-mailů.
 *
 * Pravidla, kterých se držím:
 *  - jeden e-mail = jedna myšlenka = jedno tlačítko
 *  - žádné „Ahoj šampione", žádné vykřičníky, žádné umělé odpočty
 *  - cena a datum stržení se říkají otevřeně, ne schovaně pod odkazem
 *  - odhlášení je vždycky vidět
 */
import { START_PRICE_CZK, START_PRICE_LABEL, TRIAL_DAYS } from './pricingConstants.js';
import { prvniSlovo, vokativ } from './vokativ.js';

const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz';
const PROFIL = `${APP}/profil`;
/** Profil s rozbalenou sekcí Účet a předplatné (App.tsx čte ?predplatne=1). */
export const PROFIL_PREDPLATNE = `${PROFIL}?predplatne=1`;

/** Značka v textu, kterou getLifecycleEmailContent nahradí oslovením. */
const OSLOVENI = '{{osloveni}}';

/**
 * „Ahoj Jane," — 5. pád přes sdílený lib/vokativ.js. Nejisté jméno → „Ahoj,".
 * @param {string|null|undefined} jmeno
 */
function osloveni(jmeno) {
  const v = vokativ(prvniSlovo(jmeno));
  return v ? `Ahoj ${v},` : 'Ahoj,';
}

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
    subject: 'Pátý den — jak ti plán sedí?',
    title: 'Jak ti plán sedí?',
    body: 'Plán máš postavený podle svých cílů, stravování a vybavení. Když ti nějaké jídlo nebo cvik nesedí, vyměň ho jedním klepnutím.<br><br>Zapisuj váhu a tréninky — uvidíš, jak se ti daří, a TED ti poradí s dalším krokem.',
    cta: { label: 'Zapsat trénink', href: PROFIL },
  },

  // Trial BEZ karty: nic se nestrhne, plán se jen pozastaví.
  // (S kartou jde vždy trial_ends_tomorrow_card — varování před platbou.)
  trial_ends_tomorrow: {
    subject: 'Zítra ti končí zkušební období',
    title: 'Zkušební období končí zítra',
    body: `Zítra ti skončí ${TRIAL_DAYS} dní zdarma. Kartu jsi nezadal, takže <strong>nic se ti nestrhne</strong> — plán se jen pozastaví.<br><br>Chceš pokračovat bez přerušení? Aktivuj START za ${START_PRICE_LABEL} v profilu. Zrušíš kdykoli jedním klepnutím.`,
    cta: { label: 'Pokračovat s plánem →', href: PROFIL_PREDPLATNE },
    footnote: 'Píšu to dopředu, ať víš, co se zítra stane.',
  },

  // ── Za flagem LIFECYCLE_TRIAL_ENDED_ENABLED ─────────────────────────
  // Trial s kartou (stripe_subscription_id): zítra Stripe strhne první platbu.
  trial_ends_tomorrow_card: {
    subject: `Zítra první platba ${START_PRICE_CZK} Kč`,
    title: 'Zkušební období končí zítra',
    body: `Zítra ti skončí zkušební období a strhneme první platbu <strong>${START_PRICE_CZK} Kč</strong>.<br><br>Nechceš pokračovat? Zruš předplatné v profilu ještě dnes — nic nezaplatíš.`,
    cta: { label: 'Spravovat předplatné →', href: PROFIL_PREDPLATNE },
  },

  // Trial bez karty skončil. Nic se nestrhlo, plán je pozastavený.
  trial_ended: {
    subject: 'Tvůj plán je pozastavený — pokračuj, kde jsi skončil',
    title: 'Tvůj plán je pozastavený',
    body: `${OSLOVENI}<br><br>tvých ${TRIAL_DAYS} dní zdarma skončilo. Plán, recepty i TED jsou teď pozastavené — nic se nesmazalo.<br><br>Chceš pokračovat? Odemkni START za ${START_PRICE_CZK} Kč měsíčně. Zrušíš kdykoli jedním klepnutím v profilu.`,
    cta: { label: 'Pokračovat s plánem →', href: PROFIL_PREDPLATNE },
    footnote: 'Když ti něco nesedělo, odpověz na tenhle e-mail — čteme každou odpověď.<br><br>Ondra a tým Body &amp; Mind ON',
  },

  // 3 dny po konci trialu, jen když odešel trial_ended. Poslední e-mail k trialu.
  trial_winback_d3: {
    subject: 'Co ti chybělo?',
    title: 'Co ti chybělo?',
    body: `${OSLOVENI}<br><br>před třemi dny ti skončil zkušební týden. Jestli ti plán nevyhovoval — moc jídla, málo času na trénink, nesedělo vybavení — napiš nám jednou větou, co upravit, a plán ti přenastavíme.<br><br>A kdybys chtěl rovnou pokračovat:`,
    cta: { label: 'Odemknout plán →', href: PROFIL_PREDPLATNE },
    footnote: 'Tohle je poslední e-mail k trialu, dál tě zahlcovat nebudeme.',
  },
};

/** HTML úryvek → prostý text (zalomení, bez značek, &amp; zpátky na &). */
function naText(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
}

/**
 * @param {string} triggerKey
 * @param {{ jmeno?: string|null }} [kontext]
 * @returns {{subject:string, text:string, html:string}|null}
 */
export function getLifecycleEmailContent(triggerKey, { jmeno = null } = {}) {
  const c = COPY[triggerKey];
  if (!c) return null;

  const body = c.body.replace(OSLOVENI, osloveni(jmeno));
  const html = layout({
    title: c.title,
    body,
    ctaLabel: c.cta?.label,
    ctaHref: c.cta?.href,
    footnote: c.footnote,
  });

  const text = [
    c.title,
    '',
    naText(body),
    '',
    c.cta ? `${c.cta.label}: ${c.cta.href}` : '',
    c.footnote ? `\n${naText(c.footnote)}` : '',
    '',
    'Body & Mind ON · info@bodyandmindon.cz',
  ].filter(Boolean).join('\n');

  return { subject: c.subject, text, html };
}

export const LIFECYCLE_COPY_KEYS = Object.keys(COPY);
