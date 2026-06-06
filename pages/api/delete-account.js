// /pages/api/delete-account.js – Smazání účtu a všech dat uživatele
import { supabaseServer } from '../../lib/supabaseServer';

function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Authorization required', status: 401 };
  return { token };
}

async function requireUser(req) {
  const { token, error, status } = getAuthUser(req);
  if (error) return { error, status };
  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user) return { error: 'Invalid or expired token', status: 401 };
  return { user };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userResult = await requireUser(req);
    if (userResult.error) {
      return res.status(userResult.status).json({ error: userResult.error });
    }
    const { user } = userResult;

    const { confirm } = req.body || {};
    if (confirm !== true) {
      return res.status(400).json({ error: 'Pro smazání účtu je nutné potvrzení (confirm: true)' });
    }

    const userId = user.id;

    const { data: deleted, error: rpcErr } = await supabaseServer.rpc('delete_user_data', {
      target_user_id: userId,
    });
    if (rpcErr) {
      console.error('[delete-account] delete_user_data:', rpcErr);
      return res.status(500).json({
        error: rpcErr.message || 'Nepodařilo se smazat data účtu. Kontaktujte nás na info@bodyandmindon.cz.',
      });
    }

    const { error: authErr } = await supabaseServer.auth.admin.deleteUser(userId);
    if (authErr) {
      console.error('[delete-account] auth.admin.deleteUser:', authErr);
      return res.status(500).json({
        error: authErr.message || 'Nepodařilo se smazat účet. Kontaktujte nás na info@bodyandmindon.cz.',
      });
    }

    return res.status(200).json({ ok: true, message: 'Účet byl úspěšně smazán.', deleted: deleted ?? null });
  } catch (err) {
    console.error('[delete-account] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru při mazání účtu.' });
  }
}
