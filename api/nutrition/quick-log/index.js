/**
 * JÍDLO MIMO PLÁN.
 *
 * GET  /api/nutrition/quick-log?od=YYYY-MM-DD — zápisy od data (výchozí 7 dní)
 * POST /api/nutrition/quick-log               — { popis } NEBO { foto_base64 }
 *                                               → AI odhad kcal + maker, uložený
 *
 * BEZPEČNOST A NÁKLADY
 * - `user_id` výhradně ze session, nikdy z těla (stejně jako coach-chat).
 * - Tabulka se čte i zapisuje klientem uživatele — RLS platí, i kdyby se ve
 *   filtru udělala chyba. Bucket jen service klíčem (private).
 * - Denní limit 20 zápisů a denní rozpočet OpenAI PŘED voláním modelu.
 * - Model jen přes `volejModel()` (lib/openai.js) — účtenka v `ai_runs`
 *   s purpose `quick_food_log` jako u všeho ostatního.
 * - Odpověď modelu se validuje (`rozeberOdhadAI`) — nesmysl se neuloží.
 *
 * Handler se skládá z vyměnitelných závislostí (`vytvorHandler`), ať jde
 * otestovat celý tok s atrapou modelu: lib/__tests__/quickFoodLogEndpoint.test.mjs.
 */
import { supabaseServer } from '../../../lib/supabaseServer.js';
import { createSupabaseUserClient } from '../../../lib/supabaseUserClient.js';
import { requireActiveMembership } from '../../../lib/membershipHelpers.js';
import { assertOpenAIDailyBudget, volejModel } from '../../../lib/openai.js';
import {
  DENNI_LIMIT_ZAPISU,
  HLASKA_NEROZPOZNANO,
  MODEL_QUICK_LOG,
  PURPOSE_QUICK_LOG,
  TIMEOUT_MODELU_MS,
  denPraha,
  jeNadDennimLimitem,
  nahrajFotkuJidla,
  overVstup,
  podepsaneUrl,
  rozeberOdhadAI,
  sestavZpravy,
  smazFotkuJidla,
  zacatekDnePraha,
} from '../../../lib/quickFoodLog.js';

export const SLOUPCE = 'id, zdroj, popis, photo_storage_path, kcal, protein_g, carbs_g, fat_g, ai_confidence, upraveno_uzivatelem, plan_day, created_at';

async function overUzivatele(req) {
  const auth = req.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Authorization required', status: 401 };

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return { error: 'Invalid or expired token', status: 401 };
  return { user, token };
}

/** Skutečné závislosti. Test si podstrčí vlastní. */
export const vychoziZavislosti = {
  overUzivatele,
  clenstvi: requireActiveMembership,
  rozpocet: () => assertOpenAIDailyBudget('interaktivni'),
  volejModel,
  nahrajFotku: nahrajFotkuJidla,
  smazFotku: smazFotkuJidla,
  podepsaneUrl,
  uloziste: (token) => {
    const db = createSupabaseUserClient(token);
    return {
      async pocetDnes(userId) {
        const { count, error } = await db
          .from('quick_food_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', zacatekDnePraha());
        return error ? null : count;
      },
      async vloz(radek) {
        return db.from('quick_food_logs').insert(radek).select(SLOUPCE).single();
      },
      async seznam(userId, od) {
        return db
          .from('quick_food_logs')
          .select(SLOUPCE)
          .eq('user_id', userId)
          .gte('plan_day', od)
          .order('created_at', { ascending: true })
          .limit(200);
      },
    };
  },
};

function vcera(dnu) {
  return denPraha(new Date(Date.now() - dnu * 24 * 60 * 60 * 1000));
}

