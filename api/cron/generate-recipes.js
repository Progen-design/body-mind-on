// GET/POST /api/cron/generate-recipes — denní doplňování katalogu (CRON_SECRET)
//
// Uzavírá smyčku, která do teď potřebovala člověka:
//
//   skladač nenajde kandidáta  →  objednejZNizkeNabidky / objednejZNevyresenehoSlotu
//   →  řádek v recipe_generation_queue  →  TENHLE CRON  →  nový recept v katalogu
//
// Fronta se tedy plní sama z reálné poptávky — z toho, co plánovači při skládání
// jídelníčků skutečně chybělo. Tenhle cron ji jen jednou denně vybere.
//
// Bezpečnost obsahu neřeší tahle route, ale brány pod ní: nutrice se počítá ze
// surovin (jinak se recept nezapíše), kalorické pásmo slotu, Atwater, počet
// hlavních surovin a shoda dietních tagů se surovinami. Ruční schvalování bylo
// záměrně zrušeno — kontrola, kterou dělá člověk u každého receptu, funguje
// prvních dvacet kusů a pak přestane.
//
// Strop na běh i na den drží runRecipeGenerator (RECIPE_GEN_MAX_PER_RUN /
// _PER_DAY), takže tenhle cron nemůže utéct v nákladech ani při plné frontě.
import { isCronAuthorized } from '../../lib/adminAuth.js';
import { runRecipeGenerator } from '../../lib/recipeGeneratorRun.js';
import { supabaseServer } from '../../lib/supabaseServer.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const startedAt = new Date().toISOString();

  try {
    // Nejdřív se fronta doplní z nasbírané poptávky, teprve pak se generuje.
    //
    // Je to schválně tady a ne v samostatném cronu: fronta je pak svěží právě
    // ve chvíli, kdy si z ní generátor bere, a je to jedno místo, kam se
    // podívat, když smyčka nejede. Selhání plnění NESHODÍ generování — fronta
    // má i seedy a starší objednávky, ze kterých se dá brát.
    let naplneno = null;
    let naplneniError = null;
    try {
      const { data, error } = await supabaseServer.rpc('fill_recipe_queue_from_demand', {
        p_okno_dni: 7,
        p_limit: 3,
      });
      if (error) throw new Error(error.message);
      naplneno = data;
    } catch (err) {
      naplneniError = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({
        source: 'cron/generate-recipes',
        event: 'fill_error',
        started_at: startedAt,
        error: naplneniError,
      }));
    }

    const vysledek = await runRecipeGenerator({ dryRun: false });

    console.log(JSON.stringify({
      source: 'cron/generate-recipes',
      event: vysledek.skipped ? 'skipped' : 'done',
      started_at: startedAt,
      fronta_zalozeno: naplneno?.zalozeno ?? 0,
      fronta_kandidatu_na_dire: naplneno?.kandidatu_na_dire ?? null,
      fronta_error: naplneniError,
      reason: vysledek.reason ?? null,
      zapsano: vysledek.zapsano ?? 0,
      zahozeno: vysledek.zahozeno?.length ?? 0,
      duvody_zahozeni: (vysledek.zahozeno || []).map((z) => z.duvod),
      cena_usd: vysledek.cena_usd ?? 0,
      chyby: vysledek.chyby ?? [],
    }));

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
      fronta: naplneno ?? { error: naplneniError },
      ...vysledek,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      source: 'cron/generate-recipes',
      event: 'error',
      started_at: startedAt,
      error: msg,
    }));
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
