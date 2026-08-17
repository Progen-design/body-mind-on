/**
 * recipes_catalog — výběr receptů pro generátor plánu (bez live Spoonacular).
 */
import { supabaseServer } from './supabaseServer';
import { MAX_OPAKOVANI_RECEPTU_TYDNE, tvrdaVylouceni, zakladNazvuJidla, vycerpaneZaklady } from './plan/pestrostReceptu.js';
export { MAX_OPAKOVANI_RECEPTU_TYDNE, tvrdaVylouceni, zakladNazvuJidla, vycerpaneZaklady };
import { objednejZNevyresenehoSlotu, objednejZNizkeNabidky, zalogujPoptavkuSlotu } from './recipeGenerationQueue';
import { calorieRangeForMealType } from './spoonacularComplexSearch';
import { bodyMetricsToPlanInput } from './bodyMetricsToPlanInput';
import {
  pickClosestCatalogRow,
  pickFromTopKCatalogRow,
  planMealTypeToWeightKey,
  scaleMealToTarget,
  applyPortionScaleToStructuredMeal,
  slotTargetKcal,
  sumScaledDayKcal,
  clampedPortionMultiplier,
  // Hranice škálování porce se IMPORTUJÍ, neopisují. SQL okno níž je z nich
  // odvozené — kdyby se rozsah škálování změnil, okno se posune s ním.
  MIN_SCALE,
  MAX_SCALE,
  START_MIN_SCALE,
  START_MAX_SCALE,
} from './nutrition/portionScaling';
import {
  fillDayCaloriesByAddingLibraryMeals,
  topUpWeakestDays,
  enforceDayCalorieBand,
} from './nutrition/calorieHonesty.js';
import { rowPassesMacroKcalGate } from './macroKcalConsistency.js';
import { demandBandForSlot, serveBandForSlot } from './catalogDemandBand.js';
import { seededShuffle, CATALOG_FETCH_CEILING } from './catalogCandidateOrder.js';
import { normalizeDietTags, dietTagSatisfied } from './dietTags.js';
// dietaryRules.js, ne dietaryPublishGate.js — ten importuje plánovač a vznikl by kruh.
import {
  buildDietaryPublishRules,
  checkCandidateAgainstDiet,
  dietTagsFromProfile,
} from './dietaryRules.js';

// `dietTagsFromProfile` se odsud re-exportuje, protože se přesunula do
// dietaryRules.js (čisté pravidlo + testovatelnost) a dosavadní importéry
// nemají důvod měnit cestu. Importuje se výš, takže je to lokální vazba —
// ne bare re-export, na který má repo test (reexportBinding.test.mjs).
export { dietTagsFromProfile };
import { catalogPickSeed as computeCatalogPickSeed } from './openaiPlanConfig';
import { sanitizeIngredientLineForDisplay } from './recipeSimplicityScore.js';
import {
  applyCatalogRowDisplayNameToMeal,
  catalogMealDisplayFields,
  mealDisplayMatchesCatalogName,
} from './planDataIntegrity.js';
import {
  filterCatalogCandidatesForStartPlan,
  isAllowedForSimpleStartPlan,
  getFullContentStartBlockReason,
  logCatalogSimpleStart,
  resolveSimpleStartLocalSlot,
} from './startSimpleMealFilter.js';
import {
  parseDietaryExclusions,
  mealContainsExcludedFood,
} from './dietaryExclusions.js';

/**
 * B1 cutover used ['simple_start'] only.
 * B2 (active): null = all active catalog sources (simple_start + meal_cache + spoonacular).
 * @type {string[]|null}
 */
export let START_CATALOG_SOURCE_FILTER = null;

/** Restrict START pool back to simple_start only (debug / rollback). */
export function restrictStartToSimpleStartSource() {
  START_CATALOG_SOURCE_FILTER = ['simple_start'];
}

/** Enable full catalog pool for START (B2). */
export function enableStartFullCatalogPool() {
  START_CATALOG_SOURCE_FILTER = null;
}

/**
 * Kalorické pásmo pro slot (stejná logika jako buildSpoonacularContextForMealSlot).
 * @param {object|null} bodyMetrics
 * @param {object} targets
 * @param {object} m
 * @param {number} mealsPerDay
 */
function kcalBandForMealSlot(bodyMetrics, targets, m, mealsPerDay) {
  const mealType = m?.type || 'lunch';
  const daily = Number(targets?.calories_per_day) || 2000;
  const mpd = mealsPerDay ?? (Number(bodyMetrics?.meals_per_day) || 3);
  const weightKey = planMealTypeToWeightKey(mealType);
  const slotTarget = slotTargetKcal(daily, mpd, weightKey);
  const band = calorieRangeForMealType(mealType, daily, mpd);
  const tk = Number(m?.target_kcal);
  let minCal = band.min;
  let maxCal = band.max;
  /** Katalog má typicky max ~900 kcal/porce — při vysokém denním cíli jinak dotaz vrátí 0 řádků. */
  const CATALOG_NOMINAL_MAX_KCAL = 920;
  if (minCal > CATALOG_NOMINAL_MAX_KCAL) {
    minCal = Math.max(120, Math.round(slotTarget * 0.35));
  }
  if (Number.isFinite(tk) && tk > 120 && tk < 4000) {
    const gLo = Math.round(tk * 0.85);
    const gHi = Math.round(tk * 1.15);
    const lo = Math.max(band.min, gLo);
    const hi = Math.min(band.max, gHi);
    if (lo <= hi) {
      minCal = lo;
      maxCal = hi;
    }
  }
  return { minCalories: minCal, maxCalories: maxCal };
}

/** @typedef {'snidane'|'obed'|'vecere'|'svacina'} CatalogMealType */

/**
 * @param {string} planMealType breakfast|lunch|dinner|snack
 * @returns {CatalogMealType}
 */
export function planMealTypeToCatalog(planMealType) {
  const t = String(planMealType || 'lunch').toLowerCase();
  if (t === 'breakfast') return 'snidane';
  if (t === 'dinner') return 'vecere';
  if (t === 'snack') return 'svacina';
  return 'obed';
}

/** Slot typy, které plán skutečně používá. Cokoli jiného spadne na 'obed'. */
const ZNAME_SLOTY_PLANU = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

/**
 * Totéž jako planMealTypeToCatalog, ale neznámou hodnotu nahlásí.
 *
 * Používá se na cestách, které zapisují do DB (fronta generátoru, log
 * poptávky). Obě cílové tabulky mají CHECK na české hodnoty, takže anglická
 * nebo neznámá hodnota by skončila buď spolknutou chybou, nebo padajícím
 * cronem druhý den. Mapování to spraví, varování zajistí, že se neznámý slot
 * pozná TAM, kde vznikl.
 *
 * @param {string} planMealType
 * @param {string} kde  odkud se volá, jen do logu
 * @returns {CatalogMealType}
 */
function catalogMealTypeProZapis(planMealType, kde) {
  const t = String(planMealType || '').toLowerCase();
  if (!ZNAME_SLOTY_PLANU.has(t)) {
    console.warn('[catalog] neznamy typ slotu, mapuji na obed', { kde, planMealType });
  }
  return planMealTypeToCatalog(planMealType);
}


/**
 * @param {object} row
 * @param {string[]} requiredTags
 */
export function catalogRowMatchesDiet(row, requiredTags) {
  if (!requiredTags?.length) return true;
  // Normalizujeme i na čtení: migrace sjednotila data, ale tohle drží filtr
  // v pořádku i kdyby nějaká cesta zapsala tagy v mezerovém formátu.
  const tags = normalizeDietTags(row.diet_tags);
  return normalizeDietTags(requiredTags).every((t) => dietTagSatisfied(tags, t));
}

