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
import { isCronAuthorized } from '../../../lib/adminAuth';
import { runRecipeGenerator } from '../../../lib/recipeGeneratorRun';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const startedAt = new Date().toISOString();

  try {
    const vysledek = await runRecipeGenerator({ dryRun: false });

    console.log(JSON.stringify({
      source: 'cron/generate-recipes',
      event: vysledek.skipped ? 'skipped' : 'done',
      started_at: startedAt,
      reason: vysledek.reason ?? null,
      zapsano: vysledek.zapsano ?? 0,
      zahozeno: vysledek.zahozeno?.length ?? 0,
      duvody_zahozeni: (vysledek.zahozeno || []).map((z) => z.duvod),
      cena_usd: vysledek.cena_usd ?? 0,
      chyby: vysledek.chyby ?? [],
    }));

    return res.status(200).json({ ok: true, started_at: startedAt, ...vysledek });
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
