/**
 * GET /api/verify-media-apis
 * Ověří, zda jsou Spoonacular (jídla) a wger.de (cviky) dostupné.
 * Spoonacular vyžaduje SPOONACULAR_API_KEY. wger.de je veřejné API bez klíče.
 * wger: endpointy dle https://wger.de/api/v2/ (exercise-translation, exercise/search, exerciseimage).
 */
import { WGER_API_V2_BASE } from '../../lib/wgerApiConstants';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }

  const result = {
    spoonacular: { configured: false, working: false, complexSearch_ok: false, information_ok: false, error: null },
    wger: {
      configured: true,
      working: false,
      translation_ok: false,
      search_ok: false,
      exerciseimage_ok: false,
      error: null,
    },
  };

  // Spoonacular (jídla, recepty)
  const hasSpoonacular = Boolean(SPOONACULAR_KEY);
  result.spoonacular.configured = hasSpoonacular;

  if (hasSpoonacular) {
    try {
      const searchUrl = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&query=chicken%20breast&number=1&addRecipeInformation=true&addRecipeNutrition=true`;
      const resp = await fetch(searchUrl, { method: 'GET', headers: { Accept: 'application/json' } });
      const data = await resp.json();
      result.spoonacular.complexSearch_ok = Boolean(
        resp.ok && Array.isArray(data?.results) && data.results.length > 0
      );
      let infoOk = false;
      const rid = data?.results?.[0]?.id;
      if (result.spoonacular.complexSearch_ok && rid != null) {
        const infoUrl = `https://api.spoonacular.com/recipes/${encodeURIComponent(String(rid))}/information?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&includeNutrition=true`;
        const infoResp = await fetch(infoUrl, { method: 'GET', headers: { Accept: 'application/json' } });
        const infoData = await infoResp.json();
        const nutrients = infoData?.nutrition?.nutrients;
        infoOk = Boolean(
          infoResp.ok && infoData?.id != null && Array.isArray(nutrients) && nutrients.length > 0
        );
      }
      result.spoonacular.information_ok = infoOk;
      result.spoonacular.working = result.spoonacular.complexSearch_ok && result.spoonacular.information_ok;
      if (!result.spoonacular.complexSearch_ok) {
        result.spoonacular.error = data?.message || (resp.ok ? 'complexSearch: žádné výsledky' : `HTTP ${resp.status}`);
      } else if (!result.spoonacular.information_ok) {
        result.spoonacular.error = 'recipes/{id}/information nevrátilo výživu – zkontroluj klíč / kvótu';
      }
    } catch (e) {
      result.spoonacular.error = e?.message || 'Chyba volání';
    }
  } else {
    result.spoonacular.error = 'SPOONACULAR_API_KEY chybí';
  }

  // wger.de (cviky) – veřejné API, bez klíče
  try {
    const base = WGER_API_V2_BASE;

    const trResp = await fetch(
      `${base}/exercise-translation/?search=squat&language=2&limit=1`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const trData = await trResp.json();
    const trResults = trData?.results;
    result.wger.translation_ok = Boolean(
      trResp.ok && Array.isArray(trResults) && trResults.length > 0 && trResults[0]?.exercise != null
    );

    const searchResp = await fetch(
      `${base}/exercise/search/?term=bench&language=english&format=json`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const searchData = await searchResp.json();
    const baseId = searchData?.suggestions?.[0]?.data?.base_id;
    result.wger.search_ok = Boolean(
      searchResp.ok && baseId != null && Number.isFinite(Number(baseId))
    );

    let imgOk = false;
    if (result.wger.search_ok) {
      const imgResp = await fetch(
        `${base}/exerciseimage/?exercise=${encodeURIComponent(String(baseId))}&limit=1`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      );
      const imgData = await imgResp.json();
      imgOk = Boolean(
        imgResp.ok && Array.isArray(imgData?.results) && imgData.results.length > 0 && imgData.results[0]?.image
      );
    }
    result.wger.exerciseimage_ok = imgOk;

    result.wger.working = result.wger.translation_ok && result.wger.search_ok;
    if (!result.wger.working) {
      const parts = [];
      if (!result.wger.translation_ok) parts.push('exercise-translation');
      if (!result.wger.search_ok) parts.push('exercise/search');
      result.wger.error = parts.length ? `Selhalo: ${parts.join(', ')}` : null;
    }
  } catch (e) {
    result.wger.error = e?.message || 'Chyba volání';
  }

  const summary = {
    jidla_ok: result.spoonacular.working,
    cviky_ok: result.wger.working,
    cviky_zdroj: result.wger.working ? 'wger.de' : null,
    duvod_nesouladu_jidel: !result.spoonacular.working
      ? 'Spoonacular nefunguje – obrázky jídel budou prázdné'
      : null,
  };

  return res.status(200).json({
    ok: true,
    apis: result,
    summary,
  });
}
