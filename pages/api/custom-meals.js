// /pages/api/custom-meals.js – vlastní jídla uživatele (GET seznam, POST přidat, DELETE smazat)
//
// Vlastní jídlo nemá ověřenou nutrici. Endpoint proto NIKDY nedopočítává kalorie
// ani makra — co uživatel nevyplnil, uloží se jako NULL a klient takové jídlo
// do denních součtů nezapočítá (viz lib/profile/vlastniJidlo.js).
import { supabaseServer } from '../../lib/supabaseServer';
import { overVlastniJidlo } from '../../lib/profile/vlastniJidlo.js';

const SLOUPCE = 'id, local_date, meal_type, title, kcal_rucne, protein_g, carbs_g, fat_g, created_at';

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
      // Bez `from`/`to` se vrací posledních 14 dní — profil zobrazuje jeden týden
      // a načítat celou historii kvůli jednomu dni nemá smysl.
      const from = typeof req.query.from === 'string' ? req.query.from : null;
      const to = typeof req.query.to === 'string' ? req.query.to : null;

      let q = supabaseServer.from('user_custom_meals').select(SLOUPCE).eq('user_id', userId);
      if (from) q = q.gte('local_date', from);
      if (to) q = q.lte('local_date', to);
      const { data, error } = await q.order('local_date', { ascending: false }).limit(200);

      if (error) {
        console.error('[custom-meals] GET error:', error);
        return res.status(500).json({ error: 'Nepodařilo se načíst vlastní jídla.' });
      }
      return res.status(200).json({ meals: data || [] });
    }

    if (req.method === 'POST') {
      const kontrola = overVlastniJidlo(req.body || {});
      if (!kontrola.ok) return res.status(400).json({ error: kontrola.chyba });

      const planId = typeof req.body?.plan_id === 'string' && req.body.plan_id ? req.body.plan_id : null;

      const { data, error } = await supabaseServer
        .from('user_custom_meals')
        .insert({ user_id: userId, plan_id: planId, ...kontrola.hodnota })
        .select(SLOUPCE)
        .single();

      if (error) {
        console.error('[custom-meals] INSERT error:', error);
        return res.status(500).json({ error: 'Nepodařilo se uložit jídlo.' });
      }
      return res.status(201).json({ meal: data });
    }

    // DELETE
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) return res.status(400).json({ error: 'Chybí id.' });

    const { error: delErr } = await supabaseServer
      .from('user_custom_meals')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);

    if (delErr) {
      console.error('[custom-meals] DELETE error:', delErr);
      return res.status(500).json({ error: 'Nepodařilo se smazat jídlo.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[custom-meals] ERROR:', err);
    return res.status(500).json({ error: err.message || 'Chyba serveru' });
  }
}
