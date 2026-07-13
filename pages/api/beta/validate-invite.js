// POST /api/beta/validate-invite — public invite validation (no PII)
import { supabaseServer } from '../../../lib/supabaseServer';
import { hashInviteCode, isValidInviteCodeFormat } from '../../../lib/betaInviteCrypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const inviteCode = String(req.body?.invite_code || '').trim();
  if (!isValidInviteCodeFormat(inviteCode)) {
    return res.status(200).json({ valid: false });
  }

  const hash = hashInviteCode(inviteCode);
  const { data, error } = await supabaseServer.rpc('validate_beta_invite', {
    p_invite_hash: hash,
  });

  if (error) {
    console.error('[api/beta/validate-invite] rpc failed');
    return res.status(200).json({ valid: false });
  }

  const result = data || {};
  return res.status(200).json({
    valid: result.valid === true,
    cohort_code: result.valid ? result.cohort_code : undefined,
    cohort_name: result.valid ? result.cohort_name : undefined,
    remaining_slots: result.valid ? result.remaining_slots : undefined,
  });
}
