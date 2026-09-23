/**
 * OPRAVA A ZAHOZENÍ ZÁPISU MIMO PLÁN.
 *
 * PATCH  /api/nutrition/quick-log/[id] — { kcal?, protein_g?, carbs_g?, fat_g?, popis? }
 *        Uživatel přepíše AI odhad → `upraveno_uzivatelem = true`. Jen do
 *        30 minut od vytvoření (OKNO_OPRAVY_MIN; RLS politika hlídá totéž).
 * DELETE /api/nutrition/quick-log/[id] — „Zahodit": smaže řádek i fotku.
 *
 * VLASTNICTVÍ: UPDATE i DELETE mají `.eq('user_id', user.id)` přímo ve
 * stejném dotazu jako `.eq('id', …)` — stejně jako api/plan/exercise-variant.js.
 * Cizí záznam se nikdy nezmění a končí 404, ne 200.
 */
import { supabaseServer } from '../../../lib/supabaseServer.js';
import { createSupabaseUserClient } from '../../../lib/supabaseUserClient.js';
import { jeVOknuOpravy, overOpravu, smazFotkuJidla, OKNO_OPRAVY_MIN } from '../../../lib/quickFoodLog.js';

const SLOUPCE = 'id, zdroj, popis, photo_storage_path, kcal, protein_g, carbs_g, fat_g, ai_confidence, upraveno_uzivatelem, plan_day, created_at';

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authorization required' });

  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const id = String(req.query?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Chybí id zápisu.' });

  const db = createSupabaseUserClient(token);

  const { data: radek, error: cteniErr } = await db
    .from('quick_food_logs')
    .select('id, photo_storage_path, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (cteniErr) {
    console.error('[quick-log] cteni', user.id, cteniErr.message);
    return res.status(500).json({ error: 'Zápis se nepodařilo načíst.' });
  }
  if (!radek) return res.status(404).json({ error: 'Zápis nenalezen.' });

  if (req.method === 'DELETE') {
    const { error: mazaniErr } = await db
      .from('quick_food_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (mazaniErr) {
      console.error('[quick-log] DELETE', user.id, mazaniErr.message);
      return res.status(500).json({ error: 'Zápis se nepodařilo smazat.' });
    }
    await smazFotkuJidla(radek.photo_storage_path);
    return res.status(200).json({ ok: true });
  }

  // PATCH
  if (!jeVOknuOpravy(radek.created_at)) {
    return res.status(409).json({ error: `Odhad jde opravit jen ${OKNO_OPRAVY_MIN} minut po zápisu.` });
  }

  const oprava = overOpravu(req.body);
  if (!oprava.ok) return res.status(400).json({ error: oprava.chyba });

  const { data: upraveny, error: updateErr } = await db
    .from('quick_food_logs')
    .update({ ...oprava.zmena, upraveno_uzivatelem: true })
    .eq('id', id)
    .eq('user_id', user.id)
    .select(SLOUPCE)
    .maybeSingle();

  if (updateErr) {
    console.error('[quick-log] PATCH', user.id, updateErr.message);
    return res.status(500).json({ error: 'Opravu se nepodařilo uložit.' });
  }
  if (!upraveny) return res.status(404).json({ error: 'Zápis nenalezen.' });

  return res.status(200).json({ zapis: upraveny });
}
