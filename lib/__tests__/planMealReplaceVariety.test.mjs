/**
 * ZÁMĚNA JÍDLA STŘÍDÁ POŘÁD DOKOLA JEN DVĚ JÍDLA — PROMPT_PRO_CODE.md bod C.
 *
 * PROČ TENHLE TEST EXISTUJE. Na produkci opakované klikání na "dát si něco
 * jiného" dávalo `Vejce s pečivem a zeleninou -> Ovesná kaše s proteinem ->
 * Vejce s pečivem… (donekonečna)`. Příčina: `pickSimpleStartMealAlternative()`
 * třídila kandidáty podle vzdálenosti od cílové kalorie a vždycky brala
 * `within[0]` — deterministicky nejbližší kus, pořád ten samý pár.
 *
 * OPRAVA: round-robin přes `within` podle `variationSeed` = kolikátá záměna
 * TOHOTO slotu (`replacement_attempt`, perzistované na jídle). NE
 * `Math.random()` (nemrvavé testy) a NE poziční seed jako `slotSalt`
 * v lib/recipesCatalog.js (ten je při opakovaném kliknutí na TENTÝŽ slot
 * pořád stejný, takže by picker vracel navěky jedno jídlo — hůř než dnes).
 *
 * DŮLEŽITÉ OMEZENÍ, NE ZÁRUKA. Množina `within` se s aktuálním jídlem mění
 * (aktuální je vždy vyloučené), takže round-robin přes ni typicky po pár
 * kolech sklouzne do cyklu mezi DVĚMA zbylými kandidáty — ověřeno níž na
 * reálných datech (`Ovesná kaše -> Šunka -> Vejce -> Šunka -> Vejce -> …`).
 * Garantuje se jen: (1) první záměna se nezmění (`within[0]`, dnešní
 * chování), (2) při >2 kandidátech v toleranci se za pár záměn ukáže víc
 * než dva různé kusy — ne že se ukážou VŠICHNI nebo že se cyklu nikdy
 * nedostane. U `standard/breakfast` je to přesně tenhle případ: 3 kandidáty
 * s knihovním receptem, všechny v toleranci cíle 440 kcal.
 *
 * STROP, KTERÝ TENHLE BOD NEZVEDÁ. U vegan diety má `pickSimpleStartMealAlternative`
 * s `requireLibraryRecipe: true` (jak ho volá `replaceMealInStructuredPlan`)
 * NULA kandidátů ve všech čtyřech typech jídel (důsledek #233 — žádná
 * vegan šablona v `SIMPLE_START_RECIPES` recept nemá) — záměna jídla u vegan
 * plánu skončí `NO_ALTERNATIVE` bez ohledu na round-robin. To je bod D
 * (chybějící recepty), round-robin na prázdné množině kandidátů nic nevytvoří.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { replaceMealInStructuredPlan } from '../planMealReplace.js';
import { pickSimpleStartMealAlternative } from '../simpleStartMealReplacement.js';

function planSJidlem(jidla, dailyTarget = 2200) {
  return {
    targets: { calories_per_day: dailyTarget },
    days: [{
      date: '2026-09-16',
      day_index: 0,
      day_name: 'Úterý',
      daily_target_kcal: dailyTarget,
      meals: jidla,
    }],
  };
}

// 5 jídel/den @ 2200 kcal -> slotTargetKcal(breakfast) = 440 kcal, přesný
// produkční scénář z PROMPT_PRO_CODE.md (ověřeno: standard/breakfast má
// s requireLibraryRecipe:true přesně 3 kandidáty s recept — Vejce, Ovesná
// kaše, Šunka — a všechny tři jsou v toleranci ±20 % z 440 kcal).
const DEN_5_JIDEL = () => ([
  { type: 'breakfast', name_cs: 'Vejce s pečivem a zeleninou', display_name_cs: 'Vejce s pečivem a zeleninou', kcal: 450, catalog_id: 308 },
  { type: 'lunch', name_cs: 'Kuře s rýží a zeleninou', display_name_cs: 'Kuře s rýží a zeleninou', kcal: 700, catalog_id: 401 },
  { type: 'snack', name_cs: 'Vlastní svačina A', display_name_cs: 'Vlastní svačina A', kcal: 250, catalog_id: 998 },
  { type: 'snack', name_cs: 'Vlastní svačina B', display_name_cs: 'Vlastní svačina B', kcal: 250, catalog_id: 999 },
  { type: 'dinner', name_cs: 'Losos se zeleninou', display_name_cs: 'Losos se zeleninou', kcal: 800, catalog_id: 403 },
]);
const bodyMetrics = { diet_type: 'standard', calories_target: 2200, meals_per_day: 5 };

// Přesně ta trojice, co picker pro standard/breakfast @ 440 kcal zná —
// ověřeno přímo přes pickSimpleStartMealAlternative (viz komentář výš).
const PLATNE_SNIDANE = new Set([
  'vejce s pečivem a zeleninou',
  'ovesná kaše s proteinem',
  'šunka, pečivo a zelenina',
]);

test('produkční nález: opakovaná záměna TÉHOŽ slotu dá víc než dvě různá jídla (dnes jen dvě, dokola)', async () => {
  const plan = planSJidlem(DEN_5_JIDEL());
  const titles = [];
  for (let i = 0; i < 6; i++) {
    const result = await replaceMealInStructuredPlan(plan, 0, 0, bodyMetrics);
    titles.push(String(result.new_title || '').toLowerCase());
  }
  const distinct = new Set(titles);
  assert.ok(
    distinct.size > 2,
    `za 6 záměn se ukázaly jen ${distinct.size} různá jídla: ${[...distinct].join(', ')}`
  );
  // Kalorická tolerance: picker nesmí vrátit nic mimo trojici, o které víme,
  // že je v toleranci cíle 440 kcal — kdyby round-robin sáhl mimo `within`,
  // objevilo by se tu čtvrté/páté jídlo z šablony bez ohledu na kalorie.
  for (const title of titles) {
    assert.ok(PLATNE_SNIDANE.has(title), `"${title}" není mezi kandidáty v kalorické toleranci`);
  }
});

test('replacement_attempt musí přežít záměnu — jinak round-robin degeneruje zpátky na within[0] navěky', async () => {
  const plan = planSJidlem(DEN_5_JIDEL());
  const ocekavane = [1, 2, 3, 4, 5];
  for (const cislo of ocekavane) {
    await replaceMealInStructuredPlan(plan, 0, 0, bodyMetrics);
    assert.equal(
      plan.days[0].meals[0].replacement_attempt,
      cislo,
      `po ${cislo}. záměně má day.meals[0].replacement_attempt být ${cislo}`
    );
  }
});

test('bez perzistence počítadla (simulace regrese) záměna spadne zpátky na nejvýš dvě jídla', async () => {
  // Simuluje přesně tu chybu, na kterou upozornil review: kdyby
  // `replacement_attempt` nepřežil zápis do `day.meals[mealIndex]`, každé
  // volání by dostalo `current.replacement_attempt === undefined` a
  // `variationSeed` by byl pořád 0 — vždycky `within[0]` vzhledem k tomu,
  // co je zrovna vyloučené (aktuální jídlo). Titulek se PŘESTO mění (dnešní
  // bug taky střídal dvě jídla, ne že by vracel pořád totéž) — degeneruje
  // to na stejný 2-cyklus jako před opravou, ne na jedno fixní jídlo.
  const plan = planSJidlem(DEN_5_JIDEL());
  const titles = [];
  for (let i = 0; i < 4; i++) {
    // Nulování PŘED každým voláním napodobuje "počítadlo se nepřenáší".
    if (plan.days[0].meals[0]) delete plan.days[0].meals[0].replacement_attempt;
    const result = await replaceMealInStructuredPlan(plan, 0, 0, bodyMetrics);
    titles.push(String(result.new_title || '').toLowerCase());
    delete plan.days[0].meals[0].replacement_attempt;
  }
  assert.ok(
    new Set(titles).size <= 2,
    `bez perzistovaného počítadla by nemělo jít potkat víc než 2 jídla, potkalo se ${new Set(titles).size}: ${titles.join(', ')}`
  );
});

test('pickSimpleStartMealAlternative: variationSeed=0 (výchozí) se chová jako dřív — nejbližší kalorický kandidát', () => {
  const bezSeedu = pickSimpleStartMealAlternative({
    mealType: 'breakfast',
    currentTitle: 'žádné takové jídlo neexistuje',
    bodyMetrics: { diet_type: 'standard' },
    targetKcal: 440,
    requireLibraryRecipe: true,
  });
  const seSeedem0 = pickSimpleStartMealAlternative({
    mealType: 'breakfast',
    currentTitle: 'žádné takové jídlo neexistuje',
    bodyMetrics: { diet_type: 'standard' },
    targetKcal: 440,
    requireLibraryRecipe: true,
    variationSeed: 0,
  });
  assert.equal(bezSeedu.title, seSeedem0.title);
  assert.equal(bezSeedu.title.toLowerCase(), 'vejce s pečivem a zeleninou', 'nejbližší kandidát k 440 kcal je Vejce (diff 10)');
});

test('pickSimpleStartMealAlternative: round-robin nikdy nevrátí kandidáta mimo kalorickou toleranci', () => {
  for (let seed = 0; seed < 10; seed++) {
    const vybrano = pickSimpleStartMealAlternative({
      mealType: 'breakfast',
      currentTitle: 'žádné takové jídlo neexistuje',
      bodyMetrics: { diet_type: 'standard' },
      targetKcal: 440,
      requireLibraryRecipe: true,
      variationSeed: seed,
    });
    assert.ok(vybrano, `seed ${seed}: mělo se něco vybrat`);
    assert.ok(
      Math.abs(vybrano.baseKcal - 440) <= 440 * 0.2,
      `seed ${seed}: "${vybrano.title}" (${vybrano.baseKcal} kcal) je mimo ±20 % z 440 kcal`
    );
  }
});

test('pickSimpleStartMealAlternative: se stejným poolem navštíví round-robin víc než jednoho kandidáta', () => {
  const videno = new Set();
  for (let seed = 0; seed < 3; seed++) {
    const vybrano = pickSimpleStartMealAlternative({
      mealType: 'breakfast',
      currentTitle: 'žádné takové jídlo neexistuje',
      bodyMetrics: { diet_type: 'standard' },
      targetKcal: 440,
      requireLibraryRecipe: true,
      variationSeed: seed,
    });
    videno.add(vybrano.title.toLowerCase());
  }
  assert.equal(videno.size, 3, 'tři různé seedy nad stejným poolem tří kandidátů musí trefit všechny tři');
});

test('pickSimpleStartMealAlternative: záporný nebo necelý variationSeed nespadne, jen se normalizuje', () => {
  for (const seed of [-1, -5, NaN, 1.7]) {
    const vybrano = pickSimpleStartMealAlternative({
      mealType: 'breakfast',
      currentTitle: 'žádné takové jídlo neexistuje',
      bodyMetrics: { diet_type: 'standard' },
      targetKcal: 440,
      requireLibraryRecipe: true,
      variationSeed: seed,
    });
    assert.ok(vybrano, `seed ${seed} nesmí shodit picker`);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Vegan strop — bod C ho nezvedá (viz hlavička souboru).
// ─────────────────────────────────────────────────────────────────────────

test('vegan: záměna zůstává NO_ALTERNATIVE i po opravě — round-robin na nulové množině nic nevytvoří', async () => {
  const veganDen = [
    { type: 'breakfast', name_cs: 'Ovesná kaše s ovocem', display_name_cs: 'Ovesná kaše s ovocem', kcal: 450, catalog_id: 501 },
    { type: 'lunch', name_cs: 'Čočka s rýží', display_name_cs: 'Čočka s rýží', kcal: 700, catalog_id: 502 },
    { type: 'snack', name_cs: 'Ořechy a ovoce', display_name_cs: 'Ořechy a ovoce', kcal: 300, catalog_id: 503 },
    { type: 'dinner', name_cs: 'Tofu se zeleninou', display_name_cs: 'Tofu se zeleninou', kcal: 800, catalog_id: 504 },
  ];
  const plan = planSJidlem(veganDen);
  const veganBodyMetrics = { diet_type: 'vegan', calories_target: 2200, meals_per_day: 4 };
  await assert.rejects(
    () => replaceMealInStructuredPlan(plan, 0, 0, veganBodyMetrics),
    /NO_ALTERNATIVE/,
    'vegan snídaně nemá s requireLibraryRecipe:true žádného kandidáta — round-robin to nezmění'
  );
});
