/**
 * DIETNĚ KRITICKÉ VÝRAZY — jediný zdroj pravdy, a překlad ho nesmí obejít.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 10. 8. 2026 se měřilo na produkci a našly se dvě věci, které spolu souvisí:
 *
 *   1. Brána porovnávala podřetězcem (`text.includes`). Dokud byl seznam
 *      krátký a český, procházelo to. Při rozšíření o angličtinu by 'roll'
 *      našlo „rolled oats“ a zablokovalo 5 bezlepkových ovesných receptů,
 *      'bun' by našlo „a bunch of“ a zablokovalo dalších 6.
 *   2. Překlad zahazoval dietní informaci: polenta a grits (kukuřičné, tedy
 *      bezlepkové) se přeložily na „krupici“, která je pšeničná. Brána čte
 *      češtinu, takže je nejvýš tak dobrá jako překlad.
 *
 * Obojí je jedna a tatáž vada: dietní fakt se cestou k uživateli ztratí a nic
 * to nezkontroluje.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DIET_CRITICAL_GLOSSARY,
  GLUTEN_TERMS,
  OATS_TREATED_AS_GLUTEN_FREE,
  findFlattenedDietTerms,
  findGlutenTerm,
  matchesTerm,
  foldForMatch,
} from '../dietCriticalTerms.js';
import { buildDietaryPublishRules, mealDietaryViolation } from '../dietaryPublishGate.js';

const KOREN = join(import.meta.dirname, '..', '..');
const BEZ_LEPKU = buildDietaryPublishRules({ diet_type: 'gluten_free' });

/** Katalogový řádek → jídlo v takovém tvaru, v jakém ho brána vidí. */
function jidlo({ nameCs, nameEn = '', ingredients = [] }) {
  return {
    type: 'breakfast',
    name_cs: nameCs,
    display_name_cs: nameCs,
    shopping_ingredient_lines: ingredients.map((i) => i.original || i.name),
    recipe: { title: nameEn, ingredients },
  };
}

test('ROZHODNUTÍ 10. 8. 2026: oves je pro gluten_free bezlepkový', () => {
  // Oves lepek neobsahuje, běžně se ale kontaminuje při zpracování. Produktově
  // ho považujeme za bezlepkový. Kdyby se to mělo změnit, mění se to
  // v OATS_TREATED_AS_GLUTEN_FREE, ne tady.
  for (const term of OATS_TREATED_AS_GLUTEN_FREE) {
    assert.equal(
      GLUTEN_TERMS.includes(term),
      false,
      `„${term}“ se dostal do GLUTEN_TERMS — to je změna produktového rozhodnutí, ne úklid seznamu`
    );
  }

  // Změřené recepty z produkce, všechny s tagem gluten_free ze Spoonaculáru.
  const ovesne = [
    jidlo({
      nameCs: 'Čokoládová ovesná kaše',
      nameEn: 'Chocolate Oatmeal',
      ingredients: [
        { name: 'ovesné vločky', name_en: 'rolled oats', original: '1 cup rolled oats' },
        { name: 'kakao', name_en: 'cocoa powder', original: '1 tbsp cocoa powder' },
      ],
    }),
    jidlo({
      nameCs: 'Tiramisu ovesná kaše přes noc',
      nameEn: 'Tiramisu Overnight Oats',
      ingredients: [{ name: 'ovesné vločky', name_en: 'rolled oats', original: '50 g rolled oats' }],
    }),
  ];

  for (const meal of ovesne) {
    assert.equal(
      mealDietaryViolation(meal, BEZ_LEPKU),
      null,
      `„${meal.name_cs}“ musí bezlepkovému uživateli projít`
    );
  }
});

