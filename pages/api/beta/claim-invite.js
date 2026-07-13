// POST /api/beta/claim-invite — authenticated beta invite claim
import { supabaseServer } from '../../lib/supabaseServer';
import { hashInviteCode, isValidInviteCodeFormat } from '../../lib/betaInviteCrypto';
import { BETA_TERMS_VERSION } from '../../lib/betaCohortConstants';

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

  // Never trust client user_id
  if (req.body?.user_id) {
    /* ignored */
  }

  const inviteCode = String(req.body?.invite_code || '').trim();
  if (!isValidInviteCodeFormat(inviteCode)) {
    return res.status(400).json({ error: 'Neplatný invite kód.' });
  }

  if (!req.body?.beta_terms_accepted) {
    return res.status(400).json({ error: 'Je nutný souhlas s beta podmínkami.' });
  }

  const termsVersion = String(req.body?.beta_terms_version || BETA_TERMS_VERSION).slice(0, 64);
  const hash = hashInviteCode(inviteCode);

  const { data, error } = await supabaseServer.rpc('claim_beta_invite', {
    p_invite_hash: hash,
    p_user_id: user.id,
    p_beta_terms_version: termsVersion,
  });

  if (error) {
    console.error('[api/beta/claim-invite] rpc failed');
    return res.status(500).json({ error: 'Invite se nepodařilo uplatnit.' });
  }

  const result = data || {};
  if (!result.ok) {
    const code = result.error_code || 'claim_failed';
    const messages = {
      invalid_invite: 'Invite kód není platný.',
      invite_used: 'Invite kód už byl použit.',
      cohort_closed: 'Beta cohort už nepřijímá nové účastníky.',
      cohort_full: 'Beta cohort je plná.',
      already_in_cohort: 'Už jsi v této beta cohortě.',
    };
    return res.status(400).json({ error: messages[code] || 'Invite se nepodařilo uplatnit.', error_code: code });
  }

  return res.status(200).json({
    ok: true,
    cohort_code: result.cohort_code,
    already_claimed: result.already_claimed === true,
  });
}
