// OpenAI náklady na minimum — PROMPT_NAKLADY_MINIMUM.md (21. 9. 2026).
//
// Generátor receptů tvořil 99 % útraty ($19,04 z 30 dní) a víc objednávek
// padalo, než procházelo. Tyhle testy hlídají, že se model nevolá, když
// nemá smysl (bez poptávky, po vyčerpání pokusů, pro naplněný slot), že
// TED má vlastní rozpočet a že cachovaný vstup se účtuje cachovanou sazbou.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  DEFAULT_DAILY_BUDGET_USD,
  DEFAULT_INTERACTIVE_DAILY_BUDGET_USD,
  BATCH_PURPOSY,
  jeBatchPurpose,
  estimateOpenAICostUSD,
} from '../openai.js';
import {
  MAX_POKUSU_POLOZKY,
  klicSlotu,
  slotySPoptavkou,
  maPoptavku,
  pocetVyhovujicich,
  potrebaKusu,
} from '../recipeGenerationNeed.js';
import { nactiFrontu } from '../recipeGenerationQueue.js';
import { RECIPE_GEN_MODEL, buildGeneratorInput } from '../recipeGenerator.js';
import { DOPLNENI_MODEL } from '../plan/doplneniPostupuReceptu.js';
import { runRecipeGenerator } from '../recipeGeneratorRun.js';

