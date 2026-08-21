// GET /api/auth/google-calendar/connect – přesměruje na Google OAuth (pouze pro trenéra/admin)
// Použití: ?key=ADMIN_TOKEN nebo Authorization: Bearer ADMIN_TOKEN
import { getAuthUrl } from '../../../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const adminToken = process.env.ADMIN_TOKEN;
  const key = req.query?.key || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!adminToken || key !== adminToken) {
    return res.status(403).json({ error: 'Neoprávněný přístup. Pouze admin/trenér může propojit kalendář.' });
  }
  try {
    const state = 'trainer';
    const url = getAuthUrl(state);
    res.redirect(302, url);
  } catch (err) {
    console.error('[google-calendar connect]', err);
    res.status(500).json({ error: err.message || 'Chyba při sestavení OAuth URL' });
  }
}