test('porovnává se na hranici slova, ne podřetězcem', () => {
  // Přesně ty případy, které by rozšíření seznamu o angličtinu rozbilo.
  assert.equal(matchesTerm(foldForMatch('rolled oats'), 'roll'), true, 'kontrola testu: prefix opravdu chytá');
  assert.equal(findGlutenTerm('1 cup rolled oats'), null, "'roll' nesmí najít „rolled oats“");
  assert.equal(findGlutenTerm('a bunch of scallions'), null, "'bun' nesmí najít „bunch“");
  assert.equal(findGlutenTerm('4 crab cakes'), null, "'cake' nesmí najít „crab cakes“");
  assert.equal(findGlutenTerm('200 g cheesecake filling'), null, "'cake' nesmí najít „cheesecake“");

  // A přitom pořád najde, co má — včetně české flexe.
  assert.ok(findGlutenTerm('celozrnný chléb'), 'chléb je lepek');
  assert.ok(findGlutenTerm('2 plátky chleba'), 'chleba je lepek (flexe)');
  assert.ok(findGlutenTerm('Těstoviny s kuřecím masem'), 'těstoviny jsou lepek');
  assert.ok(findGlutenTerm('psenicna mouka'), 'diakritika nesmí rozhodovat');
});

test('bezlepkové výjimky: co obsahuje lepkový podřetězec, ale lepek není', () => {
  assert.equal(findGlutenTerm('100 g buckwheat groats'), null, 'buckwheat obsahuje wheat, ale je to pohanka');
  assert.equal(findGlutenTerm('4 each white corn tortillas'), null, 'kukuřičná tortilla je bezlepková');
  assert.equal(findGlutenTerm('2 cups almond flour'), null, 'mandlová mouka je bezlepková');
  assert.equal(findGlutenTerm('rýžové nudle 100 g'), null, 'rýžové nudle jsou bezlepkové');
  assert.equal(findGlutenTerm('1 g maltodextrin'), null, "'malt' nesmí chytit maltodextrin");

  // Protějšky ale lepek jsou — jinak by výjimky propouštěly všechno.
  assert.ok(findGlutenTerm('4 flour tortillas'), 'pšeničná tortilla lepek je');
  assert.ok(findGlutenTerm('2 cups all-purpose flour'), 'obyčejná mouka lepek je');
  assert.ok(findGlutenTerm('200 g udon noodles'), 'udon lepek je');

  // Holé „noodles“ / „nudle“ v seznamu SCHVÁLNĚ nejsou: rýžové, pohankové
  // i shirataki nudle jsou bezlepkové, takže z názvu se to rozhodnout nedá.
  // Rozhoduje konkrétní výraz (udon, ramen, pasta), ne kategorie.
  assert.equal(findGlutenTerm('200 g nudle'), null);
});

test('brána vidí lepek, který přežil jen v angličtině', () => {
  // Tvar podle id 651 z produkce: česky „Lehká a jednoduchá alfredo omáčka“,
  // `original` počeštěné na „nudle“, a jediné, co lepek drží, je `name_en`.
  // V plánu uživatel nevidí ani jedno slovo, které by ho varovalo.
  const alfredo = jidlo({
    nameCs: 'Lehká a jednoduchá alfredo omáčka',
    nameEn: 'Light and Easy Alfredo',
    ingredients: [
      { name: 'nudle', name_en: 'pasta', original: '200 g nudle' },
      { name: 'smetana', name_en: 'cream', original: '100 ml smetana' },
    ],
  });
  assert.equal(
    mealDietaryViolation(alfredo, BEZ_LEPKU),
    'gluten_free_source_en',
    'lepek jen v name_en musí bránu zastavit, a s vlastním kódem'
  );

  // Tvar podle id 139: `original` zůstal anglický, takže ho uživatel v nákupním
  // seznamu čte — pak je to obyčejné porušení, ne vada překladu, a kód se od
  // předchozího případu musí lišit.
  const panko = jidlo({
    nameCs: 'Losos obalený fetou',
    nameEn: 'Feta Encrusted Salmon',
    ingredients: [{ name: 'strouhanka', name_en: 'panko breadcrumbs', original: '1/2 cup panko breadcrumbs' }],
  });
  assert.equal(mealDietaryViolation(panko, BEZ_LEPKU), 'gluten_free');
});

test('anglický NÁZEV se nečte — je to marketing, ne složení', () => {
  // id 597 „Banana Bread Nice Cream“ je zmrzlina z banánů. Slovo „bread“ je
  // v názvu idiom; kdyby ho brána brala jako fakt, sebrala by bezlepkovému
  // uživateli správný recept.
  const zmrzlina = jidlo({
    nameCs: 'Banánová zmrzlina',
    nameEn: 'Banana Bread Nice Cream',
    ingredients: [
      { name: 'banány', name_en: 'bananas', original: '3 Bananas, mashed' },
      { name: 'skořice', name_en: 'cinnamon', original: '1/2 teaspoon cinnamon' },
      { name: 'vlašské ořechy', name_en: 'walnuts', original: '2 tablespoons chopped walnuts' },
    ],
  });
  assert.equal(mealDietaryViolation(zmrzlina, BEZ_LEPKU), null);
});