/**
 * Poptávka nasbíraná během jednoho skládání plánu.
 *
 * Klíč je celá specifikace, takže se z 86 volání stane hrstka objednávek.
 * Odesílá se jedním awaitovaným průchodem na konci — viz odesliPoptavku().
 *
 * @type {Map<string, {mealType:string,dietTags:string[],kcalMin:number,kcalMax:number,chybi:number}>}
 */
const poptavka = new Map();

function zapisPoptavku(spec) {
  const klic = `${spec.mealType}|${(spec.dietTags || []).slice().sort().join(',')}|${spec.kcalMin}|${spec.kcalMax}`;
  const stara = poptavka.get(klic);
  // Když stejný slot chyběl vícekrát, drží se nejvyšší zjištěný schodek.
  if (!stara || spec.chybi > stara.chybi) poptavka.set(klic, spec);
}

/**
 * Log poptávky za KAŽDÉ řešení slotu, i úspěšné — na rozdíl od `poptavka` výš,
 * kam se zapisuje jen schodek.
 *
 * Slot s 2 kandidáty a limitem 2 projde jako úspěch a objednávka nevznikne,
 * přitom všichni uživatelé dostanou totéž jídlo. Tenhle log to zachytí:
 * drží nejhorší viděný počet kandidátů a počet řešení, ze kterých pak
 * `fill_recipe_queue_from_demand` staví prioritu podle četnosti.
 *
 * Agreguje se stejně jako `poptavka`, aby z 86 volání na jeden plán byla hrstka
 * RPC volání na konci, ne 86 insertů uvnitř horké smyčky.
 *
 * @type {Map<string, {mealType:string,dietTags:string[],kcalMin:number,kcalMax:number,
 *                     kandidatu:number,limit:number,reseni:number}>}
 */
const logPoptavky = new Map();

function zapisLogPoptavky(z) {
  const klic = `${z.mealType}|${(z.dietTags || []).slice().sort().join(',')}|${z.kcalMin}|${z.kcalMax}`;
  const stary = logPoptavky.get(klic);
  if (!stary) {
    logPoptavky.set(klic, { ...z, reseni: 1 });
    return;
  }
  stary.reseni += 1;
  // Drží se NEJHORŠÍ viděná nabídka a NEJVYŠŠÍ požadavek — o díře rozhoduje
  // ten nejtěsnější případ, ne průměr.
  if (z.kandidatu < stary.kandidatu) stary.kandidatu = z.kandidatu;
  if (z.limit > stary.limit) stary.limit = z.limit;
}

/**
 * Odešle nasbíranou poptávku do fronty generátoru a vyprázdní ji.
 * Volá se na konci skládání plánu, aby inserty proběhly ještě před odpovědí.
 *
 * @returns {Promise<{objednano:number, duplicit:number}>}
 */
async function odesliPoptavku() {
  // Log poptávky jde do DB i tehdy, když žádná objednávka nevznikla — právě
  // tenký (ne úplně prázdný) slot je to, co jinak nikde nezůstane.
  const zaznamy = [...logPoptavky.values()];
  logPoptavky.clear();
  let zalogovano = 0;
  for (const z of zaznamy) {
    try {
      const r = await zalogujPoptavkuSlotu(z);
      if (r?.ok) zalogovano += 1;
      else console.warn('[catalog] log poptavky selhal', r?.error);
    } catch (e) {
      // Telemetrie nesmí shodit skládání plánu.
      console.warn('[catalog] log poptavky selhal', e?.message || e);
    }
  }

  if (!poptavka.size) {
    if (zaznamy.length) {
      console.log('[catalog] poptavka zalogovana, objednavka nevznikla', {
        specifikaci: zaznamy.length, zalogovano,
      });
    }
    return { objednano: 0, duplicit: 0, zalogovano };
  }
  const specy = [...poptavka.values()];
  poptavka.clear();

  let objednano = 0;
  let duplicit = 0;
  for (const spec of specy) {
    try {
      const r = await objednejZNizkeNabidky(spec);
      if (r?.created) objednano += 1;
      else if (r?.duplicate) duplicit += 1;
    } catch (e) {
      console.warn('[catalog] objednavka receptu selhala', e?.message || e);
    }
  }
  console.log('[catalog] poptavka odeslana do fronty generatoru', {
    specifikaci: specy.length, objednano, duplicit, zalogovano,
  });
  return { objednano, duplicit, zalogovano };
}

/**
 * @param {object} params
 * @returns {Promise<object[]>}
 */
