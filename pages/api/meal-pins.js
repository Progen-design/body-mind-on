// /pages/api/meal-pins.js – GET načtení pinů, POST add/remove
import { supabaseServer } from '../../lib/supabaseServer';

const MAX_MEAL_TEXT_LEN = 200;

function normalizeMealText(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (s.length > MAX_MEAL_TEXT_LEN) s = s.slice(0, MAX_MEAL_TEXT_LEN);
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
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
      const { data: rows, error } = await supabaseServer
        .from('user_meal_pins')
        .select('meal_type, meal_text')
        .eq('user_id', userId);

      if (error) {
        console.error('[meal-pins] GET error:', error);
        return res.status(500).json({ error: 'Nepodařilo načíst piny.' });
      }
      return res.status(200).json({ pins: rows || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const action = b.action;
      const mealType = (b.meal_type || '').trim();
      const mealTextRaw = (b.meal_text || '').trim();

      if (!action || !mealType || !mealTextRaw) {
        return res.status(400).json({ error: 'Chybí action, meal_type nebo meal_text.' });
      }
      if (action !== 'add' && action !== 'remove') {
        return res.status(400).json({ error: 'action musí být add nebo remove.' });
      }

      const mealTextNorm = normalizeMealText(mealTextRaw);
      if (!mealTextNorm) {
        return res.status(400).json({ error: 'meal_text je prázdný po normalizaci.' });
      }

      if (action === 'add') {
        const { error: insErr } = await supabaseServer
          .from('user_meal_pins')
          .upsert(
            { user_id: userId, meal_type: mealType, meal_text: mealTextNorm },
            { onConflict: 'user_id,meal_type,meal_text', ignoreDuplicates: true }
          );

        if (insErr && insErr.code !== '23505') {
          console.error('[meal-pins] INSERT error:', insErr);
          return res.status(500).json({ error: 'Nepodařilo přidat pin.' });
        }
      } else {
        const { error: delErr } = await supabaseServer
          .from('user_meal_pins')
          .delete()
          .eq('user_id', userId)
          .eq('meal_type', mealType)
          .eq('meal_text', mealTextNorm);

        if (delErr) {
          console.error('[meal-pins] DELETE error:', delErr);
          return res.status(500).json({ error: 'Nepodařilo odebrat pin.' });
        }
      }

      const { data: pins } = await supabaseServer
        .from('user_meal_pins')
        .select('meal_type, meal_text')
        .eq('user_id', userId);

      return res.status(200).json({ ok: true, pins: pins || [] });
    }
  } catch (err) {
    console.error('[meal-pins] ERROR:', err);
    return res.status(500).json({ error: err.message || 'Chyba serveru' });
  }
}