test('kategorie nerozhoduje o lepku — rozhoduje surovina', () => {
  // Změřeno na produkci 10. 8. 2026: tyhle tři recepty mají tag gluten_free
  // správně a brána je blokovala. Muffinová forma není pečivo a placička není
  // koláč.
  const frittata = jidlo({
    nameCs: 'Předkrmy: Muffiny z frittaty',
    nameEn: 'Finger Foods: Frittata Muffins',
    ingredients: [
      { name: 'broccoli', name_en: 'broccoli', original: '3/4 cup chopped, cooked broccoli' },
      { name: 'eggs', name_en: 'eggs', original: '6 eggs' },
      { name: 'cheddar cheese', name_en: 'cheddar cheese', original: '1/2 cup shredded cheddar cheese' },
    ],
  });
  assert.equal(mealDietaryViolation(frittata, BEZ_LEPKU), null, 'id 47 je bezlepkový');

  const proteinove = jidlo({
    nameCs: 'Čokoládové proteinové muffiny',
    nameEn: 'Decadent Chocolate Protein Muffins',
    ingredients: [
      { name: 'banány', name_en: 'bananas', original: '2 ripe bananas, peeled' },
      { name: 'konopný proteinový prášek', name_en: 'hemp protein powder', original: '1/3 cup hemp protein powder' },
      { name: 'mletá lněná semínka', name_en: 'ground flax seed', original: '2 tablespoons ground flax seed' },
    ],
  });
  assert.equal(mealDietaryViolation(proteinove, BEZ_LEPKU), null, 'id 548 je bezlepkový');

  // Ale anglický muffin pečivo je a lepek nese.
  assert.ok(findGlutenTerm('2 toasted english muffins'), 'english muffin lepek je');
  // A když je v muffinech mouka, chytí je to přes surovinu.
  assert.ok(findGlutenTerm('muffiny: 200 g pšeničné mouky'), 'mouka lepek je');
});

test('vlastní označení „bezlepkový“ platí na celé jídlo, ne na jazyk', () => {
  // id 565: česky „Bezlepkový dýňový chléb“, ale jedna surovina má v `original`
  // větu „…to top off the bread“. Kontrola po jazycích ho blokovala.
  const bezlepkovyChleb = jidlo({
    nameCs: 'Bezlepkový dýňový chléb s kořením',
    nameEn: 'Gluten Free Pumpkin Spiced Breakfast Bread',
    ingredients: [
      { name: 'kokosová mouka', name_en: 'coconut flour', original: '1/4 cup coconut flour' },
      { name: 'dýňová semínka', name_en: 'pumpkin seeds', original: 'a small handful of pumpkin seeds to top off the bread' },
    ],
  });
  assert.equal(mealDietaryViolation(bezlepkovyChleb, BEZ_LEPKU), null);
});

test('brána má pravdu, když je tag špatný', () => {
  // id 617 „Losos na španělský způsob“ má tag gluten_free a „2 cups croutons“.
  // Krutony jsou chleba — blok je správný a opravuje se tag, ne brána.
  const krutony = jidlo({
    nameCs: 'Losos na španělský způsob',
    nameEn: 'Spanish style salmon fillets',
    ingredients: [
      { name: 'krutonky', name_en: 'croutons', original: '2 cups croutons' },
      { name: 'filety lososa', name_en: 'salmon fillets', original: '1 pound salmon fillets' },
    ],
  });
  assert.equal(mealDietaryViolation(krutony, BEZ_LEPKU), 'gluten_free');

  // id 776 „Tex-Mex burger“ — „hamburgerové bulky“ česky, „Toasted“ anglicky.
  const burger = jidlo({
    nameCs: 'Tex-Mex burger',
    nameEn: 'Tex-Mex Burger',
    ingredients: [
      { name: 'hamburgerové bulky', name_en: 'hamburger buns', original: '4 Hamburger Buns, Toasted' },
      { name: 'mleté hovězí', name_en: 'ground beef', original: '2 lb ground beef' },
    ],
  });
  assert.ok(mealDietaryViolation(burger, BEZ_LEPKU), 'bulky jsou pečivo');
});

