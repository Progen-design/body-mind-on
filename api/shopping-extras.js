// Vlastni polozky nakupniho seznamu. Odvozena cast seznamu se pocita
// z jidelnicku, tady jsou jen veci, ktere si uzivatel dopsal sam.
import { supabaseServer } from '../lib/supabaseServer.js';

const KATEGORIE = [
  'Maso & Ryby',
  'Mléčné výrobky & Vejce',
  'Přílohy & Pečivo',
  'Zelenina & Ovoce',
  'Ořechy, Tuky & Ostatní'
];

async function uzivatel(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export default async function handler(req, res) {
  const user = await uzivatel(req);
  if (!user) return res.status(401).json({ error: 'Nejste přihlášen' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseServer
        .from('user_shopping_extras')
        .select('id, name, amount, category, checked')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return res.status(200).json({ items: data ?? [] });
    }

    if (req.method === 'POST') {
      const telo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = String(telo.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Název položky je povinný.' });
      if (name.length > 120) return res.status(400).json({ error: 'Název je příliš dlouhý.' });

      const category = KATEGORIE.includes(telo.category) ? telo.category : KATEGORIE[4];
      const amount = String(telo.amount || '').trim().slice(0, 60) || null;

      const { data, error } = await supabaseServer
        .from('user_shopping_extras')
        .insert({ user_id: user.id, name, amount, category })
        .select('id, name, amount, category, checked')
        .single();
      if (error) throw new Error(error.message);
      return res.status(201).json({ item: data });
    }

    if (req.method === 'PATCH') {
      const telo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = String(telo.id || '');
      if (!id) return res.status(400).json({ error: 'Chybí id položky.' });

      const { error } = await supabaseServer
        .from('user_shopping_extras')
        .update({ checked: telo.checked === true })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '');
      if (!id) return res.status(400).json({ error: 'Chybí id položky.' });
      const { error } = await supabaseServer
        .from('user_shopping_extras')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[shopping-extras] error');
    return res.status(500).json({ error: err?.message || 'Chyba serveru' });
  }
}
