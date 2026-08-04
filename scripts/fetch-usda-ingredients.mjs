#!/usr/bin/env node
/**
 * Makra na 100 g z USDA FoodData Central → migrace pro ingredients_nutrition.
 *
 *   FDC_API_KEY=xxx node scripts/fetch-usda-ingredients.mjs            stáhne do cache
 *   FDC_API_KEY=xxx node scripts/fetch-usda-ingredients.mjs --sql      vypíše SQL
 *
 * PROČ TENHLE SKRIPT EXISTUJE: nutriční hodnoty se do katalogu nesmí dostat
 * z hlavy ani od modelu. Ke každému řádku patří FDC ID a přesný název položky,
 * aby šlo číslo kdykoli dohledat a přepočítat. Skript nic nedopočítává — co
 * USDA nevrátí kompletní, to vynechá a nahlásí.
 *
 * DEMO_KEY má limit 10 dotazů (Retry-After ~7 h), takže na 20 surovin nestačí.
 * Vlastní klíč je zdarma na https://fdc.nal.usda.gov/api-key-signup.html
 * a limit je 1 000 dotazů/hodinu.
 *
 * Cache je v .cache/usda-ingredients.json, aby se běh dal opakovat bez
 * dalších dotazů (a aby bylo vidět, odkud každé číslo je).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Minimalistický loader .env.local — skript se pouští ručně mimo Next.js,
 * takže si proměnné musí načíst sám. Bez závislosti na dotenv.
 * Reálné prostředí (process.env) má vždy přednost před souborem.
 */
function loadEnvLocal() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, '.env.local');
  if (!existsSync(file)) return;
  for (const radek of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = radek.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m || radek.trim().startsWith('#')) continue;
    const klic = m[1];
    if (process.env[klic] !== undefined) continue;
    process.env[klic] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
}
loadEnvLocal();

const KEY = process.env.FDC_API_KEY || 'DEMO_KEY';
if (KEY === 'DEMO_KEY') {
  console.warn('[usda] VAROVANI: FDC_API_KEY nenalezen, jede se na DEMO_KEY (limit 10 dotazu).');
}
const CACHE = '.cache/usda-ingredients.json';
const SQL_ONLY = process.argv.includes('--sql');
/**
 * --batch=N omezi bezi i vystup SQL na jednu davku. Bez nej jedou vsechny.
 * Davka = ctvrty prvek polozky; drzi historii pohromade, ale migrace pak
 * obsahuje jen to nove (starsi uz v DB jsou a ON CONFLICT by je jen prepsal
 * na nic).
 */
const BATCH = (() => {
  const a = process.argv.find((x) => x.startsWith('--batch='));
  return a ? Number(a.slice(8)) : null;
})();
const vDavce = (p) => BATCH == null || (p[3] ?? 1) === BATCH;

/** Energie: 1008 = Energy, 2047/2048 = Atwater. Bereme první v kcal. */
const ENERGIE = new Set([1008, 2047, 2048]);
const MAKRA = { 1003: 'protein', 1005: 'carbs', 1004: 'fat' };

/**
 * [český název, anglický název, dotaz do USDA]
 *
 * Pořadí je podle priority pro vegan sloty: bez cizrny a rostlinného mléka
 * nejde postavit vegan snídaně ani většina vegan obědů.
 */
