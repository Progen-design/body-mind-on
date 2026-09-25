/**
 * TRANSAKČNÍ E-MAILY KE SMLOUVĚ — potvrzení (§ 1824a OZ) a přijaté odstoupení.
 *
 * Nejsou to marketingové e-maily: nejde je vypnout v profilu a nechodí přes
 * frontu lifecycle_emails. Posílají se jednou, v okamžiku události
 * (webhook invoice.paid, POST /api/subscription/withdraw).
 *
 * Stejný Gmail transport jako lib/sendLifecycleEmail.js.
 */
import nodemailer from 'nodemailer';
import { LHUTA_ODSTOUPENI_DNI } from './odstoupeniOdSmlouvy.js';

export const URL_OBCHODNI_PODMINKY = 'https://bodyandmindon.cz/obchodni-podminky';
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz';
const PROFIL_PREDPLATNE = `${APP}/profil?predplatne=1`;

/**
 * Údaje o provozovateli do patičky potvrzení. Zdroj pravdy je web
 * (bodyandmindon-web/lib/legal.ts → PROVOZOVATEL, ověřeno v ARES).
 */
const PROVOZOVATEL = 'Jan Příkopa, IČO 19830751, Kutilova 3064/6, 143 00 Praha 4 · info@bodyandmindon.cz';

const SEND_TIMEOUT_MS = 25000;

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {{ title: string, radky: Array<[string, string]>, odstavce: string[] }} p
 *   radky = tabulka „Tarif: START", odstavce = prostý text (bez HTML)
 * @returns {{ html: string, text: string }}
 */
