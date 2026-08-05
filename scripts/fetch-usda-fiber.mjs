#!/usr/bin/env node
/**
 * Vláknina (USDA nutrient 1079) pro suroviny, které už ve slovníku jsou.
 *
 *   FDC_API_KEY=xxx node scripts/fetch-usda-fiber.mjs           stáhne do cache
 *   FDC_API_KEY=xxx node scripts/fetch-usda-fiber.mjs --sql     vypíše SQL
 *
 * PROČ SAMOSTATNÝ SKRIPT. fetch-usda-ingredients.mjs bere jen nutrienty
 * 1003/1004/1005 (bílkoviny, tuk, sacharidy) a jeho cache proto vlákninu
 * neobsahuje — jsou v ní jen už vytažené hodnoty, ne surové payloady. Doplnit
 * vlákninu tam by znamenalo přegenerovat celou cache a riskovat, že se změní
 * makra u 142 surovin, které jsou v katalogu odladěné. Tenhle skript proto
 * dohledává JEN vlákninu a nic jiného nepřepisuje.
 *
 * STEJNÉ PRAVIDLO JAKO U ZBYTKU SLOVNÍKU: k číslu patří FDC ID a přesný název
 * položky, aby šlo dohledat. Nic se nedopočítává a nic se nehádá.
 *
 * KONTROLA, ŽE USDA VRÁTILO SPRÁVNOU POTRAVINU. Dávka 4 v migraci
 * 20260804120000 zaznamenala, že dotaz „syr asiago“ vrátil „Cheese spread“
 * (7,1 g bílkovin místo ~25). Proto se u každé položky porovná kcal a
 * sacharidy z USDA proti tomu, co máme ve slovníku — když se rozejdou nad
 * mez, řádek se NEZAPÍŠE a vypíše se jako SPORNÝ.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function loadEnvLocal() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, '.env.local');
  if (!existsSync(file)) return;
  for (const radek of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = radek.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m || radek.trim().startsWith('#')) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
}
loadEnvLocal();

const KEY = process.env.FDC_API_KEY || 'DEMO_KEY';
const CACHE = '.cache/usda-fiber.json';
const SQL_ONLY = process.argv.includes('--sql');

/** Vláknina, celková v potravině. */
const FIBER = 1079;
const ENERGIE = new Set([1008, 2047, 2048]);
const CARBS = 1005;

/**
 * [český název ve slovníku, dotaz do USDA, naše kcal, naše sacharidy]
 *
 * Naše hodnoty slouží JEN jako kontrola, že dotaz trefil tu samou potravinu.
 * Vybrané jsou suroviny, které se vyskytují v aktivních receptech a nesou
 * vlákninu — luštěniny, semínka, ořechy, avokádo, celozrnné, ovoce, zelenina.
 * Koření je vynechané: je v pantry, takže se do nutrice nepočítá vůbec.
 */
const POLOZKY = [
  // recepty 830 a 833, kvůli kterým se to celé řeší
  ['avokádo', 'avocado raw', 160, 8.5],
  ['banán', 'bananas raw', 89, 23],
  ['broskev', 'peaches raw', 39, 10],
  ['chia semínka', 'chia seeds dried', 486, 42],
  ['celer', 'celery raw', 16, 3, 'SR Legacy'],
  ['citronová šťáva', 'lemon juice raw', 22, 6.9],
  // obiloviny a pečivo
  ['ovesné vločky', 'oats rolled dry', 380, 60],
  ['celozrnný chléb', 'bread whole-wheat commercially prepared', 247, 41, 'SR Legacy'],
  ['quinoa', 'quinoa uncooked', 368, 64],
  ['kuskus', 'couscous dry', 376, 77],
  ['těstoviny', 'pasta dry unenriched', 350, 72],
  ['rýže', 'rice white long grain raw unenriched', 360, 79],
  ['mouka', 'wheat flour white all purpose unenriched', 364, 76],
  // lusteniny
  ['cizrna', 'chickpeas canned drained solids', 137, 20.3, 'SR Legacy'],
  ['čočka', 'lentils raw', 352, 63],
  ['fazole', 'beans black raw', 341, 62],
  // orechy a semena
  ['arašídové máslo', 'peanut butter smooth style with salt', 588, 20, 'SR Legacy'],
  ['mandle', 'almonds raw', 579, 21.6],
  ['vlašské ořechy', 'walnuts english raw', 654, 13.7],
  ['dýňová semínka', 'pumpkin squash seed kernels dried', 559, 10.7],
  ['slunečnicová semínka', 'sunflower seed kernels dried', 584, 20],
  ['lněná semínka', 'flaxseed whole', 534, 28.9],
  // ovoce
  ['jahody', 'strawberries raw', 32, 7.7],
  ['borůvky', 'blueberries raw', 57, 14, 'SR Legacy'],
  ['maliny', 'raspberries raw', 52, 12, 'SR Legacy'],
  ['jablko', 'apples raw with skin', 52, 14],
  ['hruška', 'pears raw', 57, 15],
  // zelenina
  ['brambory', 'potatoes raw flesh and skin', 77, 17],
  ['sladké brambory', 'sweetpotato raw unprepared', 86, 20, 'SR Legacy'],
  ['mrkev', 'carrots raw', 41, 9.6],
  ['cibule', 'onions raw', 40, 9.3],
  ['rajče', 'tomatoes red ripe raw', 18, 3.9],
  ['paprika', 'peppers sweet red raw', 31, 6],
  ['špenát', 'spinach raw', 23, 3.6],
  ['brokolice', 'broccoli raw', 34, 7],
  ['květák', 'cauliflower raw', 25, 5],
  ['cuketa', 'squash zucchini raw', 17, 3.1],
  ['houby', 'mushrooms white raw', 22, 3.3],
  ['česnek', 'garlic raw', 149, 33],
];

