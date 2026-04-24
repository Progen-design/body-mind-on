// /lib/mail.js
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { escapeHtml, sanitizePlanHtml, stripPlanMediaAttrsFromHtml, formatPlanHtmlForEmail, buildPlanEmailDocument } from './emailTemplates';
import { buildShoppingListEmailIntro } from './czechShoppingIntro';

function firstNameFromOptions(options) {
  const raw = (options?.firstName || options?.recipientName || options?.name || '').trim();
  if (raw) return raw.split(/\s+/)[0] || '';
  return '';
}

export async function sendPlanEmail(email, planHtml, options = {}) {
  try {
    const hasGmail = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;
    const hasResend = !!process.env.RESEND_API_KEY;
    if (!hasGmail && !hasResend) {
      throw new Error('Chybí GMAIL_USER+GMAIL_APP_PASSWORD nebo RESEND_API_KEY v env. Nastav alespoň jeden zdroj ve Vercelu (Settings → Environment Variables).');
    }
    const transporter = hasGmail
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
          },
        })
      : null;

    const rawHtml = stripPlanMediaAttrsFromHtml(sanitizePlanHtml(String(planHtml || '').trim()));
    const safePlanHtml = formatPlanHtmlForEmail(rawHtml);
    const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
    const loginPassword = options.loginPassword || null;
    const loginUrl = (options.loginUrl || 'https://app.bodyandmindon.cz/login').replace(/\/$/, '');
    const existingAccount = options.existingAccount === true;
    const loginUnavailable = options.loginUnavailable === true;
    const userChosePassword = options.userChosePassword === true;
    const planChangeContext = options.planChangeContext === true;

    const loginBlock =
      loginUnavailable
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#2d2a1e;border:1px solid #4a4530;border-radius:12px;" bgcolor="#2d2a1e"><tr><td style="padding:16px 20px;color:#eaeaea;font-size:14px;">🔐 <strong>Přihlašovací účet</strong> se nepodařilo vytvořit. Údaje a plán jsme ti uložili – pro přístup do profilu nás kontaktuj na <a href="mailto:info@bodyandmindon.cz" style="color:#818cf8;">info@bodyandmindon.cz</a>.</td></tr></table>`
        : userChosePassword
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#1e1e2e;border:1px solid #3b3b52;border-radius:12px;" bgcolor="#1e1e2e"><tr><td style="padding:16px 20px;color:#eaeaea;font-size:14px;">🔐 <strong>Přihlášení:</strong> E-mail: <strong>${escapeHtml(email)}</strong><br>Přihlásit se můžeš heslem, které sis zvolil(a), na <a href="${loginUrl}" style="color:#818cf8;">${loginUrl}</a> – tam uvidíš svůj profil, údaje a plán.</td></tr></table>`
          : loginPassword
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#1e1e2e;border:1px solid #3b3b52;border-radius:12px;" bgcolor="#1e1e2e"><tr><td style="padding:16px 20px;color:#eaeaea;font-size:14px;">🔐 <strong>Přihlašovací údaje</strong> (ulož si je):<br>E-mail: <strong>${escapeHtml(email)}</strong><br>Heslo: <strong>${escapeHtml(loginPassword)}</strong><br>Přihlásit se můžeš na <a href="${loginUrl}" style="color:#818cf8;">${loginUrl}</a> – tam uvidíš svůj profil, údaje a plán.</td></tr></table>`
            : existingAccount
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#1e1e2e;border:1px solid #3b3b52;border-radius:12px;" bgcolor="#1e1e2e"><tr><td style="padding:16px 20px;color:#eaeaea;font-size:14px;">🔐 <strong>Přihlášení:</strong> Účet s tímto e-mailem už máš. Nemohl jsem ti vygenerovat nové heslo – na <a href="${loginUrl}" style="color:#818cf8;">${loginUrl}</a> zvol „Zapomenuté heslo“ a pošleme ti odkaz pro obnovu.</td></tr></table>`
              : '';

    const htmlTemplate = buildPlanEmailDocument({
      safePlanHtml,
      loginBlock,
      loginUrl,
      planChangeContext,
      appBaseUrl,
      firstName: firstNameFromOptions(options),
      ctaUrl: options.ctaUrl ? String(options.ctaUrl).replace(/\/$/, '') : undefined,
    });

    // 3) Odeslání e-mailu – Gmail primárně, Resend fallback při selhání
    const subject = planChangeContext ? 'Změnil jsi své preference – tvůj nový jídelní plán 💪' : 'Tvůj jídelní plán je připraven 💪';
    const fromAddr = process.env.EMAIL_FROM || process.env.GMAIL_FROM || process.env.GMAIL_USER || 'noreply@bodyandmindon.cz';
    const fromHeader = `Body & Mind ON <${fromAddr}>`;

    let lastError = null;

    // 3a) Zkus Gmail
    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: fromHeader,
          to: email,
          subject,
          html: htmlTemplate,
        });
        console.info('[mail] Plan email sent via Gmail, messageId:', info.messageId);
        return { ok: true };
      } catch (gmailErr) {
        lastError = gmailErr;
        console.warn('[mail] Gmail failed, trying Resend fallback:', gmailErr?.message);
      }
    }

    // 3b) Fallback: Resend (pokud je RESEND_API_KEY)
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const resendFrom = process.env.RESEND_FROM || fromHeader;
        const { data, error } = await resend.emails.send({
          from: resendFrom,
          to: email,
          subject,
          html: htmlTemplate,
        });
        if (error) throw new Error(error.message);
        console.info('[mail] Plan email sent via Resend, id:', data?.id);
        return { ok: true };
      } catch (resendErr) {
        console.warn('[mail] Resend fallback failed:', resendErr?.message);
        lastError = lastError || resendErr;
      }
    }

    const errMsg = lastError?.message || 'E-mail se nepodařilo odeslat.';
    console.error('❌ sendPlanEmail ERROR:', lastError);
    return { ok: false, message: errMsg };
  } catch (err) {
    console.error('❌ sendPlanEmail ERROR:', err);
    return { ok: false, message: err.message };
  }
}