function sestav({ title, radky, odstavce }) {
  const tabulka = radky.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#94a3b8">${escapeHtml(k)}</td><td style="padding:4px 0;color:#f8fafc;font-weight:600">${escapeHtml(v)}</td></tr>`).join('');
  const html = `<!doctype html>
<html lang="cs"><body style="margin:0;padding:0;background:#0b1020">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1020;padding:32px 16px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141928;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:36px 32px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td style="color:#94a3b8;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700">Body &amp; Mind ON</td></tr>
    <tr><td style="padding-top:14px;color:#f8fafc;font-size:24px;font-weight:800;line-height:1.3">${escapeHtml(title)}</td></tr>
    <tr><td style="padding-top:16px"><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.5">${tabulka}</table></td></tr>
    ${odstavce.map((o) => `<tr><td style="padding-top:16px;color:#cbd5e1;font-size:15px;line-height:1.65">${escapeHtml(o).replace(/(https:\/\/[^\s]+)/g, '<a href="$1" style="color:#c4b5fd">$1</a>')}</td></tr>`).join('\n    ')}
    <tr><td style="padding-top:28px;border-top:1px solid rgba(255,255,255,.1);color:#64748b;font-size:12px;line-height:1.6">Provozovatel: ${escapeHtml(PROVOZOVATEL)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
  const text = [
    title,
    '',
    ...radky.map(([k, v]) => `${k}: ${v}`),
    '',
    ...odstavce.flatMap((o) => [o, '']),
    `Provozovatel: ${PROVOZOVATEL}`,
  ].join('\n');
  return { html, text };
}

/**
 * Potvrzení uzavření smlouvy po první placené faktuře.
 *
 * @param {{ tarif: string, cenaKc: number, dalsiPlatba: string|null, lhutaDo: string }} p
 *   dalsiPlatba / lhutaDo = datum česky („25. 10. 2026")
 */
export function emailPotvrzeniSmlouvy({
  tarif,
  cenaKc,
  dalsiPlatba,
  lhutaDo,
  lhutaUplynula = false,
  uvod = 'Díky, první platba proběhla a předplatné běží. Tenhle e-mail je potvrzení uzavřené smlouvy — schovej si ho.',
}) {
  const nazev = nazevTarifu(tarif);
  const subject = `Předplatné ${nazev} je aktivní`;
  // Lhůta: konkrétní datum / „od první platby" (v trialu ještě nebyla) / už uplynula (změna tarifu později).
  const odstoupeni = lhutaUplynula
    ? `Lhůta ${LHUTA_ODSTOUPENI_DNI} dnů na odstoupení od první platby už uplynula. Předplatné můžeš kdykoli zrušit ke konci zaplaceného období.`
    : `Jak odstoupit do ${LHUTA_ODSTOUPENI_DNI} dnů: ${lhutaDo ? `do ${lhutaDo}` : 'do 14 dnů od první platby'} můžeš od smlouvy odstoupit bez udání důvodu — v Profil → Účet a předplatné → Odstoupit od smlouvy, nebo e-mailem na info@bodyandmindon.cz. Služba začala hned, proto vrátíme zaplacenou částku po odečtení poměrné části za dny, kdy už běžela.`;
  const { html, text } = sestav({
    title: subject,
    radky: [
      ['Tarif', nazev],
      ['Cena', `${Number(cenaKc).toLocaleString('cs-CZ')} Kč měsíčně`],
      ['Další platba', dalsiPlatba || 'podle období ve Stripe'],
    ],
    odstavce: [
      uvod,
      `Jak zrušit: v aplikaci Profil → Účet a předplatné → Zrušit předplatné. Zrušení platí ke konci zaplaceného období, do té doby ti služba běží dál. ${PROFIL_PREDPLATNE}`,
      odstoupeni,
      `Obchodní podmínky: ${URL_OBCHODNI_PODMINKY}`,
    ],
  });
  return { subject, text, html };
}

/** ON_CLUB → „ON CLUB" (v e-mailu se tier nepíše s podtržítkem). */
function nazevTarifu(tarif) {
  return String(tarif || '').toUpperCase().replace(/_/g, ' ');
}

/**
 * Potvrzení přijatého odstoupení.
 * @param {{ kdy: string, tarif: string, vratkaKc: number }} p kdy = datum a čas česky
 */
export function emailOdstoupeniPrijato({ kdy, tarif, vratkaKc }) {
  const subject = 'Odstoupení od smlouvy přijato';
  const { html, text } = sestav({
    title: subject,
    radky: [
      ['Přijato', kdy],
      ['Tarif', tarif],
      ['Vrácená částka', `${vratkaKc} Kč`],
    ],
    odstavce: [
      'Předplatné je ukončené a další platby už nepřijdou.',
      vratkaKc > 0
        ? `Vrácenou částku posíláme na kartu, kterou jsi platil. Na účtu ji uvidíš obvykle do 5–10 pracovních dní.`
        : 'Poměrná část za dny, kdy služba běžela, pokryla celou zaplacenou částku, takže se nic nevrací.',
      'Kdyby něco nesedělo, odpověz na tenhle e-mail.',
    ],
  });
  return { subject, text, html };
}

/**
 * Odeslání transakčního e-mailu. Nikdy nevyhazuje — vrací výsledek.
 * @param {string} to
 * @param {{ subject: string, text: string, html: string }} obsah
 * @returns {Promise<{ ok: boolean, message_id?: string|null, error_code?: string }>}
 */
export async function posliTransakcniEmail(to, obsah) {
  const adresa = String(to || '').trim();
  if (!adresa.includes('@')) return { ok: false, error_code: 'invalid_recipient' };
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return { ok: false, error_code: 'gmail_not_configured' };

  const from = process.env.EMAIL_FROM || process.env.GMAIL_FROM || process.env.GMAIL_USER;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  try {
    const info = await Promise.race([
      transporter.sendMail({
        from: `Body & Mind ON <${from}>`,
        replyTo: 'info@bodyandmindon.cz',
        to: adresa,
        subject: obsah.subject,
        text: obsah.text,
        html: obsah.html,
      }),
      new Promise((_, reject) => { setTimeout(() => reject(new Error('send_timeout')), SEND_TIMEOUT_MS); }),
    ]);
    return { ok: true, message_id: info?.messageId ?? null };
  } catch (err) {
    return { ok: false, error_code: err?.message === 'send_timeout' ? 'send_timeout' : 'send_failed' };
  }
}
