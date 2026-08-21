/**
 * GET /api/verify-media-apis
 * Ověří Spoonacular (jídla) a wger.de (cviky).
 *
 * Spoonacular – výchozí režim **minimal** (1× recipes/{id}/information, méně bodů než complexSearch).
 * Plný test včetně complexSearch: GET …?deep=1
 *
 * wger: exercise-translation, exerciseinfo?name_search=, exerciseimage.
 */
import { WGER_API_V2_BASE } from '../../lib/wgerApiConstants';
import { spoonacularLiveOutboundEnabled } from '../../lib/spoonacularQuotaGate';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';

/** Stabilní veřejný recept pro lehký healthcheck (information). */
const SPOONACULAR_VERIFY_RECIPE_ID = 716429;

async function readJsonResponse(resp) {
  const text = await resp.text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    return { _parseError: true, message: text?.slice?.(0, 300) || 'Neplatná JSON odpověď' };
  }
}

async function verifySpoonacularMinimal() {
  const out = {
    working: false,
    complexSearch_ok: false,
    complexSearch_skipped: true,
    information_ok: false,
    error: null,
  };
  const infoUrl = `https://api.spoonacular.com/recipes/${SPOONACULAR_VERIFY_RECIPE_ID}/information?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&includeNutrition=true`;
  const infoResp = await fetch(infoUrl, { method: 'GET', headers: { Accept: 'application/json' } });
  const infoData = await readJsonResponse(infoResp);
  const nutrients = infoData?.nutrition?.nutrients;
  out.information_ok = Boolean(
    infoResp.ok && infoData?.id != null && Array.isArray(nutrients) && nutrients.length > 0
  );
  out.working = out.information_ok;
  if (!out.information_ok) {
    out.error =
      infoData?.message ||
      (infoResp.ok ? 'information: chybí výživa v odpovědi' : `HTTP ${infoResp.status}`);
  }
  return out;
}

async function verifySpoonacularDeep() {
  const out = {
    working: false,
    complexSearch_ok: false,
    complexSearch_skipped: false,
    information_ok: false,
    error: null,
  };
  const searchUrl = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&query=chicken%20breast&number=1&addRecipeInformation=true&addRecipeNutrition=true`;
  const resp = await fetch(searchUrl, { method: 'GET', headers: { Accept: 'application/json' } });
  const data = await readJsonResponse(resp);
  out.complexSearch_ok = Boolean(resp.ok && Array.isArray(data?.results) && data.results.length > 0);
  let infoOk = false;
  const rid = data?.results?.[0]?.id;
  if (out.complexSearch_ok && rid != null) {
    const infoUrl = `https://api.spoonacular.com/recipes/${encodeURIComponent(String(rid))}/information?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&includeNutrition=true`;
    const infoResp = await fetch(infoUrl, { method: 'GET', headers: { Accept: 'application/json' } });
    const infoData = await readJsonResponse(infoResp);
    const nutrients = infoData?.nutrition?.nutrients;
    infoOk = Boolean(
      infoResp.ok && infoData?.id != null && Array.isArray(nutrients) && nutrients.length > 0
    );
  }
  out.information_ok = infoOk;
  out.working = out.complexSearch_ok && out.information_ok;
  if (!out.complexSearch_ok) {
    out.error = data?.message || (resp.ok ? 'complexSearch: žádné výsledky' : `HTTP ${resp.status}`);
  } else if (!out.information_ok) {
    out.error = 'recipes/{id}/information nevrátilo výživu – zkontroluj klíč / kvótu';
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }

  const deep =
    req.query?.deep === '1' ||
    req.query?.deep === 'true' ||
    String(req.query?.deep || '').toLowerCase() === 'yes';
  const verifyMode = deep ? 'deep' : 'minimal';

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

  const hasSpoonacular = Boolean(SPOONACULAR_KEY);
  result.spoonacular.configured = hasSpoonacular;

  if (hasSpoonacular) {
    if (!spoonacularLiveOutboundEnabled(false)) {
      result.spoonacular.error =
        'Přeskočeno: živé Spoonacular je v režimu jen generování plánu. Pro test API nastav SPOONACULAR_PLAN_GENERATION_ONLY=false.';
      result.spoonacular.complexSearch_skipped = true;
    } else {
      try {
        const sp = deep ? await verifySpoonacularDeep() : await verifySpoonacularMinimal();
        Object.assign(result.spoonacular, sp);
      } catch (e) {
        result.spoonacular.error = e?.message || 'Chyba volání';
      }
    }
  } else {
    result.spoonacular.error = 'SPOONACULAR_API_KEY chybí';
  }

  try {
    const base = WGER_API_V2_BASE;

    const trResp = await fetch(
      `${base}/exercise-translation/?search=squat&language=2&limit=1`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const trData = await readJsonResponse(trResp);
    const trResults = trData?.results;
    result.wger.translation_ok = Boolean(
      trResp.ok && Array.isArray(trResults) && trResults.length > 0 && trResults[0]?.exercise != null
    );

    const infoSearchResp = await fetch(
      `${base}/exerciseinfo/?name_search=${encodeURIComponent('squat')}&limit=3`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const infoSearchData = await readJsonResponse(infoSearchResp);
    const infoFirst = Array.isArray(infoSearchData?.results) ? infoSearchData.results[0] : null;
    result.wger.search_ok = Boolean(
      infoSearchResp.ok && infoFirst?.id != null && Number.isFinite(Number(infoFirst.id))
    );

    const imgListResp = await fetch(`${base}/exerciseimage/?limit=1`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const imgListData = await readJsonResponse(imgListResp);
    result.wger.exerciseimage_ok = Boolean(
      imgListResp.ok &&
        Array.isArray(imgListData?.results) &&
        imgListData.results.length > 0 &&
        imgListData.results[0]?.image
    );

    result.wger.working =
      result.wger.translation_ok && result.wger.search_ok && result.wger.exerciseimage_ok;
    if (!result.wger.working) {
      const parts = [];
      if (!result.wger.translation_ok) parts.push('exercise-translation');
      if (!result.wger.search_ok) parts.push('exerciseinfo?name_search');
      if (!result.wger.exerciseimage_ok) parts.push('exerciseimage');
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
      ? /Přeskočeno:/.test(String(result.spoonacular.error || ''))
        ? String(result.spoonacular.error)
        : verifyMode === 'deep'
          ? 'Spoonacular (complexSearch + information) nefunguje – jídla v plánu mohou selhat'
          : 'Spoonacular (information) nefunguje – klíč / kvóta / API; zkus také ?deep=1 pro complexSearch'
      : null,
  };

  return res.status(200).json({
    ok: true,
    verify_mode: verifyMode,
    spoonacular_verify_recipe_id: verifyMode === 'minimal' ? SPOONACULAR_VERIFY_RECIPE_ID : undefined,
    apis: result,
    summary,
  });
}
