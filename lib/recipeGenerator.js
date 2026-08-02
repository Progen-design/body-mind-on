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
  const { data, error } = await client
    .from('ai_runs')
    .select('result')
    .eq('purpose', 'recipe_generation')
    .is('error', null)
    .gte('created_at', od);
  if (error) throw new Error(`ai_runs: ${error.message}`);
  return (data || []).reduce((soucet, r) => soucet + (Number(r?.result?.zapsano) || 0), 0);
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

// --- Slovní zásoba ---------------------------------------------------------

/**
 * Suroviny, které umí compute_recipe_nutrition spárovat.
 *
 * Párování jde VÝHRADNĚ přes name_cs (viz definice funkce), takže řádky bez
 * českého názvu jsou pro generátor neviditelné a do promptu nepatří.
 *
 * @returns {Promise<string[]>}
 */
export async function nactiPovoleneSuroviny(client = supabaseServer) {
  const { data, error } = await client
    .from('ingredients_nutrition')
    .select('name_cs')
    .not('name_cs', 'is', null)
    .order('name_cs');
  if (error) throw new Error(`ingredients_nutrition: ${error.message}`);
  return (data || []).map((r) => String(r.name_cs).trim()).filter(Boolean);
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
 * @param {string[]} povoleneSuroviny
 * @param {string[]} uzMame názvy existujících receptů téhož slotu
 * @param {number} kusu
 * @param {string[]} [nedohledane] suroviny z předchozího neúspěšného pokusu
 */
export function buildGeneratorInput(polozka, povoleneSuroviny, uzMame, kusu, nedohledane = []) {
  return {
    pocet_receptu: kusu,
    meal_type: polozka.meal_type,
    diet_tags: polozka.diet_tags || [],
    kcal_min: polozka.kcal_min,
    kcal_max: polozka.kcal_max,
    max_active_minutes: polozka.max_active_min ?? null,
    povolene_suroviny: povoleneSuroviny,
    uz_mame: uzMame,
    ...(nedohledane.length ? { tyhle_suroviny_neznam: nedohledane } : {}),
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