/**
 * Odešle nákupní seznam na e-mail (pro přihlášené uživatele).
 * @param {string[]|null} items – plochý seznam řádků
 * @param {string|null} title – např. „Sobota (25. 4.)“ pro jeden den
 * @param {{ sections?: { heading: string, items: string[] }[], intro?: string }} [options] – více dnů: sections s nadpisy
 */
export async function sendShoppingListEmail(email, items, title = null, options = {}) {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('Chybí GMAIL_USER nebo GMAIL_APP_PASSWORD v env.');
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const sections = Array.isArray(options.sections) && options.sections.length > 0 ? options.sections : null;

    const li = (s) => `<li style="margin:4px 0;color:#d4d4d8;">${escapeHtml(String(s))}</li>`;

    let bodyInner;
    let introText;

    if (sections) {
      introText =
        typeof options.intro === 'string' && options.intro.trim()
          ? escapeHtml(options.intro.trim())
          : escapeHtml('Tady máš suroviny z tvého plánu rozdělené podle dnů:');
      const blocks = sections.map((sec) => {
        const head = sec.heading
          ? `<p style="margin:20px 0 8px;font-size:14px;font-weight:700;color:#c4b5fd;">${escapeHtml(String(sec.heading))}</p>`
          : '';
        const arr = Array.isArray(sec.items) ? sec.items : [];
        const inner =
          arr.length > 0
            ? arr.map((item) => li(item)).join('')
            : '<li style="color:#71717a;">Pro tento den nejsou v plánu vypsané suroviny z receptů.</li>';
        return `${head}<ul style="margin:0 0 4px;padding-left:20px;color:#d4d4d8;">${inner}</ul>`;
      });
      bodyInner = blocks.join('');
    } else {
      const listHtml =
        Array.isArray(items) && items.length > 0
          ? items.map((item) => li(item)).join('')
          : '<li style="color:#71717a;">Seznam je prázdný – v plánu zatím nejsou suroviny z receptů. Zkus celý týden v profilu nebo vygeneruj nový plán.</li>';
      introText = title ? buildShoppingListEmailIntro(title) : 'Tady máš suroviny z tvého plánu na celý týden:';
      bodyInner = `<ul style="margin:0;padding-left:20px;color:#d4d4d8;">${listHtml}</ul>`;
    }

    const htmlBody = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#0a0a0f;color:#eaeaea;font-family:Segoe UI,Roboto,sans-serif;font-size:16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;">
    <tr><td style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background-color:#12121a;border-radius:16px;overflow:hidden;" bgcolor="#12121a">
        <tr><td style="padding:24px 24px 16px;background-color:#1a0a2e;border-bottom:1px solid #2a2a3d;" bgcolor="#1a0a2e">
          <p style="margin:0;font-size:14px;color:#a78bfa;">Nákupní seznam</p>
          <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#fff;">Body &amp; Mind ON</h1>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 16px;font-size:15px;color:#a1a1aa;line-height:1.6;">${introText}</p>
          ${bodyInner}
          <p style="margin:20px 0 0;font-size:13px;color:#71717a;">Body &amp; Mind ON</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const subjectSuffix = title ? ` – ${title}` : '';
    await transporter.sendMail({
      from: `Body & Mind ON <${process.env.EMAIL_FROM || process.env.GMAIL_FROM || process.env.GMAIL_USER}>`,
      to: email,
      subject: `🛒 Tvůj nákupní seznam – Body & Mind ON${subjectSuffix}`,
      html: htmlBody,
    });
    return { ok: true };
  } catch (err) {
    console.error("❌ sendShoppingListEmail ERROR:", err);
    return { ok: false, message: err.message };
  }
}

