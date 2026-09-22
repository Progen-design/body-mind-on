/**
 * Admin API auth — Bearer ADMIN_TOKEN only (never query/body token).
 * @param {import('next').NextApiRequest} req
 * @returns {boolean}
 */
export function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return Boolean(process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
}

/**
 * Admin, který je ZÁROVEŇ přihlášený jako uživatel.
 *
 * PROČ DRUHÁ HLAVIČKA. `community_replies.user_id` je NOT NULL s cizím
 * klíčem na `auth.users` — týmová odpověď tedy musí mít skutečný účet
 * autora. `Authorization` v takovém požadavku nese uživatelský token, takže
 * ADMIN_TOKEN nemá kudy projít a `isAdmin()` by vracelo false.
 *
 * `x-admin-token` je pořád HLAVIČKA, ne query ani tělo — do logů požadavků
 * ani do URL se nedostane, což je důvod, proč je `isAdmin()` omezené tak,
 * jak je. Tajemství je totéž, liší se jen přihrádka.
 *
 * @param {import('next').NextApiRequest} req
 * @returns {boolean}
 */
export function jeAdminSUctem(req) {
  const hlavicka = req.headers['x-admin-token'];
  const token = String(Array.isArray(hlavicka) ? hlavicka[0] : (hlavicka || '')).trim();
  return Boolean(process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
}

/**
 * Vercel cron auth — Bearer CRON_SECRET.
 * @param {import('next').NextApiRequest} req
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
export function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET is not configured' };
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}