export async function fetchCatalogCandidates(params) {
  const {
    mealType,
    dietTags = [],
    minKcal: minKcalVstup = 160,
    maxKcal: maxKcalVstup = 1200,
    // (3) Co má smysl VYROBIT — slotové pásmo z calorieRangeForMealType.
    // Jde do fronty generátoru i do logu poptávky. Volající, který ho nepředá,
    // spadne zpátky na minKcal/maxKcal (viz demandBandForSlot).
    slotKcalMin = null,
    slotKcalMax = null,
    // Cíl slotu. Potřebný pro kontrolu PO naškálování porce — bez něj se
    // kontrola přeskočí a filtruje jen SQL okno.
    slotTargetKcal: cilSlotu = null,
    // Měkké vyloučení: diverzita napříč týdnem. Když je nabídka tenká, níž se
    // uvolní — radši opakované jídlo než nedoručený plán.
    excludeIds = new Set(),
    // Tvrdé vyloučení: NIKDY se neuvolňuje. Slouží pro pravidla, která nesmí
    // padnout ani při prázdné nabídce — dnes „stejný recept ne dvakrát
    // v jednom dni“. Když na tohle nabídka nestačí, je správně vrátit míň
    // kandidátů a nechat rozhodnutí na volajícím.
    hardExcludeIds = new Set(),
    // Základy názvů (viz `zakladNazvuJidla`), které už vyčerpaly týdenní strop.
    // Odděleno od `hardExcludeIds` schválně: záchranné stupně výběru níž tenhle
    // filtr smějí pustit, aby uživateli radši přišlo třetí kuře než prázdný slot.
    // Pravidlo „ne dvakrát v jednom dni“ se tím neuvolňuje, to jede přes id.
    zakazaneZaklady = new Set(),
    limit = 12,
    shuffle = true,
    simpleStartMode = false,
    bodyMetrics = null,
    // Seed z catalogPickSeed(userId, validFrom) = stejný uživatel + stejný týden
    // dá stejné pořadí. Bez něj se míchá Math.random() jako dřív.
    catalogPickSeed: pickSeed = null,
  } = params;

  const catalogType = planMealTypeToCatalog(mealType);
  const exclusions = parseDietaryExclusions(bodyMetrics || {});

  // (1) PÁSMO NASERVÍROVANÉ PORCE — srovnané s cílem slotu.
  //
  // Musí se to stát TADY, ne u volajícího: do fetche vedou tři cesty
  // (hlavní výběr přes kcalBandForMealSlot, fallback na slotové pásmo,
  // havarijní dotaz) a rozbité pásmo posílaly dvě z nich. Jedno místo =
  // nemůže se to znovu rozejít.
  //
  // Odvozuje se z toho i SQL okno níž, takže se s pásmem posune i to, co se
  // vůbec načte. Škálování porce se NEMĚNÍ.
  const servePasmo = serveBandForSlot({
    minKcal: minKcalVstup,
    maxKcal: maxKcalVstup,
    slotTargetKcal: cilSlotu,
  });
  const minKcal = servePasmo.minKcal;
  const maxKcal = servePasmo.maxKcal;

  if (servePasmo.opraveno) {
    console.warn('[catalog] pasmo neobsahovalo cil slotu — srovnano na cil ±15 %', {
      mealType,
      slotTarget: Number(cilSlotu),
      puvodni: `${minKcalVstup}–${maxKcalVstup}`,
      srovnano: `${minKcal}–${maxKcal}`,
      // Kořen je rozpor MEAL_WEIGHTS × calorieRangeForMealType. Dokud tenhle
      // řádek chodí, ty dva zdroje pravdy si u tohohle slotu odporují.
      pozn: 'MEAL_WEIGHTS a calorieRangeForMealType se u tohoto slotu neshodnou',
    });
  }

  // (2) SQL OKNO — co má smysl NAČÍST.
  //
  // Recept se do cílového pásma dostane až naškálováním porce, takže SQL musí
  // pustit dál všechno, co tam naškálovat JDE. Recept se základem B a
  // multiplikátorem m ∈ [minScale, maxScale] naservíruje B·m, takže do pásma
  // [minKcal, maxKcal] dosáhne, když
  //     B >= minKcal / maxScale   a   B <= maxKcal / minScale.
  //
  // Dřív se v SQL filtrovalo přímo na [minKcal, maxKcal], tedy na cíl ±15 %.
  // Tím se zahodily recepty, které by po naškálování sedly — u snídaně s cílem
  // ~500 kcal to nechalo 3 kandidáty ze 117, které v pásmu slotu existují.
  const minScale = simpleStartMode ? START_MIN_SCALE : MIN_SCALE;
  const maxScale = simpleStartMode ? START_MAX_SCALE : MAX_SCALE;
  const sqlMinKcal = Math.max(80, Math.floor(minKcal / maxScale));
  const sqlMaxKcal = Math.ceil(maxKcal / minScale);

  // STROP, ne cíl. Reálně se načte jen tolik řádků, kolik jich okno najde
  // (u oběda dnes 166). Strop 150 byl málo — 16 receptů se zahazovalo, a bez
  // ORDER BY navíc nedeterministicky. Viz CATALOG_FETCH_CEILING.
  const fetchLimit = CATALOG_FETCH_CEILING;

  const { data, error } = await supabaseServer
    .from('recipes_catalog')
    .select(
      // fiber_g je tu kvůli Atwaterově kontrole v rowPassesMacroKcalGate —
      // bez něj by spadla zpátky na 4/4/9 a vyřadila recepty s vlákninou.
      'id, source, source_id, name_cs, name_en, meal_type, kcal, protein_g, carbs_g, fat_g, fiber_g, diet_tags, servings, ingredients, instructions, spoonacular_url, image_url'
    )
    .eq('active', true)
    .eq('meal_type', catalogType)
    .gte('kcal', sqlMinKcal)
    .lte('kcal', sqlMaxKcal)
    // ORDER BY PŘED LIMITEM. Bez řazení není pořadí v Postgresu definované,
    // takže `.limit()` vracel libovolné řádky a dvě stejná volání mohla dát
    // jinou množinu. Řadí se podle id, protože je stabilní; nezaujatost pak
    // dělá seededShuffle níž, ne tohle řazení.
    .order('id', { ascending: true })
    .limit(fetchLimit);

  if (error) {
    throw new Error(`recipes_catalog query failed: ${error.message}`);
  }

  // Kdyby se strop někdy vyčerpal, `ORDER BY id` začne zvýhodňovat nízká id
  // a zamíchání to už nespraví — míchá se jen to, co dorazilo. Musí to být
  // vidět, ne se to dozvědět z toho, že plány zchudly.
  if ((data || []).length >= fetchLimit) {
    console.warn('[catalog] STROP NACTENI VYCERPAN — kandidati se rezou podle id', {
      mealType,
      catalogType,
      fetchLimit,
      sqlMinKcal,
      sqlMaxKcal,
    });
  }

  function passesExclusions(r) {
    if (!exclusions?.blockedTerms?.length) return true;
    const probe = {
      name_cs: r.name_cs,
      shopping_ingredient_lines: ingredientLinesFromCatalogRow(r),
      recipe: { ingredients: r.ingredients },
    };
    return !mealContainsExcludedFood(probe, exclusions);
  }

  /**
   * Tvrdé filtry: dieta, vyloučené potraviny, makro/kcal gate, povolený zdroj.
   * Fallback je NIKDY neuvolňuje — míň kandidátů je lepší než nezkontrolovaný kandidát.
   *
   * @param {object} r
   * @returns {boolean}
   */
  /**
   * (1) Kontrola cílového pásma PO NAŠKÁLOVÁNÍ PORCE, ne v SQL.
   *
   * SQL okno výš je jen hrubý předfiltr — pustí i recept, který se do pásma
   * nevejde, protože by na to potřeboval multiplikátor mimo povolený rozsah.
   * Tady se to dopočítá stejným clampedPortionMultiplier, jakým se porce
   * doopravdy škáluje, takže kandidát projde jen tehdy, když NASERVÍROVANÁ
   * porce v pásmu [minKcal, maxKcal] opravdu skončí.
   *
   * Bez znalosti cíle slotu se kontrola přeskočí — volající, který ho nepředá,
   * dostane celé SQL okno jako dřív.
   */
  /**
   * Počítadlo důvodů. Bez něj se odmítnutí jen tiše nezapočítalo a z logu
   * `blockedByHardFilters: 41` se nedalo poznat, KTERÝ filtr to byl ani PROČ —
   * 9. 8. se to muselo dohadovat z produkčního SQL.
   */
  const postScaleOdmitnuti = { podMin: 0, nadMax: 0, bezKcal: 0, vzorky: [] };

  function passesPostScale(r) {
    const cil = Number(cilSlotu);
    if (!Number.isFinite(cil) || cil <= 0) return true;
    const base = Number(r?.kcal);
    if (!Number.isFinite(base) || base <= 0) {
      postScaleOdmitnuti.bezKcal += 1;
      return false;
    }
    const nasobek = clampedPortionMultiplier(base, cil, { simpleStartMode });
    const naservirovano = base * nasobek;
    // Půl kcal tolerance kvůli zaokrouhlování, ne kvůli uvolnění pásma.
    if (naservirovano >= minKcal - 0.5 && naservirovano <= maxKcal + 0.5) return true;

    const podMin = naservirovano < minKcal - 0.5;
    if (podMin) postScaleOdmitnuti.podMin += 1;
    else postScaleOdmitnuti.nadMax += 1;
    if (postScaleOdmitnuti.vzorky.length < 6) {
      postScaleOdmitnuti.vzorky.push({
        id: r.id,
        base,
        nasobek,
        naservirovano: Math.round(naservirovano),
        duvod: podMin ? `pod minKcal ${minKcal}` : `nad maxKcal ${maxKcal}`,
      });
    }
    return false;
  }

  function passesHardFilters(r) {
    if (!catalogRowMatchesDiet(r, dietTags)) return false;
    if (!passesPostScale(r)) return false;
    if (!rowPassesMacroKcalGate(r)) return false;
    if (
      simpleStartMode
      && Array.isArray(START_CATALOG_SOURCE_FILTER)
      && START_CATALOG_SOURCE_FILTER.length > 0
      && !START_CATALOG_SOURCE_FILTER.includes(String(r.source || ''))
    ) {
      return false;
    }
    if (!passesExclusions(r)) return false;
    return true;
  }

  let safeRows = (data || []).filter(passesHardFilters);

  // Škálování je jediný tvrdý filtr, který recept zahodí kvůli ČÍSLU, ne kvůli
  // vlastnosti receptu — takže jako jediný může být špatně nastavený, ne špatně
  // trefený. Musí být vidět i tehdy, když kandidátů nakonec stačí.
  const postScaleZahozeno =
    postScaleOdmitnuti.podMin + postScaleOdmitnuti.nadMax + postScaleOdmitnuti.bezKcal;
  if (postScaleZahozeno > 0) {
    console.warn('[catalog] passesPostScale zahodilo kandidaty', {
      mealType,
      zahozeno: postScaleZahozeno,
      nacteno: (data || []).length,
      slotTarget: Number(cilSlotu),
      pasmo: `${minKcal}–${maxKcal}`,
      podMin: postScaleOdmitnuti.podMin,
      nadMax: postScaleOdmitnuti.nadMax,
      bezKcal: postScaleOdmitnuti.bezKcal,
      vzorky: postScaleOdmitnuti.vzorky,
    });
  }

  if (simpleStartMode) {
    const { kept, excluded } = filterCatalogCandidatesForStartPlan(safeRows, mealType);
    if (excluded.length) {
      console.log('[catalog-simple-start] excluded reason', {
        mealType,
        count: excluded.length,
        sample: excluded.slice(0, 6),
      });
    }
    console.log('[catalog-simple-start] candidates before/after hard filter', {
      mealType,
      before: safeRows.length,
      after: kept.length,
    });
    safeRows = kept;
  }

  // Tvrdé vyloučení padá PŘED uvolňovací logikou níž, jinak by se recept vrátil
  // zpátky mezi kandidáty přes `repeats`. Přesně tohle dělalo, že „stejný recept
  // ne dvakrát v jednom dni“ neplatilo: vyloučení se sem správně předalo
  // a o dva řádky dál se zase zrušilo.
  if (hardExcludeIds.size) {
    safeRows = safeRows.filter((r) => !hardExcludeIds.has(r.id));
  }

  if (zakazaneZaklady?.size) {
    const pred = safeRows.length;
    safeRows = safeRows.filter((r) => !zakazaneZaklady.has(zakladNazvuJidla(r.name_cs)));
    if (pred !== safeRows.length) {
      console.log('[catalog] tydenni strop jidla odfiltroval varianty', {
        mealType,
        odfiltrovano: pred - safeRows.length,
        zbyva: safeRows.length,
      });
    }
  }

  // Diverzita napříč týdnem je jediné, co smí fallback uvolnit.
  let rows = safeRows.filter((r) => !excludeIds.has(r.id));

  if (rows.length < limit) {
    const repeats = safeRows.filter((r) => excludeIds.has(r.id));
    if (repeats.length) {
      console.warn('[catalog] fallback: povoluji opakovani receptu', {
        mealType,
        strict: rows.length,
        limit,
        repeatsAvailable: repeats.length,
      });
      rows = rows.concat(repeats);
    }
  }

  // Log poptávky za KAŽDÉ řešení slotu, i když nabídka stačí. Bez toho by tenký
  // slot (1–3 kandidáti, limit splněn) nikde nezůstal — viz zapisLogPoptavky.
  //
  // POZOR NA mealType vs catalogType: `mealType` je anglicky slot plánu
  // (breakfast|lunch|dinner|snack), `catalogType` je česká hodnota, kterou
  // katalog i fronta mají v CHECKu. Do DB smí jen `catalogType` — anglická
  // hodnota by v `catalog_slot_demand` prošla tiše a spadla až druhý den
  // v cronu fill_recipe_queue_from_demand.
  //
  // PÁSMO SE POČÍTÁ JEDNOU A POUŽIJÍ HO OBĚ CESTY. Nesmí se rozejít: 9. 8.
  // dostaly obě totéž vstupní pásmo a každá si ho zaokrouhlila po svém, takže
  // do fronty šla snídaně 439–459 (20 kcal) a do logu 400–500 (100 kcal).
  // Hlídá to lib/__tests__/catalogDemandBand.test.mjs.
  const poptavkaPasmo = demandBandForSlot({ slotKcalMin, slotKcalMax, minKcal, maxKcal });

  zapisLogPoptavky({
    mealType: catalogType,
    dietTags,
    kcalMin: poptavkaPasmo.kcalMin,
    kcalMax: poptavkaPasmo.kcalMax,
    kandidatu: rows.length,
    limit,
  });

  if (rows.length < limit) {
    console.warn('[catalog] vracim min kandidatu nez limit — tvrde filtry se neuvolnuji', {
      mealType,
      returned: rows.length,
      limit,
      dietTags,
      fetched: (data || []).length,
      blockedByHardFilters: (data || []).length - safeRows.length,
      // Rozpad `blockedByHardFilters` na to, co se dá spočítat: zbytek padl na
      // dietu / vyloučené potraviny / makro gate / zdroj.
      blockedByPostScale: postScaleZahozeno,
    });
    // Předstih před tvrdou dírou: plán ještě projde (diverzita se uvolní), ale
    // nabídka došla.
    //
    // Objednávka se JEN ZAPÍŠE DO FRONTY V PAMĚTI a odešle se až na konci
    // skládání plánu. Dřív se tady volal insert bez await, což ve serverless
    // funkci znamená, že se promise zabije ve chvíli, kdy odejde odpověď —
    // a poptávková smyčka proto nikdy nezaložila jedinou objednávku. Ve frontě
    // byly měsíc jen ruční seedy, i když tahle větev padla 86× na jeden plán.
    //
    // Await přímo tady by znamenal desítky insertů uvnitř horké smyčky.
    // Duplicitu řeší jak tenhle Set, tak unikátní index ve frontě.
    //
    // Zapisuje se `catalogType`, ne `mealType` — fronta má na meal_type CHECK
    // s českými hodnotami. Dokud se sem posílala anglická hodnota, insert
    // constraint porušil, chyba se spolkla v odesliPoptavku a smyčka mlčky
    // nezaložila nic.
    // Totožné pásmo jako v zapisLogPoptavky výš — jeden výpočet, dvě použití.
    zapisPoptavku({
      mealType: catalogType,
      dietTags,
      kcalMin: poptavkaPasmo.kcalMin,
      kcalMax: poptavkaPasmo.kcalMax,
      chybi: limit - rows.length,
    });
  }

  if (shuffle) {
    const seed = Number(pickSeed);
    if (Number.isFinite(seed)) {
      // Seedované zamíchání: stejný uživatel + stejný týden = stejné pořadí.
      // Dřív se míchalo Math.random(), takže se plán nedal reprodukovat a
      // přegenerování dalo jiné jídlo bez zjevného důvodu.
      //
      // Sůl je délka pole: dvě různě velká okna nad stejným seedem se tak
      // nemíchají identicky, ale pro TOTOŽNÝ vstup je pořadí stále stabilní.
      rows = seededShuffle(rows, seed, rows.length);
    } else {
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
    }
  }

  return rows.slice(0, limit);
}

