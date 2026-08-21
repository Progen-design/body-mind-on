// GET /api/auth/google-calendar/callback – Google sem pošle ?code=...&state=...
// Vyměníme kód za tokeny a uložíme do trainer_calendar_tokens
import { exchangeCodeForTokens } from '../../../../lib/googleCalendar';
import { supabaseServer } from '../../../../lib/supabaseServer';

function getProfilRedirect(status) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '') || '';
  return base ? `${base}/profil?calendar=${status}` : `/profil?calendar=${status}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { code, error: oauthError } = req.query || {};
  if (oauthError) {
    console.error('[google-calendar callback] OAuth error:', oauthError);
    return res.redirect(302, getProfilRedirect('error'));
  }
  if (!code) {
    return res.redirect(302, getProfilRedirect('missing'));
  }
  try {
    const { access_token, refresh_token, expires_in } = await exchangeCodeForTokens(code);
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    const { error: delErr } = await supabaseServer
      .from('trainer_calendar_tokens')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows

    if (delErr) console.warn('[google-calendar callback] delete old tokens:', delErr);

    const { error: insertErr } = await supabaseServer
      .from('trainer_calendar_tokens')
      .insert({
        access_token,
        refresh_token,
        expires_at: expiresAt,
        calendar_id: 'primary',
        updated_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error('[google-calendar callback] insert error:', insertErr);
      return res.redirect(302, getProfilRedirect('save_failed'));
    }
    // Po úspěšném propojení kalendáře vymazat stav alertu (aby se mohl znovu poslat při budoucím problému)
    await supabaseServer.from('trainer_alert_state').delete().eq('key', 'last_trainer_calendar_alert');
    return res.redirect(302, getProfilRedirect('connected'));
  } catch (err) {
    console.error('[google-calendar callback]', err);
    return res.redirect(302, getProfilRedirect('error'));
  }
}
