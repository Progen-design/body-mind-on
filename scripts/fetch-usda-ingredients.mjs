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