test('český název se čte dál — ten uživatel opravdu čte', () => {
  const chleb = jidlo({ nameCs: 'Chlebová omeleta', nameEn: 'Bread Omlette' });
  assert.equal(mealDietaryViolation(chleb, BEZ_LEPKU), 'gluten_free');

  // A vlastní označení „bezlepkový“ pořád platí (id 565).
  const bezlepkovy = jidlo({
    nameCs: 'Bezlepkový dýňový chléb s kořením',
    nameEn: 'Gluten Free Pumpkin Spiced Breakfast Bread',
    ingredients: [{ name: 'bezlepková mouka', name_en: 'gluten free flour', original: '1 cup gluten free flour' }],
  });
  assert.equal(mealDietaryViolation(bezlepkovy, BEZ_LEPKU), null);
});

test('překlad, který zahodí dietní informaci, se pozná', () => {
  // Tři změřené případy z produkce.
  const polenta = findFlattenedDietTerms({
    en: "Dad's Breakfast Polenta chicken stock polenta bacon",
    cs: 'Tátaův snídaňový krupicový pokrm kuřecí vývar krupice slanina',
  });
  assert.equal(polenta.length, 1, 'polenta → „krupice“ musí spadnout');
  assert.equal(polenta[0].en, 'polenta');

  const grits = findFlattenedDietTerms({
    en: 'Barbecued Shrimp & Grits bacon grits shrimp',
    cs: 'Grilované krevety s krupicí slanina krupice krevety',
  });
  assert.equal(grits.length, 1, 'grits → „krupice“ musí spadnout');

  const tortilla = findFlattenedDietTerms({
    en: 'Steak Tacos guacamole corn tortillas',
    cs: 'Tacos s filet mignon guacamole tortilly',
  });
  assert.equal(tortilla.length, 1, 'corn tortilla → „tortilly“ musí spadnout');

  // Správný překlad projde.
  assert.deepEqual(
    findFlattenedDietTerms({
      en: "Dad's Breakfast Polenta chicken stock polenta",
      cs: 'Snídaňová kukuřičná polenta kuřecí vývar kukuřičná polenta',
    }),
    []
  );

  // Nebezpečnější směr: lepkový originál, neutrální překlad.
  const semolina = findFlattenedDietTerms({
    en: 'Semolina pudding semolina milk',
    cs: 'Krupicová kaše krupice mléko',
  });
  assert.equal(semolina.length, 1, 'semolina → holá „krupice“ zamlčí, že je pšeničná');
  assert.equal(semolina[0].gluten, true);
});

test('glosář v promptu a v kódu se nesmí rozejít', () => {
  // Prompt je požadavek, kontrola je vymáhání — ale musí mluvit o týchž
  // výrazech. Bez tohohle testu je to dvanáctý výskyt „dvě místa nad stejnými
  // daty“ v tomhle repu.
  const prompt = readFileSync(join(KOREN, 'prompts', 'catalog-translate.md'), 'utf8');
  const chybi = [];
  for (const entry of DIET_CRITICAL_GLOSSARY) {
    if (!prompt.includes(`| ${entry.en} |`)) chybi.push(entry.en);
  }
  assert.deepEqual(
    chybi,
    [],
    `glosář v prompts/catalog-translate.md neobsahuje:\n  ${chybi.join('\n  ')}`
  );
});

test('glosář nemá výraz, který si sám odporuje', () => {
  for (const entry of DIET_CRITICAL_GLOSSARY) {
    assert.ok(entry.csMarkers.length > 0, `${entry.en}: bez csMarkers se nedá nic zkontrolovat`);
    assert.ok(entry.why, `${entry.en}: bez „proč“ to příští člověk smaže`);
    // Doporučený český překlad musí sám svou kontrolou projít, jinak by
    // kontrola zahazovala i správně přeložené recepty.
    assert.ok(
      entry.csMarkers.some((m) => foldForMatch(entry.cs).includes(foldForMatch(m))),
      `${entry.en}: doporučené „${entry.cs}“ neobsahuje žádný z vlastních csMarkers`
    );
  }
});