/**
 * Odešle e-mail s pozvánkou na trénink. Obsahuje odkaz „Přidat do Google Kalendáře“ – záleží na uživateli, jestli si ji přidá (potvrdí).
 * @param {string} to - e-mail příjemce
 * @param {{ title: string, start: string, end: string }} - title, start/end v ISO
 */
export async function sendTrainingInvitationEmail(to, { title, start, end }) {
  if (!to || !title) return { ok: false, message: 'Chybí e-mail nebo název.' };
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('Chybí GMAIL_USER nebo GMAIL_APP_PASSWORD v env.');
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const startDate = new Date(start);
    const endDate = new Date(end);
    const prague = { timeZone: 'Europe/Prague' };
    const startFormatted = isNaN(startDate.getTime()) ? start : startDate.toLocaleString('cs-CZ', { ...prague, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const endFormatted = isNaN(endDate.getTime()) ? end : endDate.toLocaleString('cs-CZ', { ...prague, hour: '2-digit', minute: '2-digit' });

    // Odkaz pro přidání události do Google Kalendáře (uživatel si ji může přidat = potvrdit)
    const formatForGoogle = (iso) => {
      const d = new Date(iso);
      return d.toISOString().replace(/-/g, '').replace(/:/g, '').split('.')[0] + 'Z';
    };
    const addToCalendarUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(title)
      + '&dates=' + formatForGoogle(start) + '/' + formatForGoogle(end)
      + '&details=' + encodeURIComponent(`Pozvánka z Body & Mind ON. Trénink: ${title}.`);

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '') + '/profil';

    const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;color:#eaeaea;font-family:Segoe UI,Roboto,sans-serif;font-size:16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;">
    <tr><td style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#12121a;border-radius:16px;overflow:hidden;" bgcolor="#12121a">
        <tr>
          <td style="padding:24px 24px 16px;background:#1a0a2e;border-bottom:1px solid #2a2a3d;" bgcolor="#1a0a2e">
            <p style="margin:0;font-size:14px;color:#a78bfa;">Pozvánka na trénink</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#fff;">${escapeHtml(title)}</h1>
          </td>
        </tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 12px;color:#d4d4d8;font-size:15px;"><strong>Datum a čas:</strong> ${escapeHtml(startFormatted)} – ${escapeHtml(endFormatted)}</p>
          <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;">Trenér ti naplánoval tento trénink. Můžeš si ho přidat do svého kalendáře – záleží na tobě, jestli účast potvrdíš.</p>
          <p style="margin:0 0 12px;">
            <a href="${addToCalendarUrl}" style="display:inline-block;padding:12px 24px;border-radius:12px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;background:#7c3aed;">Přidat do Google Kalendáře</a>
          </p>
          <p style="margin:16px 0 0;font-size:14px;">
            <a href="${appUrl}" style="color:#a78bfa;">Otevřít profil v aplikaci</a>
          </p>
          <p style="margin:24px 0 0;font-size:13px;color:#71717a;">Body &amp; Mind ON · Pozvánka na trénink</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from: `Body & Mind ON <${process.env.EMAIL_FROM || process.env.GMAIL_FROM || process.env.GMAIL_USER}>`,
      to: to.trim(),
      subject: `Pozvánka na trénink: ${title} – ${startFormatted}`,
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error('[sendTrainingInvitationEmail]', err);
    return { ok: false, message: err.message };
  }
}