const POLOZKY = [
  ['cizrna', 'chickpeas', 'chickpeas garbanzo canned drained'],
  ['sójové mléko', 'soy milk', 'soy milk unsweetened plain'],
  ['mandlové mléko', 'almond milk', 'almond milk unsweetened plain'],
  ['ovesné mléko', 'oat milk', 'oat milk unsweetened plain'],
  ['rostlinný jogurt', 'plant yogurt', 'yogurt soy plain'],
  ['mandle', 'almonds', 'almonds raw'],
  ['kešu', 'cashews', 'cashew nuts raw'],
  ['vlašské ořechy', 'walnuts', 'walnuts english raw'],
  ['dýňová semínka', 'pumpkin seeds', 'pumpkin squash seed kernels dried'],
  ['slunečnicová semínka', 'sunflower seeds', 'sunflower seed kernels dried'],
  ['lněná semínka', 'flaxseed', 'flaxseed whole'],
  ['tahini', 'tahini', 'sesame butter tahini'],
  ['tempeh', 'tempeh', 'tempeh cooked'],
  ['seitan', 'seitan', 'wheat gluten vital'],
  ['edamame', 'edamame', 'edamame frozen prepared'],
  ['hummus', 'hummus', 'hummus commercial'],
  ['bulgur', 'bulgur', 'bulgur cooked'],
  ['pohanka', 'buckwheat', 'buckwheat groats cooked'],
  ['jáhly', 'millet', 'millet cooked'],
  // POZOR: 'soy protein textured' vrací z USDA izolát (88 g bílkovin/100 g),
  // což je jiná surovina než TVP granule. Defatted soy flour je to, z čeho se
  // TVP extruduje, a makra sedí (~47 g bílkovin) — proto tenhle dotaz.
  ['sójové maso', 'textured soy protein', 'soy flour defatted'],

  // --- Davka 3: dlouhy ocas z .cache/nezname-suroviny.json -------------------
  // Suroviny, ktere blokovaly recepty tim, ze nejsou ve slovniku. Alias na
  // neco podobneho by u nich lhal o tuku nebo o zpracovani, proto vlastni radek.
  ['feta', 'feta cheese', 'cheese feta', 3],
  ['nízkotučný řecký jogurt', 'low fat greek yogurt', 'yogurt greek plain lowfat', 3],
  ['šlehačka', 'whipping cream', 'cream fluid heavy whipping', 3],
  ['rozinky', 'raisins', 'raisins golden seedless', 3],
  ['podmáslí', 'buttermilk', 'buttermilk fluid cultured lowfat', 3],
  ['sušená rajčata', 'sun-dried tomatoes', 'tomatoes sun-dried', 3],
  ['pomerančová kůra', 'orange peel', 'orange peel raw', 3],
  ['čokoládové kousky', 'chocolate chips', 'chocolate semisweet', 3],
  ['odtučněné mléko', 'skim milk', 'milk nonfat fluid', 3],
  ['kozí sýr', 'goat cheese', 'cheese goat soft type', 3],
  // VYNECHANO: USDA na 'mascarpone' vraci restauracni ravioli, na 'cheese cream'
  // zase smetanovy syr (ten uz mame). Vlastni radek pro mascarpone tak neni
  // z ceho postavit — dohledat rucne v SR Legacy a doplnit zvlast.
  // ['mascarpone', 'mascarpone', '???', 3],
  ['mandlové máslo', 'almond butter', 'almond butter plain', 3],
  ['kokosová mouka', 'coconut flour', 'coconut flour', 3],
  ['kokosové vločky', 'shredded coconut', 'nuts coconut meat dried not sweetened', 3],
  ['krupice', 'semolina', 'semolina enriched', 3],
  ['meruňky', 'apricots', 'apricots raw', 3],
  ['melasa', 'molasses', 'molasses', 3],
  ['olivy', 'olives', 'olives ripe canned', 3],
  ['ostružiny', 'blackberries', 'blackberries raw', 3],
  ['pohanková mouka', 'buckwheat flour', 'buckwheat flour whole groat', 3],
  ['pomeranč', 'orange', 'oranges raw all commercial varieties', 3],
  ['rozmarýn', 'rosemary', 'rosemary fresh', 3],
  ['dýňové pyré', 'pumpkin puree', 'pumpkin canned without salt', 3],
  // VYNECHANO: 'tea green brewed' vraci uvareny caj (0 kcal), 'spices tea powder'
  // vraci chilli prasek. Matcha jako prasek v SR Legacy nejspis neni.
  // ['matcha prášek', 'matcha powder', '???', 3],
  // VYNECHANO: oba dotazy vratily jinou polozku (naposledy jablecne pyre).
  // ['sušené brusinky', 'dried cranberries', '???', 3],
  ['datle', 'dates', 'dates medjool', 3],
  ['fíky', 'figs', 'figs raw', 3],
  ['hroznové víno', 'grapes', 'grapes red or green european type raw', 3],
  ['pistácie', 'pistachios', 'nuts pistachio nuts raw', 3],
  ['kokos', 'coconut', 'nuts coconut meat raw', 3],
  ['vodní meloun', 'watermelon', 'watermelon raw', 3],
  ['ředkvičky', 'radishes', 'radishes raw', 3],
  ['růžičková kapusta', 'brussels sprouts', 'brussels sprouts raw', 3],
  ['sádlo', 'lard', 'lard', 3],
  ['želatina', 'gelatin', 'gelatins dry powder unsweetened', 3],
  ['hovězí vývar', 'beef broth', 'soup beef broth or bouillon ready to serve', 3],
  ['sušené mléko', 'milk powder', 'milk dry nonfat regular', 3],
  ['granola', 'granola', 'cereals ready-to-eat granola homemade', 3],
  ['chilli vločky', 'chili flakes', 'spices pepper red or cayenne', 3],
  ['semínka granátového jablka', 'pomegranate seeds', 'pomegranates raw', 3],
  ['černý rybíz', 'black currants', 'currants european black raw', 3],
  ['sušené třešně', 'dried cherries', 'cherries tart dried sweetened', 3],
  ['dýně', 'pumpkin', 'pumpkin raw', 3],
  ['smetana a mléko (half-and-half)', 'half and half', 'cream fluid half and half', 3],
  ['vanilkový extrakt', 'vanilla extract', 'vanilla extract', 3],
  ['konzervovaná rajčata', 'canned tomatoes', 'tomatoes red ripe canned packed in tomato juice', 3],
  ['grilovaná kuřecí prsa', 'grilled chicken breast', 'chicken breast meat only cooked roasted', 3],

  // --- Davka 4: hromadka "doplnit" z .cache/chybejici-suroviny-navrh.csv ------
  //
  // 149 nazvu, ktere v aktivnich receptech blokuji 158 vyskytu a nejsou to
  // aliasy — surovina ve slovniku chybi cela. Nize je 88 z nich; zbytek je
  // zakomentovany na konci bloku, protoze dotaz nejde polozit tak, aby trefil
  // presne tu surovinu. Radeji chybejici radek nez radek se spatnymi makry.
  //
  // Nazvy jsou ceske, protoze se ukazuji uzivateli. Anglicke a znackove
  // podoby z receptu ("swiss cheese", "sou cream") na ne miri aliasem
  // v migraci — bez toho by se recept neodblokoval.

  // syry
  ['ementál', 'swiss cheese', 'cheese swiss', 4],
  ['brie', 'brie cheese', 'cheese brie', 4],
  ['gouda', 'gouda cheese', 'cheese gouda', 4],
  ['gruyère', 'gruyere cheese', 'cheese gruyere', 4],
  ['monterey jack', 'monterey jack cheese', 'cheese monterey', 4],
  ['pecorino romano', 'romano cheese', 'cheese romano', 4],
  // ['sýr asiago', 'asiago cheese', 'cheese asiago', 4],
  ['americký tavený sýr', 'american cheese', 'cheese pasteurized process american', 4],
  // ['cheddar se sníženým obsahem tuku', 'reduced fat cheddar', 'cheese cheddar reduced fat', 4],

  // mlecne
  ['zakysaná smetana', 'sour cream', 'cream sour cultured', 4],
  // ['lehká smetana', 'light cream', 'cream fluid light', 4],
  ['plnotučný bílý jogurt', 'whole milk yogurt', 'yogurt plain whole milk', 4],
  ['netučný bílý jogurt', 'nonfat yogurt', 'yogurt plain skim milk', 4],
  ['plnotučný řecký jogurt', 'whole milk greek yogurt', 'yogurt greek plain whole milk', 4],
  ['vanilkový řecký jogurt', 'vanilla greek yogurt', 'yogurt greek vanilla', 4],
  ['vanilkový jogurt', 'vanilla yogurt', 'yogurt vanilla low fat', 4],
  ['vanilkové mandlové mléko', 'vanilla almond milk', 'almond milk vanilla', 4],
  ['rostlinný tuk', 'margarine spread', 'margarine like vegetable oil spread', 4],

  // maso a ryby
  ['kuře', 'chicken', 'chicken broilers or fryers meat and skin cooked roasted', 4],
  ['kuřecí paličky', 'chicken drumstick', 'chicken broilers or fryers drumstick meat only cooked roasted', 4],
  ['mleté vepřové', 'ground pork', 'pork ground raw', 4],
  ['vepřová plec', 'pork shoulder', 'pork fresh shoulder blade boston butt cooked roasted', 4],
  ['klobása', 'sausage', 'sausage polish pork', 4],
  ['krůtí klobása', 'turkey sausage', 'sausage turkey cooked', 4],
  ['chorizo', 'chorizo sausage', 'sausage chorizo pork and beef', 4],
  ['nakládané hovězí', 'corned beef', 'beef corned beef brisket cooked', 4],
  ['hovězí hash', 'corned beef hash', 'corned beef hash canned', 4],
  ['kachní vejce', 'duck egg', 'egg duck whole fresh raw', 4],
  ['náhrada vajec', 'egg substitute', 'egg substitute liquid', 4],

  // zelenina a ovoce
  ['rukola', 'arugula', 'arugula raw', 4],
  ['červená řepa', 'beets', 'beets raw', 4],
  ['listy červené řepy', 'beet greens', 'beet greens raw', 4],
  ['listová kapusta collard', 'collard greens', 'collards raw', 4],
  ['pastinák', 'parsnip', 'parsnips raw', 4],
  ['řeřicha', 'watercress', 'watercress raw', 4],
  ['cukrový hrášek', 'snow peas', 'peas edible-podded raw', 4],
  ['máslová dýně vařená', 'cooked butternut squash', 'squash winter butternut cooked', 4],
  ['kaki', 'persimmon', 'persimmons japanese raw', 4],
  ['mangostana', 'mangosteen', 'mangosteen canned syrup pack', 4],
  ['koktejlové třešně', 'maraschino cherries', 'cherries maraschino canned', 4],
  ['sušené brusinky', 'dried cranberries', 'cranberries dried sweetened', 4],
  ['limetková šťáva', 'lime juice', 'lime juice raw', 4],
  ['kokosová voda', 'coconut water', 'nuts coconut water', 4],

  // pecivo, mouky, testa
  ['chléb', 'bread', 'bread white commercially prepared', 4],
  ['vícezrnný chléb', 'multigrain bread', 'bread multi-grain', 4],
  ['challah chléb', 'challah bread', 'bread egg', 4],
  ['naan', 'naan bread', 'bread naan plain', 4],
  ['pita', 'pita bread', 'bread pita white enriched', 4],
  ['celozrnná pita', 'whole wheat pita', 'bread pita whole-wheat', 4],
  // ['pšeničná tortilla', 'flour tortilla', 'tortillas ready-to-bake or -fry flour', 4],
  // ['kukuřičná tortilla', 'corn tortilla', 'tortillas ready-to-bake or -fry corn', 4],
  ['croissant', 'croissant', 'croissants butter', 4],
  ['krutony', 'croutons', 'croutons plain', 4],
  ['ovesná mouka', 'oat flour', 'oat flour partially debranned', 4],
  ['kukuřičná krupice', 'cornmeal', 'cornmeal degermed enriched yellow', 4],
  ['těsto na koláč', 'pie crust', 'pie crust standard-type dry mix', 4],
  ['palačinková směs', 'pancake mix', 'pancakes plain dry mix', 4],
  ['pufovaná rýže', 'puffed rice', 'cereals ready-to-eat rice puffed', 4],
  ['droždí', 'yeast', 'leavening agents yeast bakers active dry', 4],

  // omacky, dresinky, polevky
  ['barbecue omáčka', 'barbecue sauce', 'sauce barbecue', 4],
  ['hoisin omáčka', 'hoisin sauce', 'sauce hoisin ready-to-serve', 4],
  ['ústřicová omáčka', 'oyster sauce', 'sauce oyster ready-to-serve', 4],
  ['pálivá omáčka', 'hot sauce', 'sauce ready-to-serve pepper or hot', 4],
  ['salsa', 'salsa', 'sauce salsa ready-to-serve', 4],
  ['pesto', 'pesto sauce', 'sauce pesto', 4],
  ['ranch dresink', 'ranch dressing', 'salad dressing ranch dressing regular', 4],
  ['brusinková omáčka', 'cranberry sauce', 'cranberry sauce canned sweetened', 4],
  ['rajčatový protlak', 'tomato paste', 'tomato paste canned without salt added', 4],
  ['houbová polévka', 'cream of mushroom soup', 'soup cream of mushroom canned condensed', 4],
  ['kuřecí polévka', 'cream of chicken soup', 'soup cream of chicken canned condensed', 4],
  ['guacamole', 'guacamole', 'guacamole', 4],
  ['miso', 'miso paste', 'miso', 4],
  ['fazolová kaše', 'refried beans', 'beans refried canned traditional', 4],
  ['džem', 'jam', 'jams and preserves', 4],

  // koreni a ostatni
  ['šafrán', 'saffron', 'spices saffron', 4],
  ['kardamom', 'cardamom', 'spices cardamom', 4],
  ['hřebíček', 'cloves', 'spices cloves ground', 4],
  ['anýzová semínka', 'anise seed', 'spices anise seed', 4],
  ['estragon', 'tarragon', 'spices tarragon dried', 4],
  ['hořčičný prášek', 'ground mustard', 'spices mustard seed ground', 4],
  ['cibulové vločky', 'onion flakes', 'onions dehydrated flakes', 4],
  ['mák', 'poppy seed', 'seeds poppy seed', 4],
  ['sušená cizrna', 'dried chickpeas', 'chickpeas garbanzo beans bengal gram mature seeds raw', 4],
  ['káva', 'coffee', 'beverages coffee brewed prepared with tap water', 4],
  ['rum', 'rum', 'alcoholic beverage distilled rum 80 proof', 4],

  // ---------------------------------------------------------------------------
  // K RUCNI KONTROLE — dotaz nejde polozit tak, aby jistě trefil tu surovinu.
  //
  // Skript bere prvni vysledek, takze nepresny dotaz ulozi cizi makra a nikdo
  // si toho nevsimne. U techhle polozek je bud surovina v SR Legacy/Foundation
  // pravdepodobne vubec neni, nebo je nazev v receptu tak obecny, ze nejde
  // urcit, co presne se ma dohledat.
  //
  //   znackove vyrobky (USDA je v Foundation/SR Legacy nema):
  //     alouette creme fraiche, diestel breakfast sausage,
  //     syr gouda prima donna -> resen radkem 'gouda' vyse
  //   slozene pokrmy, ne suroviny:
  //     amaretti, jahodovy marshmallow, brusinkovo-pomerancova omacka,
  //     cerna fazolova cesnekova omacka, masova omacka, tzatziki, rybi kolacek,
  //     makova napln, orechove ovesne vlocky, smes bobuloveho ovoce,
  //     kandovana pomerancova kura, barbecue seasoning, enchilada omacka,
  //     chilli pasta, koncentrat limonady, limonada
  //   prilis obecne, nelze urcit variantu:
  //     maso na duseni, maso na gulas, kureci kousky, mlete klobasy,
  //     nepsenicna mouka, pasta omacka, rostlinne mleko, mlady kapustovy salat,
  //     zelena dyne, horka cokolada, smazeny cesnek
  //   v USDA nedohledano ani na opakovany dotaz:
  //     mascarpone (viz davka 3), matcha prasek (viz davka 3), asafoetida,
  //     vanilka, vanilkovy lusk, vanilkova pasta, almond extract,
  //     mata peprna (extrakt), mirin, wasabi paste, stevie, farro,
  //     lepkava ryzova mouka, lime kura, konopny proteinovy prasek,
  //     syr havarti
];

