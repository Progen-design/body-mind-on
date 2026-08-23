/**
 * CHAT S TEDEM.
 *
 * GET    /api/coach-chat        — historie konverzace
 * POST   /api/coach-chat        — { otazka, kontext? } → odpověď TEDa
 * DELETE /api/coach-chat        — smazat konverzaci
 *
 * BEZPEČNOST
 * - `user_id` se bere ze session, nikdy z těla požadavku. Kdyby šlo poslat
 *   cizí id, dal by se přes chat vytáhnout cizí zdravotní profil.
 * - Čtení a zápis historie jde přes klienta uživatele, takže platí RLS
 *   i kdyby se ve filtru někdy udělala chyba.
 * - Denní strop zpráv chrání rozpočet a UI před smyčkou.
 */
import { supabaseServer } from '../lib/supabaseServer.js';
import { createSupabaseUserClient } from '../lib/supabaseUserClient.js';
import { requireActiveMembership } from '../lib/membershipHelpers.js';
import { runAgent } from '../lib/runAgent.js';
import { namerenaData } from '../lib/coachChatKontext.js';
import {
  DENNI_LIMIT_ZPRAV,
  HISTORIE_DO_KONTEXTU,
  SLUG_CHATU,
  historieProKontext,
  odpovedZAgenta,
  overKontext,
  overOtazku,
} from '../lib/coachChat.js';

const HISTORIE_DO_UI = 50;

async function requireUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Authorization required', status: 401 };

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return { error: 'Invalid or expired token', status: 401 };
  return { user, token };
}

/** Půlnoc v Praze jako ISO — strop se počítá na kalendářní den uživatele. */
function zacatekDnePraha() {
  const dnes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return `${dnes}T00:00:00`;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await requireUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { user, token } = auth;
    const db = createSupabaseUserClient(token);

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('coach_chat_messages')
        .select('id, role, obsah, kontext, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(HISTORIE_DO_UI);

      if (error) {
        console.error('[coach-chat] GET:', error.message);
        return res.status(500).json({ error: 'Historii se nepodařilo načíst.' });
      }
      return res.status(200).json({ zpravy: (data || []).reverse() });
    }

    if (req.method === 'DELETE') {
      const { error } = await db
        .from('coach_chat_messages')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('[coach-chat] DELETE:', error.message);
        return res.status(500).json({ error: 'Konverzaci se nepodařilo smazat.' });
      }
      return res.status(200).json({ ok: true });
    }

    // POST
    const clenstvi = await requireActiveMembership(user.id);
    if (!clenstvi.allowed) {
      return res.status(clenstvi.status || 403).json({ error: clenstvi.error });
    }

    const kontrola = overOtazku(req.body?.otazka);
    if (!kontrola.ok) return res.status(400).json({ error: kontrola.chyba });
    const { otazka } = kontrola;
    const kotva = overKontext(req.body?.kontext);

    // Denní strop. Počítají se jen zprávy uživatele, ne odpovědi TEDa.
    const { count, error: chybaPoctu } = await db
      .from('coach_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', zacatekDnePraha());

    if (!chybaPoctu && typeof count === 'number' && count >= DENNI_LIMIT_ZPRAV) {
      return res.status(429).json({
        error: `Na dnešek máš vyčerpaný limit ${DENNI_LIMIT_ZPRAV} zpráv. Zkus to zítra.`,
      });
    }

    // Historie pro kontext se bere PŘED zapsáním nové otázky — ta jde do
    // promptu zvlášť jako aktuální dotaz.
    const { data: historieRaw } = await db
      .from('coach_chat_messages')
      .select('role, obsah')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORIE_DO_KONTEXTU);

    const historie = historieProKontext((historieRaw || []).reverse());

    let mereni = {};
    try {
      mereni = await namerenaData(user.id);
    } catch (err) {
      // Bez naměřených dat TED odpoví, že je nevidí. To je správně —
      // horší by bylo, kdyby si je domyslel.
      console.error('[coach-chat] namerena data:', err?.message || err);
    }

    let vysledek;
    try {
      vysledek = await runAgent(SLUG_CHATU, {
        userId: user.id,
        input: {
          prompt: otazka,
          task_type: 'coach_chat',
          kontext: kotva,
          historie,
          namerena_data: mereni,
        },
        taskType: 'coach_chat',
      });
    } catch (err) {
      const zprava = String(err?.message || '');
      // Vyčerpaný denní rozpočet není chyba uživatele a nemá vypadat jako pád.
      if (/budget/i.test(zprava)) {
        return res.status(503).json({
          error: 'TED má na dnešek vyčerpaný limit. Zkus to prosím zítra.',
        });
      }
      console.error('[coach-chat] runAgent:', zprava);
      return res.status(502).json({ error: 'TEDovi se teď nedaří odpovědět. Zkus to za chvíli.' });
    }

    const odpoved = odpovedZAgenta(vysledek);
    if (!odpoved) {
      console.error('[coach-chat] prazdna odpoved agenta');
      return res.status(502).json({ error: 'TEDovi se teď nedaří odpovědět. Zkus to za chvíli.' });
    }

    // Zapisuje se až teď, obojí najednou. Kdyby se uložila otázka a odpověď
    // spadla, zůstala by v historii viset otázka bez odpovědi.
    const { data: ulozene, error: chybaZapisu } = await db
      .from('coach_chat_messages')
      .insert([
        { user_id: user.id, role: 'user', obsah: otazka, kontext: kotva },
        { user_id: user.id, role: 'ted', obsah: odpoved, kontext: null },
      ])
      .select('id, role, obsah, kontext, created_at');

    if (chybaZapisu) {
      // Odpověď uživatel dostane i tak — jen se neuloží do historie.
      console.error('[coach-chat] zapis:', chybaZapisu.message);
      return res.status(200).json({ odpoved, ulozeno: false });
    }

    return res.status(200).json({
      odpoved,
      ulozeno: true,
      zpravy: (ulozene || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    });
  } catch (err) {
    console.error('[coach-chat] error:', err?.message || err);
    return res.status(500).json({ error: 'Něco se pokazilo.' });
  }
}