/**
 * @param {object} params
 * @returns {Promise<object|null>}
 */
export async function pickCatalogRecipe(params) {
  const rows = await fetchCatalogCandidates(params);
  return rows[0] ?? null;
}

/**
 * Vybere recept z TOP-K kandidátů se seedovanou randomizací (variabilita napříč uživateli/týdny).
 * @param {object} params
 * @param {number} slotTarget
 * @param {number} pickSeed
 * @param {number} slotSalt
 * @returns {Promise<object|null>}
 */
export async function pickSeededCatalogRecipe(params, slotTarget, pickSeed, slotSalt, pickOpts = {}) {
  const topK = Math.max(3, Math.min(8, Number(process.env.CATALOG_PICK_TOP_K) || 5));
  // Seed se protahuje do fetche, aby bylo deterministické i pořadí kandidátů,
  // ne jen výběr z TOP-K. Sám `shuffle: false` tady zůstává: řadí se podle id
  // a o variabilitu se stará pickFromTopKCatalogRow přes týž seed.
  const rows = await fetchCatalogCandidates({
    ...params,
    shuffle: false,
    catalogPickSeed: pickSeed,
    limit: Math.max(params.limit || 12, 32),
  });
  const pickOptions = {
    mealType: params.mealType || 'lunch',
    simpleStartMode: params.simpleStartMode === true || pickOpts.simpleStartMode === true,
    slotMeal: pickOpts.slotMeal || params.slotMeal || null,
  };
  return pickFromTopKCatalogRow(rows, slotTarget, pickSeed, slotSalt, topK, pickOptions);
}