const spanek = (ms) => new Promise((r) => setTimeout(r, ms));

function nutrient(food, id) {
  for (const n of food.foodNutrients || []) {
    if (n.nutrientId === id) return Number(n.value);
  }
  return null;
}
function energie(food) {
  for (const n of food.foodNutrients || []) {
    if (ENERGIE.has(n.nutrientId) && /kcal/i.test(n.unitName || '')) return Number(n.value);
  }
  return null;
}

async function najdi(dotaz, dataType) {
  // Foundation polozky casto vlákninu vubec nemaji (celer, boruvky, maliny,
  // cizrna). SR Legacy ji ma skoro vzdy, proto se u nekterych polozek omezuje
  // dotaz jen na ni — jinak vyhraje Foundation zaznam bez vlakniny.
  const dt = dataType || 'SR Legacy,Foundation';
  const url = 'https://api.nal.usda.gov/fdc/v1/foods/search'
    + `?api_key=${KEY}&query=${encodeURIComponent(dotaz)}&pageSize=5`
    + `&dataType=${encodeURIComponent(dt)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA ${res.status} pro "${dotaz}"`);
  const json = await res.json();
  return (json.foods || [])[0] || null;
}

function nactiCache() {
  if (!existsSync(CACHE)) return {};
  try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return {}; }
}

async function main() {
  const cache = nactiCache();
  const sporne = [];
  const chybi = [];

  if (!SQL_ONLY) {
    for (const [nazev, dotaz, nasKcal, naseCarbs, dataType] of POLOZKY) {
      if (cache[nazev]) continue;
      try {
        const food = await najdi(dotaz, dataType);
        if (!food) { chybi.push(`${nazev} — USDA nic nevrátilo na "${dotaz}"`); continue; }
        const fiber = nutrient(food, FIBER);
        const kcal = energie(food);
        const carbs = nutrient(food, CARBS);
        if (fiber == null) { chybi.push(`${nazev} — USDA nevrátilo vlákninu (FDC ${food.fdcId})`); continue; }

        // Kontrola, ze jde o tu samou potravinu. Nase hodnoty jsou zaokrouhlene,
        // takze mez je siroka — jde o odhaleni JINE potraviny, ne o presnost.
        const kcalOdch = kcal && nasKcal ? Math.abs(kcal - nasKcal) / nasKcal : 0;
        const carbsOdch = carbs != null && naseCarbs > 0 ? Math.abs(carbs - naseCarbs) / naseCarbs : 0;
        if (kcalOdch > 0.30 || carbsOdch > 0.35) {
          sporne.push(`${nazev} — USDA "${food.description}" (FDC ${food.fdcId}): `
            + `${kcal} kcal / ${carbs} g sach. vs nase ${nasKcal} / ${naseCarbs}`);
          continue;
        }
        cache[nazev] = { fdcId: food.fdcId, popis: food.description, dataType: food.dataType, fiber, kcal, carbs };
        console.log(`[fiber] ${nazev}: ${fiber} g  (FDC ${food.fdcId} ${food.description})`);
      } catch (e) {
        chybi.push(`${nazev} — ${e.message}`);
      }
      await spanek(250);
    }
    mkdirSync('.cache', { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache, null, 2), 'utf8');
  }

  const radky = Object.entries(cache);
  console.log(`\n=== ${radky.length} surovin s vlakninou z USDA ===\n`);
  for (const [nazev, v] of radky) {
    console.log(`  -- FDC ${v.fdcId} (${v.dataType}): ${v.popis}`);
    console.log(`  ('${nazev.replace(/'/g, "''")}', ${v.fiber}),`);
  }
  if (sporne.length) {
    console.log(`\n=== SPORNE (nezapsano, USDA vratilo nejspis jinou potravinu) ===`);
    for (const s of sporne) console.log('  ' + s);
  }
  if (chybi.length) {
    console.log(`\n=== NEDOHLEDANO ===`);
    for (const c of chybi) console.log('  ' + c);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
