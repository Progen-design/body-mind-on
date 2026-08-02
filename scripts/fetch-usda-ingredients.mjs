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
import { dirname } from 'path';

const KEY = process.env.FDC_API_KEY || 'DEMO_KEY';
const CACHE = '.cache/usda-ingredients.json';
const SQL_ONLY = process.argv.includes('--sql');

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
  ['sójové maso', 'textured soy protein', 'soy protein textured'],
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
  for (const [cs, , dotaz] of POLOZKY) {
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