/** Fake klient: `data[tabulka]` se vrací na každý dotaz, zápisy se sbírají. */
function fakeClient(data = {}) {
  const zapisy = [];
  const dotazy = [];
  const client = {
    zapisy,
    dotazy,
    from(tabulka) {
      let rezim = 'read';
      let payload = null;
      const b = {
        select() { return b; },
        eq(sloupec, hodnota) { dotazy.push({ tabulka, op: 'eq', sloupec, hodnota }); return b; },
        lt(sloupec, hodnota) { dotazy.push({ tabulka, op: 'lt', sloupec, hodnota }); return b; },
        gte() { return b; },
        in() { return b; },
        not() { return b; },
        is() { return b; },
        order() { return b; },
        limit() { return b; },
        insert(p) { rezim = 'insert'; payload = p; zapisy.push({ tabulka, akce: 'insert', payload: p }); return b; },
        update(p) { rezim = 'update'; payload = p; return b; },
        then(res, rej) {
          if (rezim === 'update') zapisy.push({ tabulka, akce: 'update', payload });
          const rows = data[tabulka] ?? [];
          return Promise.resolve({ data: rows, count: rows.length, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
  return client;
}

const POLOZKA = {
  id: 7,
  meal_type: 'snidane',
  diet_tags: [],
  kcal_min: 300,
  kcal_max: 520,
  pozadovano: 5,
  vyrobeno: 0,
  pokusu: 0,
  priorita: 10,
  zdroj: 'demand',
  protein_hint: null,
  fat_hint: null,
};

// ---------------------------------------------------------- 1. model

test('generátor i doplňování postupů jedou na gpt-4.1-mini, když env nepřepíše', () => {
  if (!process.env.RECIPE_GEN_MODEL) assert.equal(RECIPE_GEN_MODEL, 'gpt-4.1-mini');
  if (!process.env.DOPLNENI_MODEL) assert.equal(DOPLNENI_MODEL, 'gpt-4.1-mini');
});

test('model generátoru a doplňování jde vrátit přes env bez deploye', () => {
  const gen = fs.readFileSync('lib/recipeGenerator.js', 'utf8');
  const dopl = fs.readFileSync('lib/plan/doplneniPostupuReceptu.js', 'utf8');
  assert.match(gen, /process\.env\.RECIPE_GEN_MODEL/);
  assert.match(dopl, /process\.env\.DOPLNENI_MODEL/);
});

test('řádek recipe_generation_vysledek nese model', () => {
  const zdroj = fs.readFileSync('lib/recipeGeneratorRun.js', 'utf8');
  const [, odVysledku] = zdroj.split("purpose: 'recipe_generation_vysledek'");
  assert.ok(odVysledku, 'chybí zápis diagnostického řádku');
  assert.match(odVysledku.slice(0, 900), /model: RECIPE_GEN_MODEL/);
});

// ------------------------------------------------------- 2. pokusy

test('automatický běh bere jen položky pod stropem pokusů, ruční běh strop obchází', async () => {
  const auto = fakeClient({ recipe_generation_queue: [] });
  await nactiFrontu(20, auto, {});
  assert.ok(
    auto.dotazy.some((d) => d.op === 'lt' && d.sloupec === 'pokusu' && d.hodnota === MAX_POKUSU_POLOZKY),
    'automatický běh nefiltruje vyčerpané položky'
  );

  const rucni = fakeClient({ recipe_generation_queue: [] });
  await nactiFrontu(20, rucni, { queueId: 5 });
  assert.ok(!rucni.dotazy.some((d) => d.op === 'lt'), 'ruční běh s queue_id má strop obcházet');
});

test('vyčerpaná objednávka se do fronty nevrací a pád infrastruktury pokus nepočítá', () => {
  const zdroj = fs.readFileSync('lib/recipeGeneratorRun.js', 'utf8');
  assert.match(zdroj, /pokusuPoBehu = infrastruktura \? p\.pokusu : p\.pokusu \+ 1/);
  assert.match(zdroj, /pokusuPoBehu >= MAX_POKUSU_POLOZKY/);
});

test('specifikace, která nedávno spadla, se znovu neobjedná (zadní vrátka přes unikát jen na pending)', () => {
  const zdroj = fs.readFileSync('lib/recipeGenerationQueue.js', 'utf8');
  assert.match(zdroj, /await nedavnoVycerpana\(radek, client\)/);
  assert.match(zdroj, /\.eq\('stav', 'failed'\)/);
});

// --------------------------------------------------- 3. poptávka + naplnění

test('klíč slotu nezávisí na pořadí tagů', () => {
  assert.equal(klicSlotu('snidane', ['vegan', 'gluten_free']), klicSlotu('snidane', ['gluten_free', 'vegan']));
});

test('poptávka = tvrdá díra nebo tenká nabídka, nic jiného', () => {
  const sloty = slotySPoptavkou([
    { meal_type: 'snidane', diet_tags: [], nevyresenych: 2, kandidatu_min: 10 },
    { meal_type: 'obed', diet_tags: ['vegan'], nevyresenych: 0, kandidatu_min: 3 },
    { meal_type: 'vecere', diet_tags: [], nevyresenych: 0, kandidatu_min: 12 },
  ]);
  assert.equal(maPoptavku({ meal_type: 'snidane', diet_tags: [] }, sloty), true);
  assert.equal(maPoptavku({ meal_type: 'obed', diet_tags: ['vegan'] }, sloty), true);
  assert.equal(maPoptavku({ meal_type: 'vecere', diet_tags: [] }, sloty), false);
  assert.equal(maPoptavku({ meal_type: 'svacina', diet_tags: [] }, sloty), false);
});

test('slot potřebuje recept, dokud nemá 7 vyhovujících; dietní tagy a pásmo se počítají', () => {
  const recepty = (n, extra = {}) => Array.from({ length: n }, () => ({ diet_tags: ['vegan'], kcal: 400, protein_g: 20, ...extra }));
  const polozka = { diet_tags: ['vegan'], kcal_min: 300, kcal_max: 520, protein_hint: null };

  assert.equal(pocetVyhovujicich(polozka, recepty(4)), 4);
  assert.equal(potrebaKusu(polozka, recepty(4)), 3);
  assert.equal(potrebaKusu(polozka, recepty(7)), 0);
  // mimo pásmo nebo bez tagu se nepočítá
  assert.equal(pocetVyhovujicich(polozka, recepty(5, { kcal: 900 })), 0);
  assert.equal(pocetVyhovujicich(polozka, recepty(5, { diet_tags: [] })), 0);
});

test('objednávka s podílem bílkovin se neoznačí za naplněnou bílkovinově slabými recepty', () => {
  const polozka = { diet_tags: [], kcal_min: 300, kcal_max: 520, protein_hint: '{"podil":0.25}' };
  // 400 kcal, 5 g bílkovin = 5 % kalorií
  const slabe = Array.from({ length: 10 }, () => ({ diet_tags: [], kcal: 400, protein_g: 5 }));
  assert.equal(potrebaKusu(polozka, slabe), 7);
  // 400 kcal, 30 g bílkovin = 30 %
  const silne = Array.from({ length: 10 }, () => ({ diet_tags: [], kcal: 400, protein_g: 30 }));
  assert.equal(potrebaKusu(polozka, silne), 0);
});

test('bez poptávky běh skončí PŘED voláním modelu', async () => {
  const client = fakeClient({
    recipe_generation_queue: [POLOZKA],
    catalog_slot_demand: [],
    recipes_catalog: [],
  });
  const vysledek = await runRecipeGenerator({
    client,
    jenSPoptavkou: true,
    zkontrolujRozpocet: async () => ({ allowed: true, spent: 0, budget: 0.5 }),
  });
  assert.equal(vysledek.skipped, true);
  assert.equal(vysledek.reason, 'zadna_poptavka');
  assert.equal(vysledek.zapsano, 0);
});

test('naplněný slot se označí nadbytecna a model se nevolá', async () => {
  const recepty = Array.from({ length: 8 }, () => ({ diet_tags: [], kcal: 400, protein_g: 20 }));
  const client = fakeClient({
    recipe_generation_queue: [POLOZKA],
    catalog_slot_demand: [{ meal_type: 'snidane', diet_tags: [], nevyresenych: 1, kandidatu_min: 5 }],
    recipes_catalog: recepty,
    ingredients_nutrition: [],
  });
  // Kdyby se model zavolal, `volejModel()` spadne na chybějícím klíči/DB.
  const vysledek = await runRecipeGenerator({
    client,
    jenSPoptavkou: true,
    zkontrolujRozpocet: async () => ({ allowed: true, spent: 0, budget: 0.5 }),
  });
  assert.equal(vysledek.zapsano, 0);
  assert.equal(vysledek.nadbytecnych, 1);
  const zapis = client.zapisy.find((z) => z.tabulka === 'recipe_generation_queue' && z.akce === 'update');
  assert.equal(zapis?.payload.stav, 'nadbytecna');
});

test('cron jede jednou denně a jen s poptávkou', () => {
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const cron = vercel.crons.find((c) => c.path === '/api/cron/generate-recipes');
  // 1× denně od 24. 9. 2026. Plýtvání hlídá poptávková brána (jenSPoptavkou níž),
  // MAX_POKUSU_POLOZKY a denní strop batch rozpočtu — ne frekvence cronu.
  assert.equal(cron.schedule, '15 3 * * *', 'generate-recipes má běžet denně v 03:15 UTC');
  const handler = fs.readFileSync('api/cron/generate-recipes.js', 'utf8');
  assert.match(handler, /runRecipeGenerator\(\{ dryRun: false, jenSPoptavkou: true \}\)/);
});

test('ruční spuštění zůstává a poptávkovou bránu nemá', () => {
  const admin = fs.readFileSync('api/admin/generate-recipes.js', 'utf8');
  assert.match(admin, /runRecipeGenerator\(/);
  assert.ok(!/jenSPoptavkou/.test(admin), 'ruční běh nemá být zablokovaný poptávkou');
});

// ------------------------------------------------------- 4. cache

test('statická část vstupu generátoru jde první, proměnná poslední', () => {
  const klice = Object.keys(
    buildGeneratorInput(POLOZKA, ['mrkev'], ['Ovesná kaše'], 5, ['x'], 'kuře', 0.25, [], 0.3, ['kg'], ['tuk'])
  );
  const poradi = (k) => klice.indexOf(k);
  for (const promenny of ['pocet_receptu', 'meal_type', 'kcal_min', 'min_podil_bilkovin_pct', 'tyhle_suroviny_neznam']) {
    assert.ok(poradi('povolene_suroviny') < poradi(promenny), `povolene_suroviny má jít před ${promenny}`);
    assert.ok(poradi('uz_mame') < poradi(promenny), `uz_mame má jít před ${promenny}`);
  }
  assert.equal(poradi('povolene_suroviny'), 0);
});

test('cachované tokeny se účtují cachovanou sazbou', () => {
  const plna = estimateOpenAICostUSD('gpt-4.1-mini', 1_000_000, 0, 0);
  const zCache = estimateOpenAICostUSD('gpt-4.1-mini', 1_000_000, 0, 1_000_000);
  assert.ok(Math.abs(plna - 0.4) < 1e-9);
  assert.ok(Math.abs(zCache - 0.1) < 1e-9);
  // polovina cachovaná: 0,5 × 0,40 + 0,5 × 0,10
  assert.ok(Math.abs(estimateOpenAICostUSD('gpt-4.1-mini', 1_000_000, 0, 500_000) - 0.25) < 1e-9);
  // cache nemůže být víc než vstup
  assert.ok(Math.abs(estimateOpenAICostUSD('gpt-4.1-mini', 100, 0, 999) - estimateOpenAICostUSD('gpt-4.1-mini', 100, 0, 100)) < 1e-12);
});

test('účtenka zapisuje cached_tokens a přežije neaplikovanou migraci', () => {
  const zdroj = fs.readFileSync('lib/openai.js', 'utf8');
  assert.match(zdroj, /prompt_tokens_details\?\.cached_tokens/);
  assert.match(zdroj, /cached_tokens: Math\.max\(0/);
  assert.match(zdroj, /\/cached_tokens\/i\.test\(chybaZapisu/);
  const migrace = fs.readdirSync('supabase/migrations').find((f) => f.endsWith('_ai_runs_cached_tokens.sql'));
  assert.ok(migrace, 'chybí migrace pro ai_runs.cached_tokens');
  assert.match(fs.readFileSync(`supabase/migrations/${migrace}`, 'utf8'), /ADD COLUMN IF NOT EXISTS cached_tokens/);
});

// ---------------------------------------------------- 5. pojistka

test('denní strop: batch $0,50, interaktivní $3 zvlášť, generátor patří do batch', () => {
  assert.equal(DEFAULT_DAILY_BUDGET_USD, 0.5);
  assert.equal(DEFAULT_INTERACTIVE_DAILY_BUDGET_USD, 3);
  assert.ok(DEFAULT_DAILY_BUDGET_USD < DEFAULT_INTERACTIVE_DAILY_BUDGET_USD, 'generátor se musí zastavit první');
  assert.equal(jeBatchPurpose('recipe_generation'), true);
  assert.equal(jeBatchPurpose('doplneni_postupu_receptu'), true);
  assert.equal(jeBatchPurpose('preklad_receptu'), true);
  // TED, záměna jídla a plán batch nejsou
  for (const purpose of ['agent_ted_chat', 'recept_na_pozadani', 'generovani_planu', 'obohaceni_planu', 'agent_trener']) {
    assert.equal(jeBatchPurpose(purpose), false, `${purpose} nesmí sdílet strop s generátorem`);
  }
  assert.ok(BATCH_PURPOSY.length >= 5);
});

test('volejModel kontroluje rozpočet podle třídy purpose, generátor podle batch', () => {
  const openai = fs.readFileSync('lib/openai.js', 'utf8');
  assert.match(openai, /assertOpenAIDailyBudget\(jeBatchPurpose\(purpose\) \? 'batch' : 'interaktivni'\)/);
  const beh = fs.readFileSync('lib/recipeGeneratorRun.js', 'utf8');
  assert.match(beh, /assertOpenAIDailyBudget\('batch'\)/);
});