const spanek = (ms) => new Promise((r) => setTimeout(r, ms));

function nactiCache() {
  if (!existsSync(CACHE)) return {};
  return JSON.parse(readFileSync(CACHE, 'utf8'));
}

function ulozCache(data) {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(data, null, 2));
}

function sqlText(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Vypíše INSERT jen pro ověřené položky. Neověřené se vynechají. */
function vypisSql(cache) {
  const radky = POLOZKY
    .filter(vDavce)
    .filter(([cs]) => cache[cs])
    .map(([cs, en]) => {
      const z = cache[cs];
      return `  -- FDC ${z.fdcId} (${z.dataType}): ${z.popis}\n`
        + `  (${sqlText(en)}, ${sqlText(cs)}, ${z.kcal}::numeric, ${z.protein}::numeric,`
        + ` ${z.carbs}::numeric, ${z.fat}::numeric)`;
    });

  if (!radky.length) {
    console.log('-- Žádná ověřená položka. Spusť skript s FDC_API_KEY.');
    return;
  }

  console.log(`-- Vygenerováno scripts/fetch-usda-ingredients.mjs z USDA FoodData Central.
-- Každý řádek nese FDC ID a název položky, ze které hodnoty pocházejí.
-- Ověřeno: ${radky.length} z ${POLOZKY.length} položek.

-- name_normalized je NOT NULL, tvar lower(unaccent(name_cs)) s pomlckami misto mezer.
INSERT INTO public.ingredients_nutrition
  (name_en, name_cs, name_normalized, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, source)
SELECT v.name_en, v.name_cs,
       replace(lower(extensions.unaccent(v.name_cs)), ' ', '-'),
       v.kcal, v.protein, v.carbs, v.fat, 'usda_fdc'
FROM (VALUES
${radky.join(',\n')}
) AS v(name_en, name_cs, kcal, protein, carbs, fat)
ON CONFLICT DO NOTHING;`);
}

async function stahni(cache) {
  const chybi = [];
  for (const [cs, , dotaz] of POLOZKY.filter(vDavce)) {
    if (cache[cs]) { console.error(`cache: ${cs}`); continue; }

    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${KEY}`
      + `&query=${encodeURIComponent(dotaz)}&dataType=Foundation,SR%20Legacy&pageSize=5`;

    try {
      const r = await fetch(url);
      if (r.status === 429) {
        const cekat = r.headers.get('retry-after');
        console.error(`\nLIMIT VYCERPAN. Retry-After: ${cekat}s. Zbyva ${POLOZKY.length - Object.keys(cache).length} polozek.`);
        console.error('Vlastni klic zdarma: https://fdc.nal.usda.gov/api-key-signup.html');
        break;
      }
      if (!r.ok) { chybi.push(`${cs}: HTTP ${r.status}`); continue; }

      const j = await r.json();
      const f = (j.foods || [])[0];
      if (!f) { chybi.push(`${cs}: bez shody`); continue; }

      const v = {};
      let kcal = null;
      for (const n of f.foodNutrients || []) {
        if (ENERGIE.has(n.nutrientId) && kcal == null
            && String(n.unitName || '').toUpperCase() === 'KCAL') kcal = n.value;
        const k = MAKRA[n.nutrientId];
        if (k && v[k] == null) v[k] = n.value;
      }

      if (kcal == null || ['protein', 'carbs', 'fat'].some((k) => v[k] == null)) {
        chybi.push(`${cs}: neúplné (kcal=${kcal}, ${JSON.stringify(v)})`);
        continue;
      }

      cache[cs] = { fdcId: f.fdcId, popis: f.description, dataType: f.dataType, kcal, ...v };
      ulozCache(cache);
      console.error(`OK ${cs} → FDC ${f.fdcId} (${kcal} kcal)`);
    } catch (e) {
      chybi.push(`${cs}: ${e.message}`);
    }
    await spanek(1200);
  }

  console.error(`\novereno ${Object.keys(cache).length}/${POLOZKY.length}`);
  if (chybi.length) console.error(`nedohledano:\n  ${chybi.join('\n  ')}`);
}

const cache = nactiCache();
if (!SQL_ONLY) await stahni(cache);
vypisSql(cache);