export function vytvorHandler(zavislosti = vychoziZavislosti) {
  const z = { ...vychoziZavislosti, ...zavislosti };

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await z.overUzivatele(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { user, token } = auth;
    const uloziste = z.uloziste(token);

    if (req.method === 'GET') {
      const od = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.od || '')) ? req.query.od : vcera(6);
      const { data, error } = await uloziste.seznam(user.id, od);
      if (error) {
        console.error('[quick-log] GET', user.id, error.message);
        return res.status(500).json({ error: 'Zápisy mimo plán se nepodařilo načíst.' });
      }
      const urls = await z.podepsaneUrl((data || []).map((r) => r.photo_storage_path));
      return res.status(200).json({
        zapisy: (data || []).map((r) => ({ ...r, foto_url: urls[r.photo_storage_path] ?? null })),
      });
    }

    // POST
    const clenstvi = await z.clenstvi(user.id);
    if (!clenstvi.allowed) return res.status(clenstvi.status || 403).json({ error: clenstvi.error });

    const vstup = overVstup(req.body);
    if (!vstup.ok) return res.status(400).json({ error: vstup.chyba });

    const pocet = await uloziste.pocetDnes(user.id);
    if (jeNadDennimLimitem(pocet)) {
      return res.status(429).json({
        error: `Na dnešek máš vyčerpaný limit ${DENNI_LIMIT_ZAPISU} zápisů mimo plán. Zkus to zítra.`,
      });
    }

    // Brzda rozpočtu PŘED nahráním fotky i voláním modelu — při vyčerpaném
    // rozpočtu nemá smysl ani ukládat soubor.
    const stav = await z.rozpocet();
    if (!stav.allowed) {
      console.error('[quick-log] rozpocet vycerpan', user.id);
      return res.status(503).json({ error: 'Odhad z fotky je na dnešek nedostupný. Zkus to zítra, nebo zadej hodnoty ručně.' });
    }

    // Fotka jde do bucketu PŘED voláním AI — cesta se uloží do řádku.
    let cestaFotky = null;
    let dataUrlProAI = null;
    if (vstup.zdroj === 'foto') {
      try {
        const nahrano = await z.nahrajFotku(vstup.foto, user.id);
        cestaFotky = nahrano.cesta;
        dataUrlProAI = nahrano.dataUrlProAI;
      } catch (err) {
        console.error('[quick-log] nahrani fotky', user.id, err?.message || err);
        return res.status(err?.statusCode || 500).json({
          error: err?.statusCode ? err.message : 'Fotku se nepodařilo uložit, zkus to prosím znovu.',
        });
      }
    }

    // Selhání po nahrání fotky ji uklidí — bez řádku by na ni nevedlo nic.
    const selhani = async (status, error, duvod) => {
      console.error('[quick-log]', duvod, user.id);
      if (cestaFotky) await z.smazFotku(cestaFotky);
      return res.status(status).json({ error });
    };

    let obsah;
    try {
      const odpoved = await z.volejModel(
        {
          purpose: PURPOSE_QUICK_LOG,
          model: MODEL_QUICK_LOG,
          temperature: 0.2,
          max_tokens: 200,
          response_format: { type: 'json_object' },
          messages: sestavZpravy({ ...vstup, dataUrlProAI }),
        },
        { timeout: TIMEOUT_MODELU_MS, maxRetries: 0 },
      );
      obsah = odpoved?.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      if (err?.code === 'AI_BUDGET_REACHED' || /budget/i.test(String(err?.message || ''))) {
        return selhani(503, 'Odhad z fotky je na dnešek nedostupný. Zkus to zítra, nebo zadej hodnoty ručně.', 'rozpocet (volejModel)');
      }
      const timeout = err?.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(String(err?.message || ''));
      if (timeout) {
        return selhani(504, 'Odhad trvá moc dlouho. Zkus to prosím znovu nebo zadej ručně.', 'timeout modelu');
      }
      return selhani(502, HLASKA_NEROZPOZNANO, `model selhal: ${err?.status || err?.name || 'neznamo'}`);
    }

    const rozbor = rozeberOdhadAI(obsah);
    if (!rozbor.ok) {
      if (rozbor.duvod === 'nejde_o_jidlo') {
        return selhani(422, 'Na fotce jsme jídlo nepoznali. Zkus jinou fotku nebo napiš, co jsi snědl/a.', 'nejde o jidlo');
      }
      return selhani(502, HLASKA_NEROZPOZNANO, `neplatna odpoved modelu: ${rozbor.duvod}`);
    }
    const { odhad } = rozbor;

    const { data: zapis, error: chybaZapisu } = await uloziste.vloz({
      user_id: user.id,
      zdroj: vstup.zdroj,
      // U textu zůstává to, co napsal uživatel; u fotky popis od modelu.
      popis: vstup.zdroj === 'text' ? vstup.popis : (odhad.popis || null),
      photo_storage_path: cestaFotky,
      kcal: odhad.kcal,
      protein_g: odhad.protein_g,
      carbs_g: odhad.carbs_g,
      fat_g: odhad.fat_g,
      ai_confidence: odhad.confidence,
      plan_day: denPraha(),
    });

    if (chybaZapisu || !zapis) {
      return selhani(500, 'Zápis se nepodařilo uložit, zkus to prosím znovu.', `insert: ${chybaZapisu?.message || 'bez radku'}`);
    }

    const urls = cestaFotky ? await z.podepsaneUrl([cestaFotky]) : {};
    return res.status(201).json({ zapis: { ...zapis, foto_url: urls[cestaFotky] ?? null } });
  };
}

export default vytvorHandler();
