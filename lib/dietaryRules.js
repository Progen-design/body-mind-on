/**
 * ČISTÁ DIETNÍ PRAVIDLA — bez plánovače, bez katalogu, bez DB.
 *
 * PROČ JE TO SAMOSTATNÝ MODUL. Do 10. 8. 2026 tohle všechno žilo
 * v lib/dietaryPublishGate.js, který kvůli `enforceDietaryPublishGate` importuje
 * plánovač i nouzové cesty. Jak jen ty cesty začaly dietu potřebovat UŽ PŘI
 * VÝBĚRU (a musely — jinak vyrábějí plán, který brána stejně odmítne), vznikl
 * kruhový import startSimpleMealFilter ↔ dietaryPublishGate.
 *
 * Pravidla jsou proto v listu závislostního grafu: importují jen
 * dietaryExclusions.js a dietCriticalTerms.js, a smí je importovat kdokoli.
 * V dietaryPublishGate.js zůstalo jen to, co opravdu potřebuje plánovač —
 * `enforceDietaryPublishGate`.
 */
import {
  parseDietaryExclusions,
  mealContainsExcludedFood,
  textContainsExcludedFood,
} from './dietaryExclusions.js';
import {
  findGlutenTerm,
  findRestrictedTerm,
  isExplicitlyGlutenFree,
  LOW_CARB_MAX_CARB_ENERGY_SHARE,
} from './dietCriticalTerms.js';

const MEAT_FISH_TERMS = [
  'maso', 'ryba', 'ryby', 'drubez', 'drůbež', 'kuře', 'kure', 'kuřec', 'kurec',
  'hověz', 'hovez', 'vepř', 'vepr', 'salmon', 'tuna', 'tuňák', 'tunak', 'losos',
  'chicken', 'beef', 'fish', 'meat', 'pork', 'turkey', 'bacon', 'šunka', 'sunka',
  'krůt', 'krut', 'jehněč', 'jehnec',
];

const VEGAN_EXTRA_TERMS = [
  'vejce', 'vejci', 'egg', 'mléko', 'mleko', 'milk', 'sýr', 'syr', 'cheese',
  'tvaroh', 'jogurt', 'yogurt', 'med', 'želatina', 'zelatina', 'gelatin',
  'smetan', 'slehack', 'butter', 'máslo', 'maslo', 'whey', 'casein',
];

// Lepkové výrazy, bezlepkové výjimky i produktové rozhodnutí o ovsu žijí
// v lib/dietCriticalTerms.js. Tady schválně žádný seznam není — brána byla
// jedno ze tří míst, kde stál vlastní.

/**
 * @param {object|null|undefined} bm
 */
export function buildDietaryPublishRules(bm) {
  const dietType = String(bm?.diet_type || 'standard').toLowerCase();
  const exclusions = parseDietaryExclusions(bm);
  const combined = [
    bm?.foods_to_avoid,
    bm?.dietary_restrictions,
    bm?.allergies,
  ].filter(Boolean).join(' ').toLowerCase();

  const glutenFree = dietType === 'gluten_free' || dietType === 'gluten-free'
    || combined.includes('lep') || combined.includes('gluten');
  const lactoseFree = dietType === 'lactose_free' || dietType === 'lactose-free'
    || exclusions.dairyExcluded
    || combined.includes('laktoz') || combined.includes('lactose');

  return {
    dietType,
    exclusions,
    glutenFree,
    lactoseFree,
    // Publikační brána low_carb NEBLOKUJE — makra jsou cíl, ne alergen, a jeden
    // uhlohydrátový oběd nikoho neohrozí. Je tu proto, aby `checkCandidateAgainstDiet`
    // umělo dietu zohlednit už při NAVRHOVÁNÍ slotů (viz hasAnyDietaryRestriction,
    // kde schválně nefiguruje).
    lowCarb: dietType === 'low_carb' || dietType === 'low-carb',
    vegetarian: dietType === 'vegetarian',
    vegan: dietType === 'vegan',
  };
}

