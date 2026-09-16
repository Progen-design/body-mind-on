/**
 * ZÁMĚNA JÍDLA STŘÍDÁ POŘÁD DOKOLA JEN DVĚ JÍDLA — PROMPT_PRO_CODE.md bod C.
 *
 * PROČ TENHLE TEST EXISTUJE. Na produkci opakované klikání na "dát si něco
 * jiného" dávalo `Vejce s pečivem a zeleninou -> Ovesná kaše s proteinem ->
 * Vejce s pečivem… (donekonečna)`. Příčina: `pickSimpleStartMealAlternative()`
 * třídila kandidáty podle vzdálenosti od cílové kalorie a vždycky brala
 * `within[0]` — deterministicky nejbližší kus, pořád ten samý pár.
 *
 * OPRAVA v1 (PR #237): round-robin přes `within` podle `variationSeed` =
 * kolikátá záměna TOHOTO slotu (`replacement_attempt`, perzistované na
 * jídle). NE `Math.random()` (nemrvavé testy) a NE poziční seed jako
 * `slotSalt` v lib/recipesCatalog.js (ten je při opakovaném kliknutí na
 * TENTÝŽ slot pořád stejný, takže by picker vracel navěky jedno jídlo —
 * hůř než dnes).
 *
 * DRUHÝ PRODUKČNÍ NÁLEZ, PO NASAZENÍ #237. `within` se v v1 počítalo
 * z `candidates`, které vylučovaly AKTUÁLNÍ jídlo — takže se seznam
 * (obsah i pořadí) s KAŽDOU záměnou přeskládal podle toho, co bylo zrovna
 * na talíři. Round-robin nad takhle pohyblivým seznamem zamkl paritu
 * `variationSeed` na dvojici kandidátů; třetí (`Cottage s pečivem` u
 * svačiny @ 308 kcal) se neukázal nikdy — 6 záměn dalo pořád jen 2 jídla,
 * přesně jako před #237.
 *
 * OPRAVA v2 (PR #238): kandidáti v toleranci se počítají NAD CELÝM poolem
 * (`stableUniverse` v lib/simpleStartMealReplacement.js) — aktuální jídlo
 * se z něj NEVYLUČUJE, takže seznam je pro daný slot+cíl+den STEJNÝ při
 * každém volání. Aktuální jídlo se přeskočí AŽ z hotové rotace. Za těchto
 * podmínek (cíl i ostatní jídla dne se mezi voláními nemění) rotace
 * navštíví KAŽDÉHO kandidáta v toleranci přesně jednou za N pokusů.
 *
 * OPRAVA v3 (PROMPT_PRO_CODE.md bod E, tenhle soubor) — DVĚ ODDĚLENÉ VĚCI
 * V JEDNOM PR:
 *
 *  1) `pickSimpleStartMealAlternative` měla VLASTNÍ, přísnou kontrolu
 *     receptu (`r.meal_type === type`), zatímco zbytek kódu
 *     (`buildStartSafeFallbackMeal`) už dávno používal
 *     `findSimpleStartRecipeByTitle()`, která při neshodě typu spadne na
 *     shodu podle názvu napříč VŠEMI typy. Naměřeno: 7 šablon má recept,
 *     který existuje, jen je otagovaný jiným meal_type (např. `Jogurt
 *     s ovocem` je recept pro snack, ale nabízí se i jako breakfast
 *     šablona) — s přísnou kontrolou byl picker pro ně slepý. Riziko
 *     kolize názvů napříč typy ověřeno: v celé knihovně je jediná
 *     (`Cottage s pečivem` 2×, obojí snack, 330 a 340 kcal) — fallback
 *     podle názvu proto nemůže sáhnout vedle na jiný typ.
 *  2) Práh tolerance `max(20 % cíle, 120 kcal)` místo čistého `20 %` —
 *     u nízkých cílů (svačina, večeře) je 20 % v absolutních kcal příliš
 *     úzké pásmo na šířku knihovny. POMÁHÁ JEN DO CÍLE ~2200 KCAL/DEN —
 *     od ~2800 kcal/den (typicky lunch/breakfast při nabírání svalů) je
 *     kandidátů v toleranci 0 při JAKÉMKOLI prahu, protože knihovna nemá
 *     dost kalorické šablony. To je samostatná vada (viz
 *     verify-start-calorie-consistency, 60 z 64 FAILů je na cíli
 *     3300 kcal/den) — tenhle práh ji neřeší.
 *
 * DOPLNĚK (PROMPT_PRO_CODE.md PR 1, 2026-09-17) — BOD D VYŘEŠEN. Předchozí
 * verze týhle hlavičky tu měla „STROP, KTERÝ TENHLE BOD PŘÍMO NEZVEDÁ":
 * vegan snack a dinner měly 0 kandidátů, protože OBĚ šablony v každém byly
 * bez knihovního receptu vůbec (ne jen s jiným meal_type jako u bodu 1 výš).
 * PR 1 doplnil všech 11 chybějících receptů do `SIMPLE_START_RECIPES`
 * (6 veganských) — vegan má teď nenulový počet kandidátů ve všech čtyřech
 * typech jídla. Test níž dřív hlídal, že snack zůstává `NO_ALTERNATIVE`;
 * teď hlídá opak.
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
// produkční scénář z PROMPT_PRO_CODE.md.
const DEN_5_JIDEL = () => ([
  { type: 'breakfast', name_cs: 'Vejce s pečivem a zeleninou', display_name_cs: 'Vejce s pečivem a zeleninou', kcal: 450, catalog_id: 308 },
  { type: 'lunch', name_cs: 'Kuře s rýží a zeleninou', display_name_cs: 'Kuře s rýží a zeleninou', kcal: 700, catalog_id: 401 },
  { type: 'snack', name_cs: 'Vlastní svačina A', display_name_cs: 'Vlastní svačina A', kcal: 250, catalog_id: 998 },
  { type: 'snack', name_cs: 'Vlastní svačina B', display_name_cs: 'Vlastní svačina B', kcal: 250, catalog_id: 999 },
  { type: 'dinner', name_cs: 'Losos se zeleninou', display_name_cs: 'Losos se zeleninou', kcal: 800, catalog_id: 403 },
]);
const bodyMetrics = { diet_type: 'standard', calories_target: 2200, meals_per_day: 5 };

// standard/breakfast @ 440 kcal, s opraveným lookupem a prahem max(20%,120):
// 5 kandidátů s receptem v toleranci — Vejce (450), Ovesná kaše (480),
// Cottage s pečivem (340, nový díky opravě E1: recept je snack, šablona
// breakfast), Šunka (400), Tvaroh s vločkami a banánem (405, nový —
// PROMPT_PRO_CODE.md PR 1 doplnil recept, dřív šablona bez receptu
// vůbec vypadla přes requireLibraryRecipe). Ověřeno přímo přes
// pickSimpleStartMealAlternative.
const PLATNE_SNIDANE = new Set([
  'vejce s pečivem a zeleninou',
  'ovesná kaše s proteinem',
  'cottage s pečivem',
  'šunka, pečivo a zelenina',
  'tvaroh s vločkami a banánem',
]);

test('snídaně: opakovaná záměna TÉHOŽ slotu projde všechny kandidáty v pravidelné rotaci', async () => {
  const plan = planSJidlem(DEN_5_JIDEL());
  const titles = [];
  for (let i = 0; i < 8; i++) {
    const result = await replaceMealInStructuredPlan(plan, 0, 0, bodyMetrics);
    titles.push(String(result.new_title || '').toLowerCase());
  }
  const distinct = new Set(titles);
  assert.equal(
    distinct.size, 5,
    `za 8 záměn se mělo ukázat všech 5 kandidátů, ukázalo se ${distinct.size}: ${[...distinct].join(', ')}`
  );
  for (const title of titles) {
    assert.ok(PLATNE_SNIDANE.has(title), `"${title}" není mezi kandidáty v kalorické toleranci`);
  }
});

// 5 jídel/den @ 2200 kcal, druhý snack -> slotTargetKcal(snack) = 308 kcal.
// standard/snack @ 308 kcal, s opraveným lookupem a prahem max(20%,120):
// 7 kandidátů v toleranci (bylo 3 se starou ±20 % tolerancí a starým,
// přísným lookupem) — Kefír a pečivo (320), Cottage s pečivem (340),
// Vejce natvrdo se zeleninou (260), Jogurt s ovocem (220, nový: E1 —
// recept je snack, tohle uz snack je, ale byl vyrazen kvuli tomu ze
// SOUCASNE jidlo melo stejny nazev... viz DEN_PRO_SVACINU nize), Šunka,
// pečivo a zelenina (400, nová: E1 — recept je breakfast), Proteinový
// nápoj a banán (420, nový: E2 — práh, mimo staré ±20 % ale v novém
// max(20%,120)), Tvaroh s ovocem (233, nový — PROMPT_PRO_CODE.md PR 1
// doplnil recept, dřív šablona bez receptu vůbec vypadla přes
// requireLibraryRecipe).
const DEN_PRO_SVACINU = () => ([
  { type: 'breakfast', name_cs: 'Vejce s pečivem a zeleninou', display_name_cs: 'Vejce s pečivem a zeleninou', kcal: 450, catalog_id: 308 },
  { type: 'lunch', name_cs: 'Kuře s rýží a zeleninou', display_name_cs: 'Kuře s rýží a zeleninou', kcal: 700, catalog_id: 401 },
  { type: 'snack', name_cs: 'Vlastní svačina A', display_name_cs: 'Vlastní svačina A', kcal: 250, catalog_id: 998 },
  { type: 'snack', name_cs: 'Vlastní svačina B', display_name_cs: 'Vlastní svačina B', kcal: 250, catalog_id: 999 },
  { type: 'dinner', name_cs: 'Losos se zeleninou', display_name_cs: 'Losos se zeleninou', kcal: 800, catalog_id: 403 },
]);
const PLATNE_SVACINY = new Set([
  'kefír a pečivo',
  'cottage s pečivem',
  'vejce natvrdo se zeleninou',
  'jogurt s ovocem',
  'šunka, pečivo a zelenina',
  'proteinový nápoj a banán',
  'tvaroh s ovocem',
]);

test('svačina: 6 záměn po sobě na témže slotu dá 6 různých jídel z 7 kandidátů (bylo jen 2, pak 3 po #237)', async () => {
  const plan = planSJidlem(DEN_PRO_SVACINU());
  const titles = [];
  for (let i = 0; i < 6; i++) {
    const result = await replaceMealInStructuredPlan(plan, 0, 2, bodyMetrics);
    titles.push(String(result.new_title || '').toLowerCase());
  }
  const distinct = new Set(titles);
  assert.equal(
    distinct.size, 6,
    `za 6 záměn se mělo ukázat 6 různých jídel (ze 7 kandidátů), ukázalo se ${distinct.size}: ${[...distinct].join(', ')}`
  );
  for (const title of titles) {
    assert.ok(PLATNE_SVACINY.has(title), `"${title}" není mezi kandidáty v kalorické toleranci`);
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

test('pickSimpleStartMealAlternative: excludeTitles obsahující AKTUÁLNÍ jídlo nesmí rozhodit stabilní seznam', () => {
  // Přesně to, co posílá lib/planMealReplace.js: `excludeTitles` = všechna
  // dnešní jídla, VČETNĚ toho, co je zrovna v TOMHLE slotu. Kořen druhého
  // produkčního nálezu (viz hlavička souboru): kdyby se tohle nefiltrovalo,
  // stabilní seznam by se s každou záměnou přeskládal stejně jako `within`
  // v PR #237.
  const bezSoucasnehoVExclude = pickSimpleStartMealAlternative({
    mealType: 'snack',
    currentTitle: 'Jogurt s ovocem',
    bodyMetrics: { diet_type: 'standard' },
    excludeTitles: ['Vlastní svačina B'],
    targetKcal: 308,
    requireLibraryRecipe: true,
    variationSeed: 1,
  });
  const seSoucasnymVExclude = pickSimpleStartMealAlternative({
    mealType: 'snack',
    currentTitle: 'Jogurt s ovocem',
    bodyMetrics: { diet_type: 'standard' },
    excludeTitles: ['Jogurt s ovocem', 'Vlastní svačina B'],
    targetKcal: 308,
    requireLibraryRecipe: true,
    variationSeed: 1,
  });
  assert.equal(
    bezSoucasnehoVExclude.title,
    seSoucasnymVExclude.title,
    'přítomnost aktuálního jídla v excludeTitles nesmí změnit výsledek rotace'
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

test('pickSimpleStartMealAlternative: round-robin nikdy nevrátí kandidáta mimo kalorickou toleranci (max(20 %, 120 kcal))', () => {
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
      Math.abs(vybrano.baseKcal - 440) <= Math.max(440 * 0.2, 120),
      `seed ${seed}: "${vybrano.title}" (${vybrano.baseKcal} kcal) je mimo max(20 %, 120 kcal) z 440 kcal`
    );
  }
});

test('pickSimpleStartMealAlternative: se stejným poolem navštíví round-robin všechny 4 kandidáty', () => {
  const videno = new Set();
  for (let seed = 0; seed < 4; seed++) {
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
  assert.equal(videno.size, 4, 'čtyři různé seedy nad stejným poolem čtyř kandidátů musí trefit všechny čtyři');
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
// PROMPT_PRO_CODE.md bod E — oprava lookupu (findSimpleStartRecipeByTitle).
// ─────────────────────────────────────────────────────────────────────────

test('E1: Jogurt s ovocem (recept otagovaný snack) je použitelný kandidát i pro breakfast', () => {
  // Šablona standard/breakfast nabízí "Jogurt s ovocem", ale
  // SIMPLE_START_RECIPES ho má jen pod meal_type: 'snack'. Před opravou
  // (r.meal_type === type) byl pro picker neviditelný — requireLibraryRecipe
  // by ho vyřadilo úplně, bez ohledu na kalorickou toleranci.
  const OSTATNI_SNIDANE = [
    'Tvaroh s vločkami a banánem',
    'Vejce s pečivem a zeleninou',
    'Ovesná kaše s proteinem',
    'Cottage s pečivem',
    'Šunka, pečivo a zelenina',
  ];
  const vybrano = pickSimpleStartMealAlternative({
    mealType: 'breakfast',
    currentTitle: 'nic-takoveho-neexistuje',
    bodyMetrics: { diet_type: 'standard' },
    excludeTitles: OSTATNI_SNIDANE, // vyřadí všechny ostatní kandidáty
    requireLibraryRecipe: true,
    // Bez targetKcal — ověřuje se PŘÍTOMNOST kandidáta, ne tolerance.
  });
  assert.ok(vybrano, '"Jogurt s ovocem" mělo zůstat jako jediný nevyřazený kandidát');
  assert.equal(vybrano.title, 'Jogurt s ovocem');
  assert.ok(vybrano.lib, 'kandidát musí mít nalezený knihovní recept (lib truthy)');
  assert.equal(vybrano.lib.meal_type, 'snack', 'recept je otagovaný jako snack — lookup ho přesto najde pro breakfast slot');
});

test('E1: kolize názvu napříč typy (Cottage s pečivem, 2×, obojí snack) nesahá na jiný typ', () => {
  // Ověření z review: jediná kolize v celé knihovně je v rámci JEDNOHO typu
  // (snack/snack), takže title-only fallback nemůže omylem vrátit recept
  // jiného typu pro tenhle konkrétní název.
  const recept = pickSimpleStartMealAlternative({
    mealType: 'snack',
    currentTitle: 'nic-takoveho-neexistuje',
    bodyMetrics: { diet_type: 'standard' },
    excludeTitles: ['Tvaroh s ovocem', 'Sendvič se šunkou', 'Vejce natvrdo se zeleninou', 'Kefír a pečivo', 'Fazole s rýží', 'Jogurt s ovocem', 'Proteinový nápoj a banán', 'Rýže s tuňákem', 'Cottage s ořechy a pečivem', 'Ovesné vločky s tvarohem'],
    requireLibraryRecipe: true,
  });
  assert.ok(recept, 'Cottage s pečivem mělo zůstat jako jediný nevyřazený kandidát pro snack');
  assert.equal(recept.title, 'Cottage s pečivem');
  assert.equal(recept.lib.meal_type, 'snack');
});

test('E2: práh max(20 %, 120 kcal) pustí svačinu, kterou by ±20 % vyřadilo (2200 kcal/5 jídel, cíl 308 kcal)', () => {
  const target = 308;
  const staraTolerance = target * 0.2; // 61,6 kcal
  // Sanity: test předpokládá, že Jogurt s ovocem (220 kcal) by starou
  // ±20% toleranci nesplnil — jinak by test o ničem nevypovídal.
  assert.ok(Math.abs(220 - target) > staraTolerance, 'sanity: 220 kcal by ±20 % z 308 kcal nemělo splnit');

  const videneTituly = new Set();
  for (let seed = 0; seed < 8; seed++) {
    const vybrano = pickSimpleStartMealAlternative({
      mealType: 'snack',
      currentTitle: 'nic-takoveho-neexistuje',
      bodyMetrics: { diet_type: 'standard' },
      targetKcal: target,
      requireLibraryRecipe: true,
      variationSeed: seed,
    });
    videneTituly.add(vybrano.title.toLowerCase());
  }
  assert.ok(
    videneTituly.has('jogurt s ovocem'),
    `Jogurt s ovocem musí být dosažitelný přes rozšířený práh tolerance — vidět: ${[...videneTituly].join(', ')}`
  );
  assert.ok(
    videneTituly.size > 3,
    `stará ±20 % tolerance dávala 3 kandidáty pro tenhle cíl, nová musí dát víc — je jich ${videneTituly.size}`
  );
});

test('E2: práh nepomáhá při vysokém cíli (2800+ kcal/den) — 0 kandidátů zůstává 0', () => {
  // Změřeno review: 2800/5 kcal lunch @784 kcal a 3300/5 kcal breakfast/lunch
  // @660/@924 kcal mají 0 kandidátů v toleranci s JAKÝMKOLI rozumným prahem —
  // to je strop kalorického rozsahu šablon (samostatná vada), ne něco, co
  // tenhle práh řeší. Test hlídá, že si o tom nikdo nebude nic myslet.
  for (const [mealType, target] of [['lunch', 784], ['breakfast', 660], ['lunch', 924]]) {
    const vybrano = pickSimpleStartMealAlternative({
      mealType,
      currentTitle: 'nic-takoveho-neexistuje',
      bodyMetrics: { diet_type: 'standard' },
      targetKcal: target,
      requireLibraryRecipe: true,
    });
    // Picker vždy něco vrátí (legacyFallback na nejbližší mimo toleranci),
    // ale nesmí to být uvnitř tolerance — tam žádný kandidát není.
    assert.ok(vybrano, `${mealType}@${target}: picker musí vrátit aspoň nejbližší mimo toleranci`);
    assert.ok(
      Math.abs(vybrano.baseKcal - target) > Math.max(target * 0.2, 120),
      `${mealType}@${target}: "${vybrano.title}" (${vybrano.baseKcal} kcal) je nečekaně V toleranci — strop kalorického rozsahu se posunul?`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Vegan strop — bod D (PROMPT_PRO_CODE.md PR 1) je teď vyřešený.
// ─────────────────────────────────────────────────────────────────────────

test('vegan snack: záměna teď uspěje — PR 1 doplnil recepty pro obě snack šablony', async () => {
  const veganDen = [
    { type: 'breakfast', name_cs: 'Ovesná kaše s ovocem', display_name_cs: 'Ovesná kaše s ovocem', kcal: 450, catalog_id: 501 },
    { type: 'lunch', name_cs: 'Fazole s rýží', display_name_cs: 'Fazole s rýží', kcal: 590, catalog_id: 502 },
    { type: 'snack', name_cs: 'Ořechy a ovoce', display_name_cs: 'Ořechy a ovoce', kcal: 300, catalog_id: 503 },
    { type: 'dinner', name_cs: 'Tofu se zeleninou', display_name_cs: 'Tofu se zeleninou', kcal: 800, catalog_id: 504 },
  ];
  const plan = planSJidlem(veganDen);
  const veganBodyMetrics = { diet_type: 'vegan', calories_target: 2200, meals_per_day: 4 };
  const result = await replaceMealInStructuredPlan(plan, 0, 2, veganBodyMetrics);
  assert.ok(
    ['Ovoce a ořechy', 'Hummus a pečivo'].includes(result.new_title),
    `očekávána jedna z nově doplněných vegan snack šablon, přišlo "${result.new_title}"`
  );
});

test('vegan dinner: záměna teď uspěje — PR 1 doplnil recepty pro obě dinner šablony', async () => {
  const veganDen = [
    { type: 'breakfast', name_cs: 'Ovesná kaše s ovocem', display_name_cs: 'Ovesná kaše s ovocem', kcal: 450, catalog_id: 501 },
    { type: 'lunch', name_cs: 'Fazole s rýží', display_name_cs: 'Fazole s rýží', kcal: 590, catalog_id: 502 },
    { type: 'snack', name_cs: 'Ořechy a ovoce', display_name_cs: 'Ořechy a ovoce', kcal: 300, catalog_id: 503 },
    { type: 'dinner', name_cs: 'Tofu se zeleninou', display_name_cs: 'Tofu se zeleninou', kcal: 800, catalog_id: 504 },
  ];
  const plan = planSJidlem(veganDen);
  const veganBodyMetrics = { diet_type: 'vegan', calories_target: 2200, meals_per_day: 4 };
  const result = await replaceMealInStructuredPlan(plan, 0, 3, veganBodyMetrics);
  assert.ok(
    ['Brambory se zeleninou', 'Rýže s fazolemi'].includes(result.new_title),
    `očekávána jedna z nově doplněných vegan dinner šablon, přišlo "${result.new_title}"`
  );
});

test('vegan breakfast: oprava lookupu odemkla jednoho kandidáta (Chleba s arašídovým máslem a banánem)', () => {
  // Před opravou 0 kandidátů (recept existuje, jen je otagovaný snack).
  // Netestuje se přes replaceMealInStructuredPlan — den výš má jen 2
  // vegan/breakfast šablony a obě by po záměně skončily jako "totéž jídlo"
  // kontrola by se pletla s isSameSimpleStartMeal; přímo přes picker je to
  // jednoznačné.
  const vybrano = pickSimpleStartMealAlternative({
    mealType: 'breakfast',
    currentTitle: 'Ovesná kaše s ovocem',
    bodyMetrics: { diet_type: 'vegan' },
    requireLibraryRecipe: true,
  });
  assert.ok(vybrano, 'vegan/breakfast má po opravě lookupu jednoho kandidáta');
  assert.equal(vybrano.title, 'Chleba s arašídovým máslem a banánem');
});
