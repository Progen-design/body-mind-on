/**
 * Generátor receptů (plán A+). Katalog přestává záviset jen na Spoonacularu.
 *
 * Dělba práce je tvrdá a nedá se obejít:
 *   - LLM dodá název, suroviny, postup, meal_type, diet_tags a odhad času
 *   - LLM NIKDY nedodá kcal ani makra — počítá je compute_recipe_nutrition
 *   - recept se zapíše jen s complete = true a čeká na pending_review
 *   - aktivaci řeší beze změny trigger enforce_recipe_catalog_rules
 *
 * Uživatel na generování nikdy nečeká (běží mimo request, přes frontu) a nikdy
 * nedostane nezvalidovaný obsah (brána plus ruční schválení).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { supabaseServer } from './supabaseServer.js';
import { popisSkupiny, surovinySkupiny } from './plan/rotaceBilkovin.js';

/**
 * gpt-4o a teplota 0,9 — odchylka od zbytku repa (gpt-4o-mini @ 0) a záměrná.
 *
 * U odhadu času je žádané reprodukovatelné číslo, tam je nula správně. Tady je
 * úloha opačná: chceme, aby model vymýšlel RŮZNÉ recepty. Při nule vyjde z pěti
 * volání pětkrát variace na totéž a dedup je zahodí.
 *
 * Riziko vysoké teploty je běžně halucinace faktů — tady neexistuje, protože
 * model nesmí vrátit jediné číslo, které by šlo zhalucinovat. Kalorie ani makra
 * nedodává, suroviny má z uzavřeného seznamu a zbytek přepočítá SQL. Nejhorší
 * následek je nesmyslná kombinace surovin, a tu chytí ruční schválení.
 *
 * gpt-4o místo mini proto, že mini v češtině vyrábí kostrbaté názvy a postupy —
 * a čeština je jediné, co od modelu opravdu kupujeme.
 */
export const RECIPE_GEN_MODEL = 'gpt-4o';
export const RECIPE_GEN_TEMPERATURE = 0.9;
export const RECIPE_GEN_MAX_OUTPUT_TOKENS = 4000;
export const RECIPE_GEN_TIMEOUT_MS = 90_000;
/** Receptů na jedno volání. Seznam surovin se tím platí jednou místo pětkrát. */
export const RECIPE_GEN_BATCH = 5;

/** OVĚŘIT při změně modelu — špatná sazba tiše zkreslí každé vyúčtování. */
export const RECIPE_GEN_RATES_USD_PER_MTOK = Object.freeze({ input: 2.50, output: 10.00 });

const PROMPT_PATH = join(process.cwd(), 'prompts', 'recipe-generate.md');
/** Konce řádků normalizované na LF — otisk má identifikovat zadání, ne checkout. */
export const RECIPE_GEN_PROMPT = readFileSync(PROMPT_PATH, 'utf8').replace(/\r\n/g, '\n');
export const RECIPE_GEN_PROMPT_SHA256 = createHash('sha256').update(RECIPE_GEN_PROMPT).digest('hex');

/** Práh průniku surovin, nad kterým jde o tentýž recept. */
export const DEDUP_JACCARD_THRESHOLD = 0.7;

const RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'generated_recipes',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['recepty'],
      properties: {
        recepty: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name_cs', 'meal_type', 'diet_tags', 'servings',
              'ingredients', 'instructions', 'active_minutes', 'passive_minutes'],
            properties: {
              name_cs: { type: 'string' },
              meal_type: { type: 'string', enum: ['snidane', 'obed', 'vecere', 'svacina'] },
              diet_tags: { type: 'array', items: { type: 'string' } },
              servings: { type: 'integer', minimum: 1, maximum: 8 },
              ingredients: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'amount', 'unit'],
                  properties: {
                    name: { type: 'string' },
                    amount: { type: 'number', minimum: 0.1, maximum: 5000 },
                    unit: { type: 'string', enum: ['g', 'ml'] },
                  },
                },
              },
              instructions: { type: 'array', items: { type: 'string' } },
              active_minutes: { type: 'integer', minimum: 1, maximum: 600 },
              passive_minutes: { type: 'integer', minimum: 0, maximum: 10080 },
            },
          },
        },
      },
    },
  },
};

// --- Ochrany ---------------------------------------------------------------

