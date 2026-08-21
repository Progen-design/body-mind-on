/**
 * POST /api/registration/email-available
 * Body: { email }
 * Response: { available: boolean } only — never account status, role, or other PII.
 */
import { enforcePublicEndpointRateLimit } from '../../../lib/rateLimit';
import { checkRegistrationEmailAvailable } from '../../../lib/registration/emailAvailability';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ available: false });
  }

  try {
    const email = req.body?.email;
    const rateLimit = await enforcePublicEndpointRateLimit(req, {
      scope: 'registration-email-available',
      email,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (rateLimit.limited) {
      if (rateLimit.retryAfterSec) res.setHeader('Retry-After', String(rateLimit.retryAfterSec));
      return res.status(429).json({ available: false });
    }

    const result = await checkRegistrationEmailAvailable(email);
    return res.status(200).json({ available: result.available === true });
  } catch (err) {
    console.error('[registration/email-available]', err?.message || err);
    return res.status(200).json({ available: false });
  }
}