const FEEDBACK_EMAIL = 'info@bodyandmindon.cz';
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');

/**
 * Odešle průvodní e-mail testovacím klientům – uvítání, stručný průvodce a výzva ke zpětné vazbě na info@bodyandmindon.cz.
 * @param {string} email - e-mail příjemce
 * @param {{ name?: string }} options - volitelně jméno klienta
 */
export async function sendTestingWelcomeEmail(email, options = {}) {
  if (!email || !email.trim()) return { ok: false, message: 'Chybí e-mail.' };
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('Chybí GMAIL_USER nebo GMAIL_APP_PASSWORD v env.');
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const name = (options.name || '').trim();
    const greeting = name ? `Ahoj ${escapeHtml(name)}` : 'Ahoj';

    const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vítej v testování – Body &amp; Mind ON</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;color:#eaeaea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0f;">
    <tr><td align="center" style="padding:32px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#12121a;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.4);border:1px solid #2a2a3d;" bgcolor="#12121a">
        <!-- Hlavička -->
        <tr>
          <td align="center" style="padding:36px 28px;background:linear-gradient(135deg,#1a0a2e 0%,#2d1b4e 100%);border-bottom:1px solid rgba(139,92,255,0.3);" bgcolor="#1a0a2e">
            <p style="margin:0 0 6px;font-size:13px;color:#c4b5fd;text-transform:uppercase;letter-spacing:0.12em;">Vítej v testování</p>
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Body &amp; Mind ON</h1>
            <p style="margin:10px 0 0;font-size:15px;color:#e9d5ff;">Tvůj názor nám pomůže aplikaci zlepšit</p>
          </td>
        </tr>
        <!-- Úvod -->
        <tr>
          <td style="padding:28px 28px 8px;color:#eaeaea;" bgcolor="#12121a">
            <p style="margin:0 0 20px;font-size:18px;font-weight:600;color:#fff;">${greeting},</p>
            <p style="margin:0 0 20px;font-size:15px;color:#d4d4d8;line-height:1.7;">Díky, že jsi součástí testování. V aplikaci máš k dispozici <strong style="color:#c4b5fd;">profil</strong>, <strong style="color:#c4b5fd;">jídelníček a tréninkový plán</strong> na míru a <strong style="color:#c4b5fd;">denní návyky</strong>. Prohlížej si je, zkus je v praxi a dej nám vědět, co funguje a co ne.</p>
          </td>
        </tr>
        <!-- Zpětná vazba – výrazný blok -->
        <tr>
          <td style="padding:0 28px 24px;" bgcolor="#12121a">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#1e3a2f 0%,#0f2a22 100%);border:1px solid rgba(34,197,94,0.4);border-radius:16px;overflow:hidden;" bgcolor="#1e3a2f">
              <tr>
                <td style="padding:24px 24px 20px;">
                  <p style="margin:0 0 8px;font-size:12px;color:#86efac;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">📩 Kam posílat zpětnou vazbu</p>
                  <p style="margin:0 0 16px;font-size:15px;color:#eaeaea;line-height:1.65;">Všechny postřehy, nápady i připomínky posílej na jeden adresát – odpovíme a zapracujeme je do dalších úprav.</p>
                  <p style="margin:0 0 16px;font-size:17px;font-weight:700;color:#fff;">
                    <a href="mailto:${FEEDBACK_EMAIL}" style="color:#86efac;text-decoration:none;">${FEEDBACK_EMAIL}</a>
                  </p>
                  <p style="margin:0;font-size:14px;color:#a7f3d0;">Co nám můžeš napsat? Cokoli – co ti vyhovuje, co bys změnil(a), co chybí, nebo kde jsi něco nerozuměl(a). Těšíme se na tvůj e-mail.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Odkaz do aplikace -->
        <tr>
          <td style="padding:0 28px 28px;" bgcolor="#12121a">
            <p style="text-align:center;margin:0 0 20px;">
              <a href="${APP_URL}/profil" style="display:inline-block;padding:16px 32px;border-radius:14px;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;background:linear-gradient(135deg,#7c3aed,#6d28d9);">Otevřít aplikaci →</a>
            </p>
            <p style="margin:0;font-size:13px;color:#71717a;text-align:center;">Body &amp; Mind ON · Průvodní e-mail pro testování</p>
          </td>
        </tr>
        <!-- Patička -->
        <tr>
          <td style="padding:20px 28px;text-align:center;font-size:13px;color:#6b7280;border-top:1px solid #2a2a3d;background-color:#0d0d12;" bgcolor="#0d0d12">
            &copy; ${new Date().getFullYear()} Body &amp; Mind ON &middot; <a href="https://www.bodyandmindon.cz" style="color:#a78bfa;text-decoration:none;">www.bodyandmindon.cz</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from: `Body & Mind ON <${process.env.EMAIL_FROM || process.env.GMAIL_FROM || process.env.GMAIL_USER}>`,
      to: email.trim(),
      subject: 'Vítej v testování – Body & Mind ON 💪',
      html,
    });
    console.log('📧 sendTestingWelcomeEmail odesláno:', email.trim());
    return { ok: true };
  } catch (err) {
    console.error('❌ sendTestingWelcomeEmail ERROR:', err);
    return { ok: false, message: err.message };
  }
}

