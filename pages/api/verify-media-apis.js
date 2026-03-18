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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }

  const result = {
    spoonacular: { configured: false, working: false, error: null },
    exercisedb: { configured: false, working: false, error: null },
    exercisedb_dev: { working: false, error: null },
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

  const EXERCISEDB_USE_DEV_ONLY =
    process.env.EXERCISEDB_USE_DEV_ONLY === 'true' || process.env.EXERCISEDB_USE_DEV_ONLY === '1';

  // ExerciseDB (RapidAPI / exercisedb.dev fallback v projektu)
  const hasExerciseDb = Boolean(EXERCISEDB_KEY && EXERCISEDB_HOST) && !EXERCISEDB_USE_DEV_ONLY;
  result.exercisedb.configured = Boolean(EXERCISEDB_KEY && EXERCISEDB_HOST);

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
  } else if (EXERCISEDB_USE_DEV_ONLY) {
    result.exercisedb.error = 'Přeskočeno (EXERCISEDB_USE_DEV_ONLY=true, používá se exercisedb.dev)';
  } else {
    result.exercisedb.error = 'EXERCISEDB_API_KEY/RAPIDAPI_KEY nebo EXERCISEDB_API_HOST chybí';
  }

  // exercisedb.dev – zdarma, fallback když RapidAPI vrací 429
  try {
    const devResp = await fetch(
      'https://www.exercisedb.dev/api/v1/exercises/search?q=squat&limit=1',
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const devData = await devResp.json();
    const devList = devData?.data;
    result.exercisedb_dev.working =
      devResp.ok && Array.isArray(devList) && devList.length > 0 && devList[0]?.gifUrl;
    if (!result.exercisedb_dev.working) {
      result.exercisedb_dev.error = devResp.ok ? 'Žádné výsledky' : `HTTP ${devResp.status}`;
    }
  } catch (e) {
    result.exercisedb_dev.error = e?.message || 'Chyba volání';
  }

  const cvikyOk = result.exercisedb.working || result.exercisedb_dev.working;
  const summary = {
    jidla_ok: result.spoonacular.working,
    cviky_ok: cvikyOk,
    cviky_zdroj: result.exercisedb.working ? 'RapidAPI' : result.exercisedb_dev.working ? 'exercisedb.dev (zdarma)' : null,
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