/**
 * Vybere recept s nominálními kcal nejblíže cíli slotu (legacy / bez seed).
 * @param {object} params
 * @param {number} slotTarget
 * @returns {Promise<object|null>}
 */
export async function pickClosestCatalogRecipe(params, slotTarget) {
  const rows = await fetchCatalogCandidates({ ...params, shuffle: false, limit: Math.max(params.limit || 12, 24) });
  return pickClosestCatalogRow(rows, slotTarget, { mealType: params.mealType || 'lunch' });
}

/**
 * @param {object} row
 * @returns {string[]}
 */
export function ingredientLinesFromCatalogRow(row) {
  const ing = row?.ingredients;
  if (!Array.isArray(ing)) return [];
  return ing
    .map((i) => {
      if (typeof i === 'string') return i.trim();
      if (i && typeof i === 'object') {
        return String(i.original || i.name || i.text || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

/**
 * @param {object} row — recipes_catalog row
 * @param {object} [slotMeal] — původní slot z AI (type)
 * @param {object|null} [scaled] — výstup scaleMealToTarget (kcal, makra, portion_multiplier)
 * @returns {object} meal ve tvaru structured plan
 */
export function catalogRowToStructuredMeal(row, slotMeal = {}, scaled = null) {
  const sourceIdNum = row.source_id != null && /^\d+$/.test(String(row.source_id)) ? Number(row.source_id) : null;
  const recipeId = sourceIdNum ?? row.id;
  const imageUrl =
    (row.image_url && String(row.image_url).trim()) ||
    (sourceIdNum != null ? `https://img.spoonacular.com/recipes/${sourceIdNum}-312x231.jpg` : null);

  // Build at multiplier 1.0 first, then atomic-scale nutrition+ingredients together.
  const baseKcal = Math.round(Number(row.kcal) || 0);
  const baseProtein = row.protein_g != null ? Number(row.protein_g) : null;
  const baseCarbs = row.carbs_g != null ? Number(row.carbs_g) : null;
  const baseFat = row.fat_g != null ? Number(row.fat_g) : null;
  const shoppingIngredientLines = ingredientLinesFromCatalogRow(row).map(sanitizeIngredientLineForDisplay);
  const structuredIngredients = Array.isArray(row.ingredients)
    ? JSON.parse(JSON.stringify(row.ingredients))
    : [];

  // Slot/template name is ONLY for picking — never for user-facing labels.
  // display_name* / name_cs must equal recipes_catalog.name_cs of the assigned row.
  const labels = catalogMealDisplayFields(row, slotMeal);

  const meal = {
    type: slotMeal.type || 'lunch',
    name_cs: labels.name_cs,
    ai_name: slotMeal.ai_name || null,
    display_name_cs: labels.display_name_cs,
    display_name: labels.display_name,
    planner_suggestion_cs: labels.planner_suggestion_cs,
    recipe_verified: true,
    kcal: baseKcal,
    protein_g: baseProtein,
    carbs_g: baseCarbs,
    fat_g: baseFat,
    portion_multiplier: 1,
    recipe_id: recipeId,
    recipe: {
      id: recipeId,
      title: row.name_en || row.name_cs,
      title_cs: labels.recipe_title_cs,
      image: imageUrl,
      source_url: row.spoonacular_url || null,
      sourceUrl: row.spoonacular_url || null,
      ready_in_minutes: null,
      calories: baseKcal,
      protein_g: baseProtein,
      carbs_g: baseCarbs,
      fat_g: baseFat,
      source: 'catalog',
      portion_multiplier: 1,
      ingredients: structuredIngredients,
      servings: 1,
    },
    image_url: imageUrl,
    image_trust_level: imageUrl ? 'exact' : 'none',
    shopping_ingredient_lines: shoppingIngredientLines,
    catalog_id: row.id,
    catalog_source: row.source,
  };

  applyCatalogRowDisplayNameToMeal(meal, row);

  const targetMult = Number(scaled?.portion_multiplier);
  if (Number.isFinite(targetMult) && Math.abs(targetMult - 1) > 1e-9) {
    applyPortionScaleToStructuredMeal(meal, targetMult, {
      allowUnverified: true,
      simpleStartMode: slotMeal?.simple_start_mode === true
        || slotMeal?.planner_source === 'simple_meal_planner_agent',
    });
  }

  // Scaling must not resurrect slot titles.
  applyCatalogRowDisplayNameToMeal(meal, row);
  return meal;
}

/**
 * Vybere a škáluje jeden slot z katalogu.
 * @param {object} slotMeal
 * @param {object} ctx
 * @returns {Promise<{ row: object|null, meal: object|null }>}
 */
async function resolveScaledCatalogSlot(slotMeal, ctx) {
  const {
    bodyMetrics,
    targets,
    dailyTarget,
    mealsPerDay,
    dietTags,
    usedCatalogIds,
    // Recepty už použité DNESKA. Opakování napříč dny je produktové rozhodnutí
    // (meal prep, jednoduchost před pestrostí), ale dvakrát totéž v jednom dni
    // nechtěl nikdy nikdo — a přesně to se dělo, protože poslední stupně
    // eskalace níž zahazovaly vyloučení úplně.
    usedTodayIds = new Set(),
    pouzitiZaTyden = new Map(),
    pouzitiZakladuZaTyden = new Map(),
    catalogPickSeed,
    slotSalt,
    simpleStartMode = false,
  } = ctx;

  const tvrdeVylouceno = tvrdaVylouceni(usedTodayIds, pouzitiZaTyden);
  // Záměrně NENÍ součástí `tvrdeVylouceno`: záchranné stupně výběru ho pouštějí.
  const zakazaneZaklady = vycerpaneZaklady(pouzitiZakladuZaTyden);

  // Pravidla se staví z profilu, ne z `dietTags` — `dietTags` je až důsledek
  // a právě ten se 10. 8. 2026 ztratil.
  const dietRulesForSlot = buildDietaryPublishRules(bodyMetrics);

  const mealType = slotMeal.type || 'lunch';
  const weightKey = planMealTypeToWeightKey(mealType);
  const slotTarget = slotTargetKcal(dailyTarget, mealsPerDay, weightKey);

  const bandCtx = kcalBandForMealSlot(bodyMetrics, targets, slotMeal, mealsPerDay);

  // Slotové pásmo = co má smysl VYROBIT. Počítá se jednou a používá se na dvou
  // místech: jako pásmo pro frontu generátoru (přes fetchCatalogCandidates)
  // a jako široký fallback níž, když první výběr nic nenajde.
  const slotBand = calorieRangeForMealType(mealType, dailyTarget, mealsPerDay);

  const pickParams = {
    mealType,
    dietTags,
    // Cíl slotu ±15 % = co chci NASERVÍROVAT. Kontroluje se po naškálování.
    minKcal: bandCtx.minCalories,
    maxKcal: bandCtx.maxCalories,
    slotTargetKcal: slotTarget,
    // Co má smysl VYROBIT — jde do fronty generátoru, ne do SQL filtru.
    slotKcalMin: slotBand.min,
    slotKcalMax: slotBand.max,
    excludeIds: usedCatalogIds,
    hardExcludeIds: tvrdeVylouceno,
    zakazaneZaklady,
    limit: 24,
    simpleStartMode,
    bodyMetrics,
    catalogPickSeed,
  };

  const pickFn = (params, target, salt) =>
    pickSeededCatalogRecipe(params, target, catalogPickSeed, salt, {
      simpleStartMode,
      slotMeal,
    });

  let row = await pickFn({ ...pickParams, slotMeal }, slotTarget, slotSalt);

  if (row && simpleStartMode && !isAllowedForSimpleStartPlan(row, slotMeal)) {
    const reason = getFullContentStartBlockReason(row, mealType, slotMeal);
    logCatalogSimpleStart('recipe rejected after full-content check', {
      catalog_id: row.id,
      meal_type: mealType,
      agent_name: slotMeal?.name_cs ?? null,
      reason,
      matchedTerm: reason,
    });
    row = null;
  }

  if (!row) {
    // Fallback na celé slotové pásmo. Používá se `slotBand` spočítaný výš, ne
    // druhé volání calorieRangeForMealType — jinak by se dvě místa mohla
    // rozejít při první změně té funkce.
    row = await pickFn(
      {
        mealType,
        dietTags,
        minKcal: slotBand.min,
        maxKcal: slotBand.max,
        slotTargetKcal: slotTarget,
        slotKcalMin: slotBand.min,
        slotKcalMax: slotBand.max,
        excludeIds: usedCatalogIds,
        hardExcludeIds: tvrdeVylouceno,
        zakazaneZaklady,
        limit: 24,
        simpleStartMode,
        bodyMetrics,
        catalogPickSeed,
      },
      slotTarget,
      slotSalt + 1
    );
  }

  if (!row) {
    row = await pickFn(
      {
        mealType,
        dietTags,
        minKcal: 80,
        maxKcal: 2000,
        excludeIds: usedCatalogIds,
        hardExcludeIds: tvrdeVylouceno,
        zakazaneZaklady,
        limit: 32,
        simpleStartMode,
        bodyMetrics,
      },
      slotTarget,
      slotSalt + 2
    );
  }

  if (!row) {
    // Týdenní vyloučení padá — pool na tenhle slot došel. Denní vyloučení
    // ale platí dál, jinak by v jednom dni vyšlo dvakrát totéž jídlo.
    console.warn('[catalog] pool vycerpan, povoluji opakovani z jinych dnu', {
      meal_type: mealType,
      pouzito_tento_tyden: usedCatalogIds?.size ?? 0,
      pouzito_dnes: usedTodayIds.size,
      vycerpaly_tydenni_strop: tvrdeVylouceno.size - usedTodayIds.size,
    });
    row = await pickFn(
      {
        mealType,
        dietTags,
        minKcal: 80,
        maxKcal: 2000,
        excludeIds: new Set(),
        hardExcludeIds: tvrdeVylouceno,
        zakazaneZaklady,
        limit: 32,
        simpleStartMode,
        bodyMetrics,
      },
      slotTarget,
      slotSalt + 3
    );
  }

  if (!row) {
    // Production graceful degradation: never invent macros, never hard-fail the user.
    // Pick any real catalog meal of the same meal_type nearest to slot target.
    console.error('[catalog-simple-start] TITLE/FILTER MISS — emergency catalog pick', {
      meal_type: mealType,
      agent_name: slotMeal?.name_cs ?? null,
      slot_target: slotTarget,
      source_filter: START_CATALOG_SOURCE_FILTER,
    });
    row = await pickClosestCatalogRecipe({
      mealType,
      dietTags,
      minKcal: 50,
      maxKcal: 2500,
      excludeIds: new Set(),
      hardExcludeIds: tvrdeVylouceno,
      limit: 48,
      simpleStartMode: true,
      bodyMetrics,
    }, slotTarget);

    if (!row && Array.isArray(START_CATALOG_SOURCE_FILTER) && START_CATALOG_SOURCE_FILTER.length) {
      const emergency = await fetchCatalogCandidates({
        mealType,
        dietTags,
        minKcal: 50,
        maxKcal: 2500,
        excludeIds: new Set(),
        hardExcludeIds: tvrdeVylouceno,
        limit: 48,
        shuffle: false,
        simpleStartMode: true,
        bodyMetrics,
      });
      row = pickClosestCatalogRow(emergency, slotTarget, { mealType }) || emergency[0] || null;
    }

    if (row) {
      console.error('[catalog-simple-start] emergency pick used', {
        catalog_id: row.id,
        name_cs: row.name_cs,
        source: row.source,
        kcal: row.kcal,
      });
    }
  }

  if (!row) {
    console.error('[catalog-simple-start] CRITICAL: no catalog meal for slot', {
      meal_type: mealType,
      agent_name: slotMeal?.name_cs ?? null,
    });
    return { row: null, meal: null };
  }

  const scaled = scaleMealToTarget(
    {
      kcal: row.kcal,
      protein_g: row.protein_g,
      carbs_g: row.carbs_g,
      fat_g: row.fat_g,
    },
    slotTarget
  );

  const meal = catalogRowToStructuredMeal(row, slotMeal, scaled);

  // POSLEDNÍ KONTROLA NAD VŠEMI STUPNI ESKALACE.
  //
  // Nad tímhle returnem je šest stupňů výběru včetně „emergency pick“, který
  // pouští `excludeIds: new Set()` a pásmo 50–2500 kcal. Všechny sice předávají
  // `dietTags`, ale právě prázdné `dietTags` byla ta chyba z 10. 8. 2026 —
  // filtr na dietě, která do něj nedorazila, nefiltruje nic. Tady se to ověří
  // na HOTOVÉM jídle, ne na parametrech dotazu, takže selže i tehdy, když se
  // dieta ztratí někde po cestě.
  const dietVerdict = checkCandidateAgainstDiet(meal, dietRulesForSlot);
  if (!dietVerdict.ok) {
    console.error('[catalog-simple-start] vybrany recept porusuje dietu — zahazuji', {
      catalog_id: row.id,
      name_cs: row.name_cs,
      meal_type: mealType,
      diet_type: dietRulesForSlot.dietType,
      diet_tags_requested: dietTags,
      code: dietVerdict.code,
      matched_term: dietVerdict.matched_term,
    });
    return { row: null, meal: null };
  }

  return { row, meal };
}

/**
 * Hlavní swap: jídla z recipes_catalog místo Spoonacular.
 * @param {object} mealPlan
 * @param {string} dietType
 * @param {object} opts
 */
export async function resolveMealsFromCatalog(mealPlan, dietType, opts = {}) {
  const bodyMetrics = opts.bodyMetrics ?? null;
  const targets = opts.targets ?? {};
  const dailyTarget = Number(targets.calories_per_day) || Number(bodyMetrics?.calories_target) || 2200;
  const mealsPerDay = bodyMetricsToPlanInput(bodyMetrics)?.meals_per_day ?? 3;
  const dietTags = dietTagsFromProfile(bodyMetrics, dietType);
  const dietRules = buildDietaryPublishRules(bodyMetrics);
  // Dieta musí být vidět v logu hned na začátku skládání. Do 10. 8. 2026 se
  // logovala až jako `dietTags: []` u varování o nedostatku kandidátů, takže
  // z 2086 řádků nešlo poznat, že se katalogu na dietu nikdo nezeptal.
  console.log('[catalog] resolveMealsFromCatalog diet', {
    diet_type_arg: dietType ?? null,
    diet_type_profile: bodyMetrics?.diet_type ?? null,
    diet_tags: dietTags,
  });
  const simpleStartMode = opts.simpleStartMode === true;
  const usedCatalogIds = new Set();
  /** catalog_id → kolikrát už je v tomhle týdnu použitý. Strop drží tvrdě. */
  const pouzitiZaTyden = new Map();
  /** základ názvu → kolikrát v týdnu. Hlídá jídlo, ne porcovou variantu. */
  const pouzitiZakladuZaTyden = new Map();
  const resolved = [];
  let verified = 0;
  let unverified = 0;
  let startFallbackCount = 0;
  const validFromIso = opts.validFrom ?? opts.valid_from ?? null;
  const catalogPickSeed = opts.catalogPickSeed ?? computeCatalogPickSeed(bodyMetrics?.user_id, validFromIso);

  if (simpleStartMode) {
    console.log('[catalog-simple-start] resolveMealsFromCatalog simpleStartMode active', {
      planner_source: mealPlan?.planner_source ?? null,
    });
  }

  /** Pool for honesty fill extras — snacks + denser mains (all plan modes). */
  let catalogFillCandidates = [];
  try {
    const [snacks, lunches, dinners] = await Promise.all([
      fetchCatalogCandidates({
        mealType: 'snack',
        dietTags,
        minKcal: 180,
        maxKcal: 700,
        limit: 24,
        shuffle: false,
        simpleStartMode,
        bodyMetrics,
      }),
      fetchCatalogCandidates({
        mealType: 'lunch',
        dietTags,
        minKcal: 400,
        maxKcal: 900,
        limit: 16,
        shuffle: false,
        simpleStartMode,
        bodyMetrics,
      }),
      fetchCatalogCandidates({
        mealType: 'dinner',
        dietTags,
        minKcal: 350,
        maxKcal: 850,
        limit: 12,
        shuffle: false,
        simpleStartMode,
        bodyMetrics,
      }),
    ]);
    catalogFillCandidates = [...(snacks || []), ...(lunches || []), ...(dinners || [])];
  } catch (err) {
    console.warn('[catalog-resolve] fill candidates fetch failed', err?.message || err);
    catalogFillCandidates = [];
  }

  const slotCtx = {
    bodyMetrics: { ...bodyMetrics, meals_per_day: mealsPerDay },
    targets,
    dailyTarget,
    mealsPerDay,
    dietTags,
    usedCatalogIds,
    pouzitiZaTyden,
    pouzitiZakladuZaTyden,
    catalogPickSeed,
    simpleStartMode,
  };

  for (const day of mealPlan?.days ?? []) {
    const dayMeals = [];
    const dayIndex = Number(day.day_index) || 0;
    // Resetuje se každý den. Drží tvrdé pravidlo „stejný recept ne dvakrát
    // v jednom dni“ i ve chvíli, kdy týdenní vyloučení musí padnout.
    const usedTodayIds = new Set();

    for (let mi = 0; mi < (day.meals ?? []).length; mi++) {
      const m = day.meals[mi];
      const slotSalt = dayIndex * 17 + mi * 3 + (m.type === 'snack' ? 11 : m.type === 'breakfast' ? 1 : m.type === 'dinner' ? 7 : 5);
      const { row, meal } = await resolveScaledCatalogSlot(m, { ...slotCtx, slotSalt, usedTodayIds });

      if (!meal) {
        // Pozor na formulaci: tady ještě NENÍ rozhodnuto, že se plán nedoručí —
        // pod objednávkou se zkouší START knihovna. Dokud tu stálo „plán se
        // nedoručí“, log tvrdil něco, co po fallbacku nebyla pravda.
        console.warn('[catalog-resolve] slot z katalogu nevyresen', {
          day_index: dayIndex,
          meal_index: mi,
          meal_type: m.type || 'lunch',
          agent_name: m.name_cs ?? null,
          diet_tags: dietTags,
          simple_start_mode: simpleStartMode,
        });
        // Tvrdá díra: plán se nedoručí. Objednáme recepty, ať se totéž neopakuje
        // příští týden. Await schválně — objednávka je levná a nesmí se ztratit
        // tím, že výjimka ukončí request dřív, než se stihne zapsat.
        // `m.type` je anglický slot plánu, fronta i log poptávky mají na
        // meal_type CHECK s českými hodnotami. Fallback `|| 'lunch'` tady
        // původně posílal do obou tabulek hodnotu, kterou ani jedna nepřijme —
        // fronta ji odmítla (a chyba se spolkla v .catch níž), poptávka by ji
        // vzala tiše a shodila cron až druhý den. Normalizuje se proto přes
        // existující mapování; neznámý slot navíc nahlásí varování.
        const catalogSlotType = catalogMealTypeProZapis(m.type, 'unresolved-slot');

        await objednejZNevyresenehoSlotu({
          mealType: catalogSlotType,
          dietTags,
          slotTargetKcal: Number(m?.target_kcal) || null,
        }).catch((e) => console.warn('[catalog] objednavka receptu selhala', e?.message));

        // Tvrdou díru zapíšeme i do logu poptávky — objednávka sama neřekne,
        // kolikrát na tuhle kombinaci narazily různé plány, a právě z toho
        // staví fill_recipe_queue_from_demand prioritu. Pásmo se odvozuje
        // stejně jako v objednejZNevyresenehoSlotu (rozsah škálování 0,5–2,0×).
        {
          const cil = Number(m?.target_kcal);
          const maCil = Number.isFinite(cil) && cil > 0;
          await zalogujPoptavkuSlotu({
            mealType: catalogSlotType,
            dietTags,
            kcalMin: maCil ? Math.round(cil / 2) : 200,
            kcalMax: maCil ? Math.round(cil * 2) : 900,
            kandidatu: 0,
            limit: 1,
            nevyreseno: true,
          }).catch((e) => console.warn('[catalog] log poptavky selhal', e?.message));
        }

        // NEŽ PLÁN ZAHODÍME, ZKUSÍME START KNIHOVNU.
        //
        // Původně se tady rovnou házela výjimka s odůvodněním „prázdné jídlo se
        // do plánu nikdy nedostane, radši plán nedoručíme“. To platí pro prázdné
        // jídlo, ale knihovní jídlo prázdné není: má reálná makra ze snapshotu
        // katalogu, projde dietní bránou a je to totéž, co používá opravná větev
        // brány. Pro bezlepkového uživatele je rozdíl mezi „bezpečný plán
        // z knihovny“ a „žádný plán“, ne mezi dobrým a špatným plánem.
        //
        // Změřeno na produkci 10. 8. 2026, po tag filtru a START filtru:
        //   gluten_free  snídaně 1, obědy 1, VEČEŘE 0, svačiny 1
        //   low_carb     snídaně 4, obědy 4, VEČEŘE 0, svačiny 5
        // Nula večeří znamená, že tvrdý throw je pro tyhle diety zaručený —
        // a byl to on, ne dietní filtr, kdo je nechal bez jídelníčku.
        //
        // Objednávka do fronty výš zůstává: díra v katalogu je pořád díra
        // a tohle ji neopravuje, jen ji přestává platit uživatel.
        const fallback = resolveSimpleStartLocalSlot(
          m,
          Number(m?.target_kcal) || slotTargetKcal(
            dailyTarget,
            mealsPerDay,
            planMealTypeToWeightKey(m.type || 'lunch'),
          ),
          mi,
          bodyMetrics,
        );

        if (fallback?.meal && checkCandidateAgainstDiet(fallback.meal, dietRules).ok) {
          console.warn('[catalog-resolve] slot z katalogu nevyresen — beru START knihovnu', {
            day_index: dayIndex,
            meal_type: m.type || 'lunch',
            agent_name: m.name_cs ?? null,
            diet_tags: dietTags,
            fallback_name: fallback.meal.display_name_cs || fallback.meal.name_cs,
          });
          startFallbackCount += 1;
          dayMeals.push(fallback.meal);
          unverified++;
          continue;
        }

        // Ani knihovna nemá pro tuhle dietu čisté jídlo. Teď už plán opravdu
        // nedoručíme — porušit dietu je horší než nedoručit.
        console.error('[catalog-resolve] CATALOG_SLOT_UNRESOLVED — plán se nedoručí', {
          day_index: dayIndex,
          meal_type: m.type || 'lunch',
          agent_name: m.name_cs ?? null,
          diet_type: dietRules.dietType,
          diet_tags: dietTags,
          fallback_meal: fallback?.meal
            ? (fallback.meal.display_name_cs || fallback.meal.name_cs)
            : null,
          fallback_reason: fallback?.meal
            ? checkCandidateAgainstDiet(fallback.meal, dietRules).code
            : 'library_returned_null',
        });
        const err = new Error(
          `CATALOG_SLOT_UNRESOLVED: pro slot ${m.type || 'lunch'} (den ${dayIndex}) není recept, který projde dietou a vyloučenými potravinami.`
        );
        err.code = 'CATALOG_SLOT_UNRESOLVED';
        err.permanent = true;
        throw err;
      }

      if (row?.id) {
        applyCatalogRowDisplayNameToMeal(meal, row);
        const nameCheck = mealDisplayMatchesCatalogName(meal, row.name_cs || row.name_en);
        if (!nameCheck.ok) {
          const err = new Error(
            `CATALOG_NAME_MISMATCH: display "${nameCheck.display}" !== catalog "${nameCheck.catalog}" (id=${row.id})`
          );
          err.code = 'CATALOG_NAME_MISMATCH';
          err.permanent = true;
          throw err;
        }
        usedCatalogIds.add(row.id);
        usedTodayIds.add(row.id);
        pouzitiZaTyden.set(row.id, (pouzitiZaTyden.get(row.id) ?? 0) + 1);
        const zaklad = zakladNazvuJidla(row.name_cs);
        if (zaklad) pouzitiZakladuZaTyden.set(zaklad, (pouzitiZakladuZaTyden.get(zaklad) ?? 0) + 1);
        verified++;
      } else if (
        meal.catalog_source === 'start_safe_fallback'
        || meal.catalog_source === 'simple_start_fallback'
        || meal.catalog_source === 'simple_start_library'
      ) {
        startFallbackCount++;
        verified++;
      } else {
        unverified++;
      }
      dayMeals.push(meal);
    }

    const dayTarget = dailyTarget;
    const dayHonesty = fillDayCaloriesByAddingLibraryMeals(dayMeals, dayTarget, {
      exclusions: parseDietaryExclusions(bodyMetrics || {}),
      catalogFillCandidates,
      // Katalogoví kandidáti přicházejí profiltrovaní přes `dietTags`, ale
      // knihovní záloha uvnitř dopočtu ne — a ta do bezlepkového dne přisypala
      // pečivo. Predikát platí na obojí.
      dietFilter: (candidate) => checkCandidateAgainstDiet(candidate, dietRules).ok,
    });

    resolved.push({
      day_index: day.day_index,
      day_name: day.day_name,
      daily_target_kcal: dayTarget,
      meals: dayMeals,
      _day_kcal: sumScaledDayKcal(dayMeals),
      daily_achieved_kcal: dayHonesty?.achieved_kcal ?? sumScaledDayKcal(dayMeals),
      calorie_under_target: dayHonesty?.under_target === true,
      calorie_shortfall_kcal: dayHonesty?.shortfall_kcal ?? 0,
      _calorie_honesty: dayHonesty,
    });
  }

  topUpWeakestDays(resolved);

  for (const day of resolved) {
    const dayTarget = dailyTarget;
    const bandResult = enforceDayCalorieBand(day.meals, dayTarget, {
      tolerance: 0.10,
      catalogFillCandidates,
    });
    day.daily_target_kcal = dayTarget;
    day._day_kcal = bandResult.achieved_kcal;
    day.daily_achieved_kcal = bandResult.achieved_kcal;
    day.calorie_under_target = bandResult.under_target === true;
    day.calorie_over_target = bandResult.within_band === false && (bandResult.over_target_kcal || 0) > 0;
    day.calorie_shortfall_kcal = bandResult.shortfall_kcal ?? 0;
    if (day._calorie_honesty) {
      Object.assign(day._calorie_honesty, bandResult, { target_kcal: dayTarget });
    }
  }

  if (verified === 0) {
    const err = new Error('CATALOG_EMPTY: recipes_catalog neobsahuje žádné použitelné recepty pro plán.');
    err.permanent = true;
    err.code = 'CATALOG_EMPTY';
    throw err;
  }

  resolved._diag = {
    spoonacular_requests_total: 0,
    meals_resolved_primary: verified,
    meals_resolved_fallback: startFallbackCount,
    meals_unverified: unverified,
    average_confidence_score: verified > 0 ? 1 : 0,
    catalog_used: true,
    catalog_recipes_used: usedCatalogIds.size,
    start_safe_fallback_meals: startFallbackCount,
    simple_start_mode: simpleStartMode,
    portion_scaling: true,
    meals_per_day: mealsPerDay,
  };

  // Poptávka nasbíraná při skládání jde do fronty generátoru TEĎ, dokud request
  // ještě žije. Selhání tady nesmí shodit hotový plán — objednávka se založí
  // znovu při příštím skládání, protože ta díra v katalogu nikam nezmizí.
  try {
    await odesliPoptavku();
  } catch (e) {
    console.warn('[catalog] odeslani poptavky selhalo', e?.message || e);
  }

  console.log('[catalog-resolve] resolveMealsFromCatalog complete', {
    SPOONACULAR_MODE: process.env.SPOONACULAR_MODE || 'off',
    spoonacular_http_calls: 0,
    catalog_recipes_used: usedCatalogIds.size,
    start_safe_fallback_meals: startFallbackCount,
    simple_start_mode: simpleStartMode,
    meals_verified: verified,
    meals_unverified: unverified,
    meals_per_day: mealsPerDay,
    daily_target: dailyTarget,
  });

  return resolved;
}

/**
 * Odhad meal_type z českého názvu (pro import z meal_metadata_cache).
 * @param {string} name
 * @returns {CatalogMealType}
 */
export function inferCatalogMealTypeFromCsName(name) {
  const n = String(name || '').toLowerCase();
  if (/smoothie|ovesn|jogurt|vejce|tvaroh|toast|müsli|muesli|palačink|omelet|kaše|snídan/i.test(n)) {
    return 'snidane';
  }
  if (/svačin|snack|ořech|jogurt s ořechy/i.test(n)) return 'svacina';
  if (/večeř|vecer|grilovaný losos$|ryba se zeleninou$/i.test(n)) return 'vecere';
  return 'obed';
}