const TRAINER_ALERT_EMAIL = process.env.TRAINER_ALERT_EMAIL || 'info@bodyandmindon.cz';

/**
 * Odešle upozornění trenérovi, že kalendář není propojen nebo brzy vyprší.
 * @param {string} reason - důvod (např. 'no_tokens', 'expiring_soon')
 */
export async function sendTrainerAlertEmail(reason) {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('Chybí GMAIL_USER nebo GMAIL_APP_PASSWORD v env.');
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    const message = reason === 'no_tokens'
      ? 'Kalendář trenéra není propojen. Uživatelé nevidí rozvrh.'
      : 'Token kalendáře trenéra brzy vyprší (méně než 7 dní).';
    const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:20px;font-family:sans-serif;color:#1e293b;">
  <h2 style="color:#7c3aed;">⚠️ Upozornění – Body &amp; Mind ON</h2>
  <p>${escapeHtml(message)}</p>
  <p><strong>Propoj znovu přes Admin.</strong></p>
  <p style="color:#64748b;font-size:14px;">Tento e-mail byl odeslán automaticky.</p>
</body>
</html>`;
    await transporter.sendMail({
      from: `Body & Mind ON <${process.env.EMAIL_FROM || process.env.GMAIL_FROM || process.env.GMAIL_USER}>`,
      to: TRAINER_ALERT_EMAIL,
      subject: 'Upozornění: Kalendář trenéra – Body & Mind ON',
      html,
    });
    console.log('📧 sendTrainerAlertEmail odesláno:', reason);
    return { ok: true };
  } catch (err) {
    console.error('❌ sendTrainerAlertEmail ERROR:', err);
    return { ok: false, message: err.message };
  }
}
