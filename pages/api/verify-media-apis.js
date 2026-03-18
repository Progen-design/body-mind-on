/**
 * GET /api/verify-media-apis
 * Ověří, zda jsou Spoonacular (jídla) a wger.de (cviky) dostupné.
 * Spoonacular vyžaduje SPOONACULAR_API_KEY. wger.de je veřejné API bez klíče.
 */
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }

  const result = {
    spoonacular: { configured: false, working: false, error: null },
    wger: { configured: true, working: false, error: null },
  };

  // Spoonacular (jídla, recepty)
  const hasSpoonacular = Boolean(SPOONACULAR_KEY);
  result.spoonacular.configured = hasSpoonacular;

  if (hasSpoonacular) {
    try {
      const url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&query=chicken%20breast&number=1`;
      const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      const data = await resp.json();
      result.spoonacular.working = resp.ok && Array.isArray(data?.results) && data.results.length > 0;
      if (!result.spoonacular.working) {
        result.spoonacular.error = data?.message || (resp.ok ? 'Žádné výsledky' : `HTTP ${resp.status}`);
      }
    } catch (e) {
      result.spoonacular.error = e?.message || 'Chyba volání';
    }
  } else {
    result.spoonacular.error = 'SPOONACULAR_API_KEY chybí';
  }

  // wger.de (cviky) – veřejné API, bez klíče
  try {
    const wgerResp = await fetch(
      'https://wger.de/api/v2/exercise-translation/?search=squat&language=2&limit=1',
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const wgerData = await wgerResp.json();
    const wgerResults = wgerData?.results;
    result.wger.working =
      wgerResp.ok && Array.isArray(wgerResults) && wgerResults.length > 0 && wgerResults[0]?.exercise;
    if (!result.wger.working) {
      result.wger.error = wgerResp.ok ? 'Žádné výsledky' : `HTTP ${wgerResp.status}`;
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
