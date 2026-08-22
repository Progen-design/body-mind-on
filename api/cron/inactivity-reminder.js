// GET/POST /api/cron/inactivity-reminder — jedna připomínka, když se 3 dny nic neděje.
//
// Běží jednou denně. Kdo si za poslední 3 dny neodškrtl jídlo, trénink ani
// návyk, dostane krátký e-mail s odkazem do profilu. Nejvýš jednou týdně —
// a tu záruku drží databáze, ne kód: `trigger_key` nese ISO týden a
// `lifecycle_emails` má unikát na (user_id, trigger_key), takže druhý pokus
// v tomtéž týdnu spadne na 23505.
//
// ZÁZNAM SE ZAKLÁDÁ PŘED ODESLÁNÍM, ne po něm. Kdyby se pořadí obrátilo a
// funkce spadla mezi odesláním a zápisem, příští běh by e-mail poslal znovu.
// Radši neodeslaný e-mail se záznamem než dva e-maily bez něj.
import nodemailer from 'nodemailer';
import { verifyCronSecret } from '../../lib/betaEmailCronAuth.js';
import { supabaseServer } from '../../lib/supabaseServer.js';
import { getPlanEmailCtaUrl } from '../../lib/siteUrls.js';
import { isTestAccountEmail } from '../../lib/testAccountEmails.js';
import {
  DNU_NEAKTIVITY,
  klicPripominky,
  maPoslatPripominku,
  posledniAktivita,
  textPripominky,
} from '../../lib/inactivityReminder.js';

const DAVKA = 50;

function mask(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  return at < 1 ? '***' : `${s.slice(0, 2)}***@${s.slice(at + 1)}`;
}

function jeZapnuto() {
  return String(process.env.INACTIVITY_REMINDER_ENABLED || '').toLowerCase() === 'true';
}

async function posli(to, subject, text) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS;
  if (!user || !pass) return { ok: false, error_code: 'smtp_not_configured' };
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  const from = `Body & Mind ON <${process.env.EMAIL_FROM || user}>`;
  const info = await transport.sendMail({ from, to, subject, text });
  return { ok: true, message_id: info?.messageId ?? null };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = verifyCronSecret(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });

  const dryRun = req.query?.dry_run === '1' || req.body?.dry_run === true;
  const now = new Date();
  const triggerKey = klicPripominky(now);
  const stats = { kandidatu: 0, odeslano: 0, preskoceno: 0, chyb: 0, dry_run: dryRun, trigger_key: triggerKey };
  const duvody = {};
  const pridej = (d) => { duvody[d] = (duvody[d] || 0) + 1; };

  if (!jeZapnuto() && !dryRun) {
    return res.status(200).json({ ok: true, skipped: 'disabled', hint: 'INACTIVITY_REMINDER_ENABLED != true' });
  }

  try {
    const { data: clenstvi, error } = await supabaseServer
      .from('memberships')
      .select('user_id, status')
      .in('status', ['active', 'trial'])
      .limit(500);
    if (error) throw new Error(`memberships: ${error.message}`);

    stats.kandidatu = (clenstvi || []).length;

    for (const m of (clenstvi || []).slice(0, DAVKA)) {
      const { data: prof } = await supabaseServer
        .from('profiles').select('email, name, created_at').eq('id', m.user_id).maybeSingle();
      const email = prof?.email;
      // Testovací účty nikdy — smoke testy jinak rozešlou poštu na example.com.
      if (!email || isTestAccountEmail(email)) { stats.preskoceno += 1; pridej('testovaci_nebo_bez_emailu'); continue; }

      const od = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: completions }, { data: habitLogs }, { data: checkins }, { data: jizPoslano }] = await Promise.all([
        supabaseServer.from('daily_activity_completions').select('completed_at').eq('user_id', m.user_id).gte('completed_at', od),
        supabaseServer.from('habit_logs').select('created_at').eq('user_id', m.user_id).gte('created_at', od),
        supabaseServer.from('daily_checkins').select('checkin_date').eq('user_id', m.user_id).gte('checkin_date', od.slice(0, 10)),
        supabaseServer.from('lifecycle_emails').select('id').eq('user_id', m.user_id).eq('trigger_key', triggerKey).maybeSingle(),
      ]);

      const rozhodnuti = maPoslatPripominku({
        posledniAktivitaAt: posledniAktivita({ completions, habitLogs, checkins }),
        registrovanAt: prof?.created_at ?? null,
        membershipStatus: m.status,
        now,
        jizPoslanoTentoTyden: !!jizPoslano,
      });

      if (!rozhodnuti.poslat) { stats.preskoceno += 1; pridej(rozhodnuti.duvod); continue; }
      if (dryRun) { stats.odeslano += 1; pridej(`dry_run:${rozhodnuti.duvod}`); continue; }

      // Nejdřív rezervace v evidenci — unikát tím zároveň brání dvojímu odeslání.
      const { error: insErr } = await supabaseServer.from('lifecycle_emails').insert([{
        user_id: m.user_id, trigger_key: triggerKey, status: 'processing', scheduled_at: now.toISOString(),
      }]);
      if (insErr) {
        if (insErr.code === '23505') { stats.preskoceno += 1; pridej('souběh_uz_rezervovano'); continue; }
        stats.chyb += 1; pridej('rezervace_selhala'); continue;
      }

      const { subject, text } = textPripominky({
        jmeno: prof?.name ?? null,
        dnuBezAktivity: rozhodnuti.dnuBezAktivity,
        ctaUrl: getPlanEmailCtaUrl(),
      });

      try {
        const vysledek = await posli(email, subject, text);
        await supabaseServer.from('lifecycle_emails').update({
          status: vysledek.ok ? 'sent' : 'failed',
          sent_at: vysledek.ok ? new Date().toISOString() : null,
          error_code: vysledek.ok ? null : (vysledek.error_code || 'send_failed'),
          provider_message_id: vysledek.message_id ?? null,
          updated_at: new Date().toISOString(),
        }).eq('user_id', m.user_id).eq('trigger_key', triggerKey);
        if (vysledek.ok) { stats.odeslano += 1; pridej(rozhodnuti.duvod); }
        else { stats.chyb += 1; pridej(`odeslani:${vysledek.error_code}`); }
        console.log(JSON.stringify({ event: 'inactivity_reminder', to: mask(email), ok: vysledek.ok, duvod: rozhodnuti.duvod, dnu: rozhodnuti.dnuBezAktivity }));
      } catch (e) {
        stats.chyb += 1; pridej('vyjimka_pri_odeslani');
        await supabaseServer.from('lifecycle_emails').update({
          status: 'failed', error_code: String(e?.message || e).slice(0, 120), updated_at: new Date().toISOString(),
        }).eq('user_id', m.user_id).eq('trigger_key', triggerKey);
      }
    }

    return res.status(200).json({ ok: true, prah_dnu: DNU_NEAKTIVITY, ...stats, duvody });
  } catch (err) {
    console.error('[inactivity-reminder]', err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || 'Chyba serveru' });
  }
}