/**
 * Co uživatel v plánu opravdu čte — názvy jídla a řádky surovin. Jazyk je
 * jedno: když v nákupním seznamu stojí „1 slice of wholemeal bread“, uživatel
 * to vidí a je to lepek.
 *
 * `recipe.title` tu ZÁMĚRNĚ NENÍ. Je to `row.name_en`, tedy anglický
 * marketingový název, a ten o složení nevypovídá: „Banana Bread Nice Cream“
 * (id 597) je zmrzlina z banánů, skořice a vlašských ořechů. Čtením názvu se
 * nic nezíská — u všech 16 receptů změřených 10. 8. 2026 je lepek v surovinách
 * — a prohraje se na falešných blocích. České názvy (`name_cs`,
 * `display_name_cs`) se čtou dál.
 */
/**
 * Profil → povinné `diet_tags` pro dotaz do recipes_catalog.
 *
 * Žije tady, ne v recipesCatalog.js, ze dvou důvodů: je to čisté dietní
 * pravidlo bez vazby na DB, a v recipesCatalog.js se nedala otestovat
 * (ten modul má `import … from './supabaseServer.js'` bez přípony, což holý
 * Node ESM nerozbalí).
 *
 * @param {object|null} bodyMetrics
 * @param {string} [dietType]
 * @returns {string[]}
 */
/**
 * Diety, u kterých je katalog tak tenký, že se musí povolit větší posun porce.
 *
 * `lactose_free` tu je schválně, i když ho `dietTagsFromProfile` nevrací —
 * bezlaktózová se neřeší tagem, ale bránou na suroviny. Pro tohle rozhodnutí
 * je ale podstatné, že uživatel MÁ omezení, ne jak se technicky vyhodnocuje.
 */
const RESTRIKTIVNI_DIETY = new Set([
  'gluten_free', 'gluten-free',
  'lactose_free', 'lactose-free',
  'low_carb', 'low-carb',
  'vegetarian',
]);

/**
 * Má profil restriktivní dietu?
 *
 * Čte se `diet_type` z profilu, ne dietní tagy — tagy `lactose_free` neznají
 * a `standard` je „nikdo nic neřekl“, ne dieta.
 *
 * @param {object|null|undefined} bodyMetrics
 * @param {string|null|undefined} [dietType] volitelné doplnění, nikdy nepřebíjí profil
 * @returns {boolean}
 */
export function maRestriktivniDietu(bodyMetrics, dietType = null) {
  const zProfilu = String(bodyMetrics?.diet_type || '').toLowerCase().trim();
  const explicitni = String(dietType || '').toLowerCase().trim();
  const d = zProfilu || (explicitni !== 'standard' ? explicitni : '');
  return RESTRIKTIVNI_DIETY.has(d);
}

export function dietTagsFromProfile(bodyMetrics, dietType) {
  // `'standard'` NENÍ odpověď, je to „nikdo nic neřekl“.
  //
  // Dřív tu stálo `dietType || bodyMetrics?.diet_type`. `'standard'` je ale
  // truthy, takže volající, který dietu zploštil, tím fallback na profil
  // vypnul — a bezlepkový uživatel dostal `[]`, tedy „žádné omezení“, ne
  // `['gluten_free']`. Přesně tak vzniklo `dietTags: []` v 16 katalogových
  // dotazech 10. 8. 2026 (viz komentář v lib/bodyMetricsToPlanInput.js).
  //
  // Profil je zdroj pravdy. Argument ho smí jen doplnit, nikdy přebít
  // hodnotou, která nic neříká.
  const explicit = String(dietType || '').toLowerCase().trim();
  const fromProfile = String(bodyMetrics?.diet_type || '').toLowerCase().trim();
  const d = (explicit && explicit !== 'standard') ? explicit : (fromProfile || explicit || 'standard');

  if (d === 'vegan') return ['vegan'];
  if (d === 'vegetarian') return ['vegetarian'];
  if (d === 'low_carb' || d === 'low-carb') return ['low_carb'];
  if (d === 'gluten_free' || d === 'gluten-free') return ['gluten_free'];
  return [];
}

