// POST /api/beta/join — direct beta cohort join (no invite code)
import { supabaseServer } from '../../../lib/supabaseServer';
import { BETA_TERMS_VERSION, DEFAULT_BETA_COHORT_CODE } from '../../../lib/betaCohortConstants';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Nejste přihlášen' });
  }

  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user?.id) {
    return res.status(401).json({ error: 'Neplatná session' });
  }

  if (req.body?.user_id) {
    /* never trust client user_id */
  }

  if (!req.body?.beta_terms_accepted) {
    return res.status(400).json({ error: 'Je nutný souhlas s beta podmínkami.' });
  }

  const termsVersion = String(req.body?.beta_terms_version || BETA_TERMS_VERSION).slice(0, 64);
  const cohortCode = String(req.body?.cohort_code || DEFAULT_BETA_COHORT_CODE).trim().toUpperCase();

  const { data, error } = await supabaseServer.rpc('join_beta_cohort', {
    p_user_id: user.id,
    p_cohort_code: cohortCode,
    p_beta_terms_version: termsVersion,
    p_source: 'direct_beta_link',
  });

  if (error) {
    console.error('[api/beta/join] rpc failed');
    return res.status(500).json({ error: 'Nepodařilo se přidat do beta cohorty.' });
  }

  const result = data || {};
  if (!result.ok) {
    const code = result.error_code || 'join_failed';
    if (code === 'cohort_full') {
      return res.status(409).json({
        error: 'Beta testování je momentálně naplněné. Děkujeme za zájem.',
        error_code: code,
      });
    }
    if (code === 'cohort_closed' || code === 'cohort_not_found') {
      return res.status(403).json({
        error: 'Beta testování momentálně nepřijímá nové účastníky.',
        error_code: code,
      });
    }
    return res.status(400).json({ error: 'Nepodařilo se přidat do beta cohorty.', error_code: code });
  }

  return res.status(200).json({
    ok: true,
    cohort_code: result.cohort_code,
    already_joined: result.already_joined === true,
  });
}
