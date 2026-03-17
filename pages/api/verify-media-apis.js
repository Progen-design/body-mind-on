/**
 * GET /api/verify-media-apis
 * Ověří, zda jsou Spoonacular a ExerciseDB nakonfigurovány a fungují.
 * Vrací stav bez odhalení klíčů.
 */
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_SPOONACULAR_HOST =
  process.env.RAPIDAPI_SPOONACULAR_HOST || 'spoonacular-recipe-food-nutrition-v1.p.rapidapi.com';
const EXERCISEDB_KEY = process.env.EXERCISEDB_API_KEY || process.env.RAPIDAPI_KEY || '';
const EXERCISEDB_HOST = (process.env.EXERCISEDB_API_HOST || 'exercisedb.p.rapidapi.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }

  const result = {
    spoonacular: { configured: false, working: false, error: null },
    exercisedb: { configured: false, working: false, error: null },
    pexels: { configured: false },
  };

  // Spoonacular
  const hasSpoonacular = Boolean(SPOONACULAR_KEY || RAPIDAPI_KEY);
  result.spoonacular.configured = hasSpoonacular;

  if (hasSpoonacular) {
    try {
      let url, headers = { Accept: 'application/json' };
      if (SPOONACULAR_KEY) {
        url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&query=chicken%20breast&number=1`;
      } else {
        const host = RAPIDAPI_SPOONACULAR_HOST.replace(/^https?:\/\//, '');
        url = `https://${host}/recipes/complexSearch?query=chicken%20breast&number=1`;
        headers['X-RapidAPI-Key'] = RAPIDAPI_KEY;
        headers['X-RapidAPI-Host'] = host;
      }
      const resp = await fetch(url, { method: 'GET', headers });
      const data = await resp.json();
      result.spoonacular.working = resp.ok && Array.isArray(data?.results) && data.results.length > 0;
      if (!result.spoonacular.working) {
        result.spoonacular.error = data?.message || (resp.ok ? 'Žádné výsledky' : `HTTP ${resp.status}`);
      }
    } catch (e) {
      result.spoonacular.error = e?.message || 'Chyba volání';
    }
  } else {
    result.spoonacular.error = 'SPOONACULAR_API_KEY nebo RAPIDAPI_KEY chybí';
  }

  // ExerciseDB (RapidAPI / exercisedb.dev fallback v projektu)
  const hasExerciseDb = Boolean(EXERCISEDB_KEY && EXERCISEDB_HOST);
  result.exercisedb.configured = hasExerciseDb;

  if (hasExerciseDb) {
    try {
      const url = `https://${EXERCISEDB_HOST}/exercises/name/squat?limit=1`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': EXERCISEDB_KEY,
          'X-RapidAPI-Host': EXERCISEDB_HOST,
        },
      });
      const data = await resp.json();
      result.exercisedb.working = resp.ok && (Array.isArray(data) ? data.length > 0 : (data && typeof data === 'object'));
      if (!result.exercisedb.working) {
        result.exercisedb.error = resp.ok ? 'Žádné výsledky' : `HTTP ${resp.status}`;
      }
    } catch (e) {
      result.exercisedb.error = e?.message || 'Chyba volání';
    }
  } else {
    result.exercisedb.error = 'EXERCISEDB_API_KEY/RAPIDAPI_KEY nebo EXERCISEDB_API_HOST chybí';
  }

  result.pexels.configured = Boolean(PEXELS_KEY);

  const summary = {
    jidla_ok: result.spoonacular.working,
    cviky_ok: result.exercisedb.working,
    fallback_pexels: result.pexels.configured,
    duvod_nesouladu_jidel: !result.spoonacular.working
      ? 'Spoonacular nefunguje – zobrazují se jen Pexels (ilustrační, často nesedí)'
      : result.spoonacular.working && result.pexels.configured
        ? 'Spoonacular funguje. Nesoulad může být: 1) nízká confidence → Pexels fallback, 2) špatný překlad dotazu, 3) cache'
        : null,
  };

  return res.status(200).json({
    ok: true,
    apis: result,
    summary,
  });
}