function mealTextBlob(meal) {
  const parts = [
    meal?.display_name_cs,
    meal?.display_name,
    meal?.name_cs,
    meal?.name,
    meal?.title,
    meal?.recipe?.title_cs,
    meal?.ai_name,
  ];
  if (Array.isArray(meal?.shopping_ingredient_lines)) {
    parts.push(...meal.shopping_ingredient_lines.map((l) => (typeof l === 'string' ? l : l?.name || '')));
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function textHasAnyTerm(text, terms) {
  return findRestrictedTerm(text, terms) !== null;
}

/**
 * ANGLICKÁ FAKTA o jídle — surovinové názvy a původní řádky ze Spoonaculáru.
 *
 * PROČ brána čte i angličtinu. Změřeno na produkci 10. 8. 2026: proti tehdejšímu
 * českému seznamu neslo lepek jen v anglických datech 16 aktivních receptů —
 * český překlad ho zahodil. „Poached Egg With Spinach and Tomato“ je česky
 * „Smažené vejce se špenátem a rajčaty“, v tom není ani stopa po toustu, na
 * kterém to leží. Brána, která čte jen češtinu, je nejvýš tak dobrá jako
 * překlad. (Po doplnění českých výrazů zbyly dva — id 509 a 564, „english
 * muffin“ u vajec Benedikt. Číst angličtinu je pojistka proti dalším, ne
 * náhrada za český seznam.)
 *
 * PROČ TU NENÍ `name_en` ANI `recipe.title`. Anglický NÁZEV je marketing a
 * idiom, ne složení: „Banana Bread Nice Cream“ (id 597) je zmrzlina z banánů —
 * banán, skořice, vanilka, vlašské ořechy — a slovo „bread“ v názvu by ji
 * bezlepkovému uživateli sebralo. Naopak seznam surovin lže málokdy. U všech
 * 16 změřených receptů byl lepek v surovinách, ne jen v názvu, takže se čtením
 * názvu nic nezíská a prohraje se na falešných blocích.
 *
 * ČESKÝ název se čte dál (mealTextBlob) — ten uživatel opravdu čte.
 *
 * @param {object|null|undefined} meal
 * @returns {string}
 */
function mealEnglishFactBlob(meal) {
  /** @type {string[]} */
  const parts = [];
  for (const list of [meal?.recipe?.ingredients, meal?.ingredients]) {
    if (!Array.isArray(list)) continue;
    for (const ing of list) {
      if (!ing || typeof ing !== 'object') continue;
      if (ing.name_en) parts.push(String(ing.name_en));
      if (ing.original) parts.push(String(ing.original));
    }
  }
  return parts.join(' ');
}

/**
 * @param {string} csText text, který uživatel čte
 * @param {string} enFactText anglická surovinová data, když jsou
 * @returns {'gluten_free'|'gluten_free_source_en'|null}
 */
function glutenViolationCode(csText, enFactText) {
  // Označení „bezlepkový“ platí na CELÉ jídlo, ne na jednu jazykovou plochu.
  // Recept ho napíše jednou, typicky česky do názvu. Když se to vyhodnocovalo
  // zvlášť pro češtinu a zvlášť pro angličtinu, „Bezlepkový dýňový chléb“
  // (id 565) prošel českou kontrolou a spadl na anglické, protože jedna
  // surovina má v `original` větu „…to top off the bread“.
  const declaredGlutenFree = isExplicitlyGlutenFree(csText) || isExplicitlyGlutenFree(enFactText);
  if (declaredGlutenFree) return null;

  if (findGlutenTerm(csText)) return 'gluten_free';
  // Vlastní kód, ne 'gluten_free' — „lepek je vidět jen v angličtině“ je jiná
  // porucha (rozbitý překlad) než „lepek je v plánu“ a v logu se to nesmí
  // slít do jednoho.
  if (enFactText && findGlutenTerm(enFactText)) return 'gluten_free_source_en';
  return null;
}

/**
 * Porušení diety čitelné z HOLÉHO TEXTU. Používá se tam, kde není strukturovaný
 * plán — typicky nouzová HTML šablona, která ingredience vůbec nemá.
 *
 * @param {string} text jeden segment (řádek / položka), ne celý dokument
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {string|null}
 */
export function textDietaryViolation(text, rules) {
  const norm = String(text || '').toLowerCase();
  if (!norm) return null;

  if (rules.vegetarian && textHasAnyTerm(norm, MEAT_FISH_TERMS)) {
    return 'vegetarian_meat_fish';
  }
  if (rules.vegan && (textHasAnyTerm(norm, MEAT_FISH_TERMS) || textHasAnyTerm(norm, VEGAN_EXTRA_TERMS))) {
    return 'vegan_animal_product';
  }
  // Holý text anglická surovinová data nemá — proto druhý argument prázdný.
  if (rules.glutenFree) {
    const gluten = glutenViolationCode(norm, '');
    if (gluten) return gluten;
  }
  if (textContainsExcludedFood(norm, rules.exclusions)) {
    return rules.lactoseFree ? 'lactose_free' : 'dietary_exclusion';
  }
  return null;
}

/**
 * Porušení diety VČETNĚ TOHO, CO HO ZPŮSOBILO.
 *
 * `mealDietaryViolation` vrací jen kód, což při hledání příčiny nestačí:
 * 10. 8. 2026 mělo selhání bezlepkového plánu 2086 řádků logu a slovo „gluten“
 * v nich nebylo ani jednou. Kód říká KTERÁ dieta, `matched_term` říká PROČ.
 *
 * @param {object|null|undefined} meal
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {{ code: string, matched_term: string|null, meal_name: string|null }|null}
 */
export function describeMealDietaryViolation(meal, rules) {
  if (!meal) return null;
  const text = mealTextBlob(meal);
  // Stejný důvod jako u lepku: překlad umí zahodit i slaninu nebo ančovičky.
  const enFacts = mealEnglishFactBlob(meal);
  const bothLangs = `${text} ${enFacts}`;
  const name = meal.display_name_cs || meal.name_cs || meal.name || null;
  const hit = (code, matched_term) => ({ code, matched_term: matched_term ?? null, meal_name: name });

  if (rules.vegetarian) {
    const t = findRestrictedTerm(bothLangs, MEAT_FISH_TERMS);
    if (t) return hit('vegetarian_meat_fish', t);
  }
  if (rules.vegan) {
    const t = findRestrictedTerm(bothLangs, MEAT_FISH_TERMS)
      || findRestrictedTerm(bothLangs, VEGAN_EXTRA_TERMS);
    if (t) return hit('vegan_animal_product', t);
  }
  if (rules.glutenFree) {
    const code = glutenViolationCode(text, enFacts);
    if (code) {
      return hit(code, findGlutenTerm(code === 'gluten_free_source_en' ? enFacts : text));
    }
  }
  if (rules.lactoseFree && mealContainsExcludedFood(meal, rules.exclusions)) {
    return hit('lactose_free', firstExcludedTerm(meal, rules.exclusions));
  }
  if (mealContainsExcludedFood(meal, rules.exclusions)) {
    return hit('dietary_exclusion', firstExcludedTerm(meal, rules.exclusions));
  }
  for (const term of rules.exclusions.rawTerms || []) {
    if (term && textContainsExcludedFood(text, { blockedTerms: [term] })) {
      return hit('explicit_exclusion', term);
    }
  }
  return null;
}

/**
 * Který z vyloučených výrazů jídlo trefil — jen pro log, ne pro rozhodování.
 * @param {object} meal
 * @param {ReturnType<typeof buildDietaryPublishRules>['exclusions']} exclusions
 * @returns {string|null}
 */
function firstExcludedTerm(meal, exclusions) {
  for (const term of exclusions?.blockedTerms || []) {
    if (mealContainsExcludedFood(meal, { blockedTerms: [term] })) return term;
  }
  return null;
}

/**
 * @param {object|null|undefined} meal
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {string|null} violation code
 */
export function mealDietaryViolation(meal, rules) {
  return describeMealDietaryViolation(meal, rules)?.code ?? null;
}

/**
 * SMÍ TENHLE PODKLAD VZNIKNOUT PRO TUHLE DIETU?
 *
 * Používá se PŘED výběrem, ne po něm — v plánovači na šablony slotů a v obou
 * nouzových cestách na knihovnu a snapshot. Do 10. 8. 2026 dieta rozhodovala
 * až na hranici publikace, takže plánovač bezlepkovému uživateli navrhl
 * „Cottage s pečivem“, nouzová cesta to nahradila „Vejce s pečivem“ a brána
 * pak celý plán odmítla. Filtrovat až potom znamená vyrobit plán, který nemá
 * jak projít.
 *
 * TVRDÁ omezení jen. `low_carb` tu NENÍ — je to makrový cíl, ne alergen,
 * a jako tvrdé veto nechá uživatele bez plánu (viz `preferByMacros`).
 *
 * @param {object|null|undefined} candidate jídlo, šablona nebo snapshot řádek
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {{ ok: boolean, code: string|null, matched_term: string|null }}
 */
export function checkCandidateAgainstDiet(candidate, rules) {
  if (!candidate) return { ok: false, code: 'missing_candidate', matched_term: null };

  // Šablona nese jídlo ve `fallback_meal_template`; snapshot řádek má `title`.
  // Kontroluje se OBOJÍ — název šablony i to, z čeho se vyrobí.
  const surfaces = [candidate];
  if (candidate.fallback_meal_template) {
    surfaces.push({ name_cs: candidate.name_cs, ...candidate.fallback_meal_template });
  }
  if (candidate.title && !candidate.name_cs) {
    surfaces.push({ ...candidate, name_cs: candidate.title });
  }

  for (const surface of surfaces) {
    const v = describeMealDietaryViolation(surface, rules);
    if (v) return { ok: false, code: v.code, matched_term: v.matched_term };
  }

  return { ok: true, code: null, matched_term: null };
}

/**
 * MAKROVÁ PREFERENCE — `low_carb`. SCHVÁLNĚ NENÍ součástí
 * `checkCandidateAgainstDiet`.
 *
 * Lepek, laktóza, vegetariánství a vyloučené potraviny jsou TVRDÁ omezení:
 * porušit je znamená ohrozit zdraví nebo přesvědčení, takže se kvůli nim plán
 * radši nevydá. `low_carb` je CÍL, ne alergen — jeden uhlohydrátový oběd nikoho
 * neohrozí a publikační brána ho nikdy neblokovala.
 *
 * Změřeno na produkci 10. 8. 2026: kdyby se `low_carb` vymáhal stejně tvrdě,
 * zůstane nula večeří v katalogu (15 s tagem → 0 po START filtru) A nula
 * v knihovně, takže uživatel skončí bez plánu. Proto se používá k PREFERENCI:
 * `preferByMacros()` níž zúží nabídku jen tehdy, když po zúžení něco zbude.
 *
 * @param {object|null|undefined} candidate
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {boolean}
 */
export function candidateMatchesMacroPreference(candidate, rules) {
  if (!candidate || !rules?.lowCarb) return true;
  const macroSource = candidate.fallback_meal_template || candidate;
  const kcal = Number(macroSource.kcal ?? macroSource.calories);
  const carbs = Number(macroSource.carbs_g);
  if (!Number.isFinite(kcal) || kcal <= 0 || !Number.isFinite(carbs)) return true;
  return (carbs * 4) / kcal <= LOW_CARB_MAX_CARB_ENERGY_SHARE;
}

/**
 * Zúží nabídku podle makrové preference, ale NIKDY ji nevyprázdní.
 *
 * „Lepší méně kandidátů než nezkontrolovaný kandidát“ platí pro tvrdá omezení.
 * U preference platí obráceně: lepší horší makra než žádný plán.
 *
 * @template T
 * @param {T[]} candidates už profiltrované tvrdými omezeními
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {T[]}
 */
export function preferByMacros(candidates, rules) {
  if (!Array.isArray(candidates) || !candidates.length || !rules?.lowCarb) return candidates || [];
  const narrowed = candidates.filter((c) => candidateMatchesMacroPreference(c, rules));
  return narrowed.length ? narrowed : candidates;
}

/**
 * @param {object} planJson
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {Array<{ dayIndex: number, mealIndex: number, code: string }>}
 */
export function findDietaryViolations(planJson, rules) {
  const hits = [];
  const days = planJson?.days || [];
  for (let di = 0; di < days.length; di++) {
    const meals = days[di]?.meals || [];
    for (let mi = 0; mi < meals.length; mi++) {
      const v = describeMealDietaryViolation(meals[mi], rules);
      if (!v) continue;
      // `code` zůstává kvůli dosavadním volajícím; zbytek je pro log —
      // bez `matched_term` a `meal_name` se příčina hledá tři kola.
      hits.push({
        dayIndex: di,
        mealIndex: mi,
        code: v.code,
        day: days[di]?.day_name ?? di,
        meal_type: meals[mi]?.type ?? null,
        meal_name: v.meal_name,
        matched_term: v.matched_term,
      });
    }
  }
  return hits;
}

/**
 * Bloky, na kterých se HTML láme na „řádky“. Kontroluje se PO SEGMENTECH, ne
 * celý dokument najednou: jedno slovo „bezlepkový“ kdekoli v patičce by jinak
 * vybílilo celý plán, protože `isExplicitlyGlutenFreeVariant` je myšlená na
 * název jednoho jídla.
 */
const HTML_BLOK = /<(?:br|\/p|\/li|\/tr|\/td|\/th|\/h[1-6]|\/div)[^>]*>/gi;

/**
 * @param {string} html
 * @returns {string[]}
 */
export function planHtmlToTextSegments(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(HTML_BLOK, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * @param {string} html
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {Array<{ text: string, code: string }>}
 */
export function findDietaryViolationsInHtml(html, rules) {
  const hits = [];
  for (const segment of planHtmlToTextSegments(html)) {
    const code = textDietaryViolation(segment, rules);
    if (code) hits.push({ text: segment.slice(0, 120), code });
  }
  return hits;
}

/**
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {boolean} má uživatel vůbec nějaké dietní omezení?
 */
export function hasAnyDietaryRestriction(rules) {
  return !!(
    rules?.glutenFree
    || rules?.lactoseFree
    || rules?.vegetarian
    || rules?.vegan
    || rules?.exclusions?.dairyExcluded
    || rules?.exclusions?.cheeseExcluded
    || (rules?.exclusions?.blockedTerms || []).length > 0
    || (rules?.exclusions?.rawTerms || []).length > 0
  );
}

/**
 * BRÁNA NA HRANICI PUBLIKACE. Poslední kontrola předtím, než se plán dostane
 * k uživateli — ať přišel odkudkoli.
 *
 * PROČ NESTAČILA `enforceDietaryPublishGate`. Ta sedí UVNITŘ
 * runUnifiedPlanPipeline. 10. 8. 2026 pipeline bezlepkovému uživateli plán
 * správně odmítla ('Dietary publish gate failed'), načež nouzová větev
 * v api/body-metrics.js pipeline obešla, sáhla po statické HTML šabloně
 * a e-mail odeslala. Uživatel dostal plán s chlebem, těstovinami a ovesnými
 * vločkami. Kontrola uvnitř jedné cesty nehlídá cesty ostatní.
 *
 * ČÍM SE KONTROLUJE. Když je k dispozici strukturovaný plán, platí ON — je
 * autoritativní, kontroluje se po jídlech včetně ingrediencí a plán, který jím
 * prošel, se tu nesmí zablokovat podruhé kvůli hrubšímu textovému hledání.
 * Textový sken je až náhrada pro případ, kdy strukturovaný plán NENÍ, což je
 * přesně ta nouzová šablona.
 *
 * Bez podkladů (ani plán, ani HTML) i bez body_metrics se NEPUBLIKUJE. Neznámá
 * dieta se nesmí chovat jako žádná dieta — tak vznikla tahle díra.
 *
 * @param {{ planJson?: object|null, planHtml?: string|null, bm?: object|null }} p
 * @returns {{ ok: boolean, reason: string|null, checked: string, violations: number, sample: Array<object> }}
 */
export function assertPlanPublishableForDiet(p) {
  const planJson = p?.planJson ?? null;
  const planHtml = p?.planHtml ?? null;
  const bm = p?.bm ?? null;

  if (!bm) {
    return { ok: false, reason: 'no_body_metrics', checked: 'nothing', violations: 1, sample: [] };
  }

  const rules = buildDietaryPublishRules(bm);
  if (!hasAnyDietaryRestriction(rules)) {
    return { ok: true, reason: null, checked: 'no_restrictions', violations: 0, sample: [] };
  }

  if (planJson?.days?.length) {
    const hits = findDietaryViolations(planJson, rules);
    return {
      ok: hits.length === 0,
      reason: hits.length ? hits[0].code : null,
      checked: 'plan_json',
      violations: hits.length,
      sample: hits.slice(0, 5),
    };
  }

  if (planHtml && String(planHtml).trim()) {
    const hits = findDietaryViolationsInHtml(planHtml, rules);
    return {
      ok: hits.length === 0,
      reason: hits.length ? hits[0].code : null,
      checked: 'plan_html',
      violations: hits.length,
      sample: hits.slice(0, 5),
    };
  }

  return { ok: false, reason: 'nothing_to_verify', checked: 'nothing', violations: 1, sample: [] };
}
