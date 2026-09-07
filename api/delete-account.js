// /api/delete-account.js – Smazání účtu a všech dat uživatele
import { supabaseServer } from '../lib/supabaseServer.js';

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

    // E-MAIL SE POSÍLÁ SCHVÁLNĚ — docs/DALSI_KROK.md 9.2.
    //
    // `registrations` (a waitlist) se klíčuje e-mailem, ne user_id, protože
    // registrace vzniká PŘED účtem. Dynamická smyčka v `delete_user_data`
    // přes sloupec user_id ji proto mine — funkce má na to zvláštní větev
    // podle e-mailu, která se bez `target_email` vůbec nespustí. Řádek pak
    // přežil smazání účtu a hlídka `registrations_viselec` hlásila smazané
    // účty jako spadlé registrace (16 falešných záznamů, 7. 9. 2026).
    //
    // Je to ZÁMĚRNÉ smazání v aplikační vrstvě, NE kandidát na cizí klíč:
    // FK na auth.users na `registrations` z principu nepatří — rozbil by
    // legitimní stav „registrace uložena, účet ještě neexistuje".
    const { data: deleted, error: rpcErr } = await supabaseServer.rpc('delete_user_data', {
      target_user_id: userId,
      target_email: user.email ?? null,
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