export function isRecipeGenEnabled() {
  return String(process.env.RECIPE_GEN_ENABLED || 'true').toLowerCase() !== 'false';
}

export function maxPerRun() {
  const n = Number.parseInt(process.env.RECIPE_GEN_MAX_PER_RUN || '20', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 20;
}

export function maxPerDay() {
  const n = Number.parseInt(process.env.RECIPE_GEN_MAX_PER_DAY || '50', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 50;
}

/**
 * Kolik receptů vzniklo za posledních 24 h. Počítá se z ai_runs, ne z paměti
 * procesu — jinak by restart nebo druhá instance denní strop obešly.
 *
 * @returns {Promise<number>}
 */
export async function vyrobenoZa24h(client = supabaseServer) {
  const od = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // POČÍTÁ SE KATALOG, NE `ai_runs`.
  //
  // Do 14. 8. 2026 se denní strop skládal ze součtu `result.zapsano` přes
  // jednotlivá volání v `ai_runs`. To číslo je ale nafouknuté: hlásí kandidáty
  // přijaté daným voláním, jenže část z nich při finálním zápisu odpadne na
  // deduplikaci. Naměřeno na dvou po sobě jdoucích bězích: `ai_runs` dalo 61,
  // v katalogu přibylo 40. Strop 50 se tím vyčerpal po ~33 skutečných
  // receptech a generátor se škrtil hluboko pod nastavený rozpočet — což byl
  // vedle jednoho běhu denně druhý důvod, proč fronta stála.
  //
  // Katalog je jediná pravda o tom, kolik receptů opravdu vzniklo, a přesně to
  // má strop omezovat.
  const { count, error } = await client
    .from('recipes_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'llm_generated')
    .gte('created_at', od);
  if (error) throw new Error(`recipes_catalog: ${error.message}`);
  return count || 0;
}

// --- Deduplikace -----------------------------------------------------------

/**
 * Normalizace názvu pro porovnání: malá písmena, bez diakritiky, bez
 * interpunkce, jednoduché mezery. „Čočkové KARI, ostré!“ → „cockove kari ostre“.
 *
 * @param {string} nazev
 * @returns {string}
 */
export function normalizeRecipeName(nazev) {
  return String(nazev || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Jaccardova podobnost dvou množin surovin: |průnik| / |sjednocení|.
 *
 * Proč ne jen název: „Čočkové kari s rýží“ a „Kari z červené čočky s rýží“ jsou
 * dva různé řetězce, ale fakticky totéž jídlo. Průnik surovin to pozná.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0–1
 */
export function ingredientJaccard(a, b) {
  const mnozinaA = new Set((a || []).map(normalizeRecipeName).filter(Boolean));
  const mnozinaB = new Set((b || []).map(normalizeRecipeName).filter(Boolean));
  if (!mnozinaA.size && !mnozinaB.size) return 0;
  let prunik = 0;
  for (const x of mnozinaA) if (mnozinaB.has(x)) prunik += 1;
  const sjednoceni = mnozinaA.size + mnozinaB.size - prunik;
  return sjednoceni === 0 ? 0 : prunik / sjednoceni;
}

/**
 * Je recept duplicitní vůči už existujícím?
 *
 * @param {{ name_cs: string, ingredients: Array<{name:string}> }} novy
 * @param {Array<{ name_cs: string, ingredients: Array<{name:string}> }>} existujici
 * @param {{ prah?: number }} [opts]
 * @returns {{ duplicita: boolean, duvod: string|null, proti: string|null, skore?: number }}
 */
export function isDuplicateRecipe(novy, existujici, opts = {}) {
  const prah = opts.prah ?? DEDUP_JACCARD_THRESHOLD;
  const novyNazev = normalizeRecipeName(novy?.name_cs);
  const novySuroviny = (novy?.ingredients || []).map((i) => i?.name);

  for (const stary of existujici || []) {
    if (novyNazev && normalizeRecipeName(stary?.name_cs) === novyNazev) {
      return { duplicita: true, duvod: 'shodny_nazev', proti: stary?.name_cs, skore: 1 };
    }
    const skore = ingredientJaccard(novySuroviny, (stary?.ingredients || []).map((i) => i?.name));
    if (skore >= prah) {
      return { duplicita: true, duvod: 'prunik_surovin', proti: stary?.name_cs, skore };
    }
  }
  return { duplicita: false, duvod: null, proti: null };
}

/**
 * NEJVÍC KOMBINACÍ SUROVIN, KTERÉ JDOU DO PROMPTU JAKO „TOHLE UŽ MÁME".
 *
 * docs/DALSI_KROK.md 8.6(a). Změřeno naostro: běh zapsal 1 recept z 5, čtyři
 * zahodil `prunik_surovin` (Jaccard ≥ `DEDUP_JACCARD_THRESHOLD`) — všechny
 * čtyři proti položkám, které v katalogu už BYLY. Model je nevymyslel omylem
 * podruhé; nevěděl, že tam jsou. `uz_mame` (níž) posílá jen NÁZVY a i tak
 * failuje — model musí uhodnout, že „Banánový toast s arašídovým máslem
 * a chia semínky“ je totéž jako „Banánové plátky s arašídovým máslem
 * a chia“. Konkrétní SUROVINY je jednoznačnější signál než odhad podle jména.
 *
 * KOLIK JICH JDE POSLAT, ANIŽ BY TO NAFOUKLO CENU (dnes 0,096 USD/běh,
 * `RECIPE_GEN_RATES_USD_PER_MTOK`). Kombinace jako „banán, arašídové máslo,
 * chia semínka“ je ~15–20 tokenů. I 100 takových řádků je ~2 000 tokenů,
 * tedy `2000 / 1e6 * 2.50 =` 0,005 USD — 5 % dnešní ceny běhu, řádově míň
 * než cena JEDNÉ zahozené dávky. Cena tedy NENÍ důvod stropovat nízko.
 *
 * Strop existuje ze DRUHÉHO důvodu: `uz_mame` už dneska posílá 150–220
 * jmen (celý katalog daného chodu) a model si z toho zjevně nevzal ani
 * čtyři konkrétní shody, které měl vidět. Dlouhý, nediferencovaný seznam
 * je snadné podvědomí — kratší, ostřejší seznam s reálnou šancí na pozornost
 * je lepší sázka než "pošli všechno a doufej". Konkrétní číslo (30) je
 * odhad v tomhle duchu, ne změřené optimum — až se ukáže v datech, že
 * je moc nízké nebo vysoké, přeladit.
 */
export const MAX_KOMBINACI_V_PROMPTU = 30;

/**
 * Kombinace surovin existujících receptů pro prompt — text pro ČTENÍ modelem,
 * ne pro porovnávání (na to slouží `ingredientJaccard`/`isDuplicateRecipe`).
 *
 * Deduplikuje podle NORMALIZOVANÉ množiny surovin dřív, než ořízne na strop —
 * bez toho by pět porcových variant téhož jídla („Kuře s bramborem — porce
 * 180/300“, „— 150/350“, …) sežralo většinu stropu jednou kombinací
 * (stejný problém, který `zakladNazvuJidla` řeší pro `pestrostReceptu.js`).
 *
 * @param {Array<{ name_cs?: string, ingredients?: Array<{name?: string}> }>} existujici
 * @param {number} [limit]
 * @returns {string[]} každá položka je jedna kombinace, suroviny oddělené čárkou
 */
export function existujiciKombinaceSurovin(existujici, limit = MAX_KOMBINACI_V_PROMPTU) {
  const videneKlice = new Set();
  const vysledek = [];
  for (const recept of existujici || []) {
    if (vysledek.length >= limit) break;
    const jmena = [...new Set(
      (recept?.ingredients || [])
        .map((i) => String(i?.name || '').trim())
        .filter(Boolean)
    )];
    if (!jmena.length) continue;
    const klic = [...new Set(jmena.map(normalizeRecipeName))].filter(Boolean).sort().join('|');
    if (!klic || videneKlice.has(klic)) continue;
    videneKlice.add(klic);
    vysledek.push(jmena.join(', '));
  }
  return vysledek;
}

// --- Slovní zásoba ---------------------------------------------------------

/**
 * Suroviny, které umí compute_recipe_nutrition spárovat.
 *
 * Párování jde VÝHRADNĚ přes name_cs (viz definice funkce), takže řádky bez
 * českého názvu jsou pro generátor neviditelné a do promptu nepatří.
 *
 * Vrací i dietní příznaky — bez nich by do promptu pro vegan položku šlo
 * i maso a jediné, co by tomu bránilo, by byl text promptu.
 *
 * @returns {Promise<Array<{name:string,is_vegan:boolean,is_vegetarian:boolean}>>}
 */
export async function nactiPovoleneSuroviny(client = supabaseServer) {
  const { data, error } = await client
    .from('ingredients_nutrition')
    .select('name_cs,is_vegan,is_vegetarian')
    .not('name_cs', 'is', null)
    .order('name_cs');
  if (error) throw new Error(`ingredients_nutrition: ${error.message}`);
  return (data || [])
    .map((r) => ({
      name: String(r.name_cs).trim(),
      is_vegan: r.is_vegan === true,
      is_vegetarian: r.is_vegetarian === true,
    }))
    .filter((r) => r.name);
}

/**
 * Podmnožina slovníku, která odpovídá dietním tagům položky fronty.
 *
 * Model dostane jen to, z čeho SMÍ vařit. Prompt zůstává jako druhá vrstva,
 * ale primární obranou je, že maso ve vstupu vůbec není. Neznámý tag
 * (gluten_free, low_carb...) slovník neomezuje — ty zatím neumíme ověřit
 * a tvářit se, že ano, by bylo horší než to přiznat.
 *
 * @param {Array<{name:string,is_vegan:boolean,is_vegetarian:boolean}>} suroviny
 * @param {string[]} dietTags
 * @returns {string[]}
 */
export function surovinyProDietu(suroviny, dietTags = []) {
  const tagy = new Set((dietTags || []).map((t) => String(t).trim().toLowerCase()));
  return (suroviny || [])
    .filter((s) => {
      if (tagy.has('vegan')) return s.is_vegan;
      if (tagy.has('vegetarian')) return s.is_vegetarian;
      return true;
    })
    .map((s) => s.name);
}

/**
 * Recept se surovinou mimo seznam se zahodí JEŠTĚ PŘED zápisem — druhá pojistka
 * vedle promptu. compute_recipe_nutrition by ho sice stejně označil za neúplný,
 * ale to už by byl v tabulce a musel by se mazat.
 *
 * @param {{ ingredients: Array<{name:string}> }} recept
 * @param {Set<string>} povolene normalizované názvy
 * @returns {string[]} suroviny mimo seznam
 */
export function surovinyMimoSeznam(recept, povolene) {
  const mimo = [];
  for (const ing of recept?.ingredients || []) {
    if (!povolene.has(normalizeRecipeName(ing?.name))) mimo.push(ing?.name);
  }
  return mimo;
}

// --- Volání modelu ---------------------------------------------------------

/**
 * @param {object} polozka řádek recipe_generation_queue
 * @param {string[]} povoleneSuroviny UŽ profiltrované podle diety (surovinyProDietu)
 * @param {string[]} uzMame názvy existujících receptů téhož slotu
 * @param {number} kusu
 * @param {string[]} [nedohledane] suroviny z předchozího neúspěšného pokusu
 * @param {string|null} [hlavniBilkovina]
 * @param {number|null} [minPodilBilkovin]
 * @param {string[]} [existujiciKombinace] `existujiciKombinaceSurovin()` — kombinace surovin, ne názvy
 * @param {number|null} [maxPodilTuku] docs/DALSI_KROK.md 8.8 — horní mez, ne cíl
 */
export function buildGeneratorInput(
  polozka,
  povoleneSuroviny,
  uzMame,
  kusu,
  nedohledane = [],
  hlavniBilkovina = null,
  minPodilBilkovin = null,
  existujiciKombinace = [],
  maxPodilTuku = null,
) {
  // ADRESÁŘ, NE JEN PŘÁNÍ.
  //
  // Samotné „udělej hovězí“ model splní tak, že si název suroviny vymyslí —
  // a „hovězí svíčková“ v uzavřeném slovníku není, takže recept spadne na
  // kontrole surovin. Vypadalo by to, že hint nezabral, přitom by selhal
  // z úplně jiného důvodu. Proto se posílají i konkrétní povolené názvy.
  const adresar = surovinySkupiny(povoleneSuroviny, hlavniBilkovina);

  return {
    pocet_receptu: kusu,
    meal_type: polozka.meal_type,
    diet_tags: polozka.diet_tags || [],
    kcal_min: polozka.kcal_min,
    kcal_max: polozka.kcal_max,
    max_active_minutes: polozka.max_active_min ?? null,
    povolene_suroviny: povoleneSuroviny,
    uz_mame: uzMame,
    // docs/DALSI_KROK.md 8.6(a) — `uz_mame` posílá jen názvy a model si
    // podle nich nevšiml čtyř skoro-duplicit. Kombinace surovin je
    // jednoznačnější: neptá se modelu, jestli si dva různé názvy uvědomí
    // jako totéž jídlo, rovnou mu ukáže, co už NEMÁ dělat.
    ...(existujiciKombinace.length ? { existujici_kombinace_surovin: existujiciKombinace } : {}),
    ...(hlavniBilkovina && adresar.length
      ? {
        hlavni_bilkovina: hlavniBilkovina,
        hlavni_bilkovina_popis: popisSkupiny(hlavniBilkovina),
        hlavni_bilkovina_suroviny: adresar,
      }
      : {}),
    ...(nedohledane.length ? { tyhle_suroviny_neznam: nedohledane } : {}),
    /* MINIMALNI PODIL BILKOVIN.
       Posila se v procentech a spolu s gramy na 100 kcal, protoze "podil
       bilkovin 0.28" je pro model abstrakce, kterou splni od oka. Prepocet
       na gramy je konkretni zadani, ktere si umi zkontrolovat sam.
       Branu na to ma stejne prejimka v recipeGeneratorRun.js — tohle je
       zadani, ne kontrola. */
    ...(Number.isFinite(Number(minPodilBilkovin)) && Number(minPodilBilkovin) > 0
      ? {
        min_podil_bilkovin_pct: Math.round(Number(minPodilBilkovin) * 100),
        min_bilkovin_g_na_100_kcal: Math.round((Number(minPodilBilkovin) * 100) / 4 * 10) / 10,
      }
      : {}),
    /* TUKOVÝ STROP — docs/DALSI_KROK.md 8.8, obdoba bloku výš.
       Stejný důvod pro přepočet na gramy: "podíl tuku nejvýš 0,30" je
       abstrakce, "nejvýš 3,3 g tuku na 100 kcal" je konkrétní zadání, které
       si model umí zkontrolovat sám. Na rozdíl od bílkovin je to HORNÍ mez
       (recept s NIŽŠÍM podílem je v pořádku) a NENÍ to tvrdá validace —
       zapisRecept() v recipeGeneratorRun.js kvůli tuku recept nezahazuje,
       viz lib/plan/fatHint.js a migrace 20260903150000. */
    ...(Number.isFinite(Number(maxPodilTuku)) && Number(maxPodilTuku) > 0
      ? {
        max_podil_tuku_pct: Math.round(Number(maxPodilTuku) * 100),
        max_tuku_g_na_100_kcal: Math.round((Number(maxPodilTuku) * 100) / 9 * 10) / 10,
      }
      : {}),
  };
}

/**
 * @param {number} input_tokens
 * @param {number} output_tokens
 */
export function computeCostUsd(input_tokens = 0, output_tokens = 0) {
  const vstup = (input_tokens / 1e6) * RECIPE_GEN_RATES_USD_PER_MTOK.input;
  const vystup = (output_tokens / 1e6) * RECIPE_GEN_RATES_USD_PER_MTOK.output;
  return Number((vstup + vystup).toFixed(6));
}

/**
 * Jedno volání modelu = dávka receptů.
 *
 * @param {OpenAI} openai
 * @param {ReturnType<typeof buildGeneratorInput>} vstup
 */
export async function generateRecipeBatch(openai, vstup) {
  const completion = await openai.chat.completions.create(
    {
      model: RECIPE_GEN_MODEL,
      temperature: RECIPE_GEN_TEMPERATURE,
      max_tokens: RECIPE_GEN_MAX_OUTPUT_TOKENS,
      response_format: RESPONSE_SCHEMA,
      messages: [
        { role: 'system', content: RECIPE_GEN_PROMPT },
        { role: 'user', content: JSON.stringify(vstup) },
      ],
    },
    { timeout: RECIPE_GEN_TIMEOUT_MS },
  );

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI empty response');
  const parsed = JSON.parse(raw);
  const usage = {
    input_tokens: completion.usage?.prompt_tokens ?? 0,
    output_tokens: completion.usage?.completion_tokens ?? 0,
  };
  return {
    recepty: Array.isArray(parsed.recepty) ? parsed.recepty : [],
    usage,
    cost_usd: computeCostUsd(usage.input_tokens, usage.output_tokens),
  };
}
