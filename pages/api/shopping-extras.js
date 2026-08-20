// /pages/api/shopping-extras.js – ručně dopsané položky nákupního seznamu
//
// Prostý text vázaný k plánu. Nic se z něj neparsuje ani nemapuje na suroviny
// katalogu — normalizace by tiše měnila, co si uživatel napsal.
import { supabaseServer } from '../../lib/supabaseServer';
import { overPolozkuNakupu } from '../../lib/profile/vlastniJidlo.js';

const SLOUPCE = 'id, plan_id, polozka, created_at';

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });
    const userId = user.id;

    if (req.method === 'GET') {
      const planId = typeof req.query.plan_id === 'string' ? req.query.plan_id : null;
      let q = supabaseServer.from('user_shopping_extras').select(SLOUPCE).eq('user_id', userId);
      if (planId) q = q.eq('plan_id', planId);
      const { data, error } = await q.order('created_at', { ascending: true }).limit(200);

      if (error) {
        console.error('[shopping-extras] GET error:', error);
        return res.status(500).json({ error: 'Nepodařilo se načíst položky.' });
      }
      return res.status(200).json({ items: data || [] });
    }

    if (req.method === 'POST') {
      const kontrola = overPolozkuNakupu(req.body?.polozka);
      if (!kontrola.ok) return res.status(400).json({ error: kontrola.chyba });

      const planId = typeof req.body?.plan_id === 'string' && req.body.plan_id ? req.body.plan_id : null;

      const { data, error } = await supabaseServer
        .from('user_shopping_extras')
        .insert({ user_id: userId, plan_id: planId, polozka: kontrola.hodnota })
        .select(SLOUPCE)
        .single();

      if (error) {
        console.error('[shopping-extras] INSERT error:', error);
        return res.status(500).json({ error: 'Nepodařilo se uložit položku.' });
      }
      return res.status(201).json({ item: data });
    }

    // DELETE
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) return res.status(400).json({ error: 'Chybí id.' });

    const { error: delErr } = await supabaseServer
      .from('user_shopping_extras')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);

    if (delErr) {
      console.error('[shopping-extras] DELETE error:', delErr);
      return res.status(500).json({ error: 'Nepodařilo se smazat položku.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[shopping-extras] ERROR:', err);
    return res.status(500).json({ error: err.message || 'Chyba serveru' });
  }
}
