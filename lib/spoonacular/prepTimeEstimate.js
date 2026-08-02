/**
 * LLM odhad doby přípravy. Odhad NIKDY nepřepisuje ready_in_minutes — ta je
 * vyhrazená měřené hodnotě ze Spoonacularu a chrání ji trigger
 * protect_measured_ready_in_minutes. Odhad jde do prep_minutes_estimated.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { getMealSimplicityRules } from './catalogImportGate.js';

export const PREP_TIME_MODEL = 'gpt-4o-mini';
export const PREP_TIME_TEMPERATURE = 0;
export const PREP_TIME_MAX_OUTPUT_TOKENS = 200;
export const PREP_TIME_TIMEOUT_MS = 20000;

/**
 * Ceník gpt-4o-mini v USD za 1 M tokenů. OVĚŘIT při změně modelu — ceny se mění
 * a špatná sazba tady tiše zkreslí každé vyúčtování.
 */
export const PREP_TIME_RATES_USD_PER_MTOK = Object.freeze({ input: 0.15, output: 0.60 });

const PROMPT_PATH = join(process.cwd(), 'prompts', 'prep-time-estimate.md');
export const PREP_TIME_PROMPT = readFileSync(PROMPT_PATH, 'utf8');
export const PREP_TIME_PROMPT_SHA256 = createHash('sha256').update(PREP_TIME_PROMPT).digest('hex');

/** Strukturovaný výstup vynucený schématem, ne prosbou v promptu. */
const RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'prep_time_estimate',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['minutes', 'confidence', 'reasoning'],
      properties: {
        minutes: { type: 'integer', minimum: 1, maximum: 600 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reasoning: { type: 'string' },
      },
    },
  },
};

/**
 * Kroky z obou tvarů, ve kterých `instructions` v katalogu žijí.
 * @param {unknown} instructions
 * @returns {string[]}
 */
export function stepTexts(instructions) {
  const pole = Array.isArray(instructions) ? instructions : [];
  /** @type {string[]} */
  const out = [];
  for (const prvek of pole) {
    if (typeof prvek === 'string') out.push(prvek);
    else if (prvek && Array.isArray(prvek.steps)) {
      for (const s of prvek.steps) if (s?.step != null) out.push(String(s.step));
    }
  }
  return out;
}

/**
 * Vstup pro model. Záměrně NEobsahuje referenční čas ani readyInMinutes — jinak by
 * kalibrace měřila schopnost opsat zadání, ne odhadnout.
 *
 * @param {{ name_en?: string, ingredients?: unknown, instructions?: unknown }} recipe
 * @returns {{ title: string, ingredients: string[], steps: string[], step_count: number }}
 */
export function buildEstimateInput(recipe) {
  const kroky = stepTexts(recipe?.instructions);
  const suroviny = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients.map((i) => String(i?.name_en || i?.name || '').trim()).filter(Boolean)
    : [];
  return {
    title: String(recipe?.name_en || '').trim(),
    ingredients: suroviny,
    steps: kroky,
    step_count: kroky.length,
  };
}

/**
 * @param {{ input_tokens?: number, output_tokens?: number }} usage
 * @returns {number}
 */
export function computeCostUsd({ input_tokens = 0, output_tokens = 0 }) {
  const vstup = (input_tokens / 1e6) * PREP_TIME_RATES_USD_PER_MTOK.input;
  const vystup = (output_tokens / 1e6) * PREP_TIME_RATES_USD_PER_MTOK.output;
  return Number((vstup + vystup).toFixed(6));
}

/**
 * Jedno volání modelu pro jeden recept.
 *
 * @param {OpenAI} openai
 * @param {ReturnType<typeof buildEstimateInput>} input
 * @returns {Promise<{ minutes: number, confidence: number, reasoning: string, usage: { input_tokens: number, output_tokens: number }, cost_usd: number }>}
 */
export async function estimatePrepTime(openai, input) {
  const completion = await openai.chat.completions.create(
    {
      model: PREP_TIME_MODEL,
      temperature: PREP_TIME_TEMPERATURE,
      max_tokens: PREP_TIME_MAX_OUTPUT_TOKENS,
      response_format: RESPONSE_SCHEMA,
      messages: [
        { role: 'system', content: PREP_TIME_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ],
    },
    { timeout: PREP_TIME_TIMEOUT_MS },
  );

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI empty response');
  const parsed = JSON.parse(raw);

  const usage = {
    input_tokens: completion.usage?.prompt_tokens ?? 0,
    output_tokens: completion.usage?.completion_tokens ?? 0,
  };

  return {
    minutes: Number(parsed.minutes),
    confidence: Number(parsed.confidence),
    reasoning: String(parsed.reasoning || ''),
    usage,
    cost_usd: computeCostUsd(usage),
  };
}

// --- Pasivní čekání ---------------------------------------------------------

/**
 * Úseky, kde se u jídla nemusí stát. Do doby přípravy se nepočítají — ani promptu,
 * ani referenci. Reference je pouhý součet `length` u kroků a pasivní úseky v ní
 * sedí ve stejném sloupci jako aktivní práce (jeden krok = 8 hodin namáčení fazolí).
 */
export const PASSIVE_WAIT_REGEX = Object.freeze([
  /\bovernight\b/i,
  /\bchill(ed|ing|s)?\b/i,
  /\bfreez(e|er|ing)\b/i,
  /\bfrozen\b/i,
  /\bsoak(ed|ing|s)?\b/i,
  /\brefrigerat(e|ed|ing|or)\b/i,
  /\bfridge\b/i,
  /\bmarinat(e|ed|ing)\b/i,
  /\bmacerat(e|ed|ing)\b/i,
  /\bproof(ing)?\b/i,
  /\b(rise|risen|rising)\b/i,
  /\blet\b[^.]{0,40}\b(sit|stand|rest)\b/i,
]);

/**
 * Aktivní část reference: součet `length` u kroků BEZ kroků s pasivním čekáním.
 *
 * Vyhazuje se celá délka kroku, i když v něm kus aktivní práce je (krok "namoč přes
 * noc, pak přiveď k varu a duste" má jedno číslo pro obojí). Je to schválně —
 * jednostranný test stojí na tom, že reference je SPODNÍ mez skutečného aktivního
 * času. Odečíst navíc tu mez jen sníží, odečíst málo ji rozbije a "jistá" odpověď
 * pak jistá není.
 *
 * @param {unknown} instructions
 * @returns {{ celkem: number, pasivni: number, aktivni: number, kroku: number, sDelkou: number, pasivnichKroku: number }}
 */
export function referenceActiveMinutes(instructions) {
  const bloky = Array.isArray(instructions) ? instructions : [];
  const kroky = bloky.flatMap((b) => (Array.isArray(b?.steps) ? b.steps : []));

  let celkem = 0;
  let pasivni = 0;
  let sDelkou = 0;
  let pasivnichKroku = 0;

  for (const s of kroky) {
    const cislo = Number(s?.length?.number);
    if (!Number.isFinite(cislo) || cislo <= 0) continue;
    const minut = /^hour/i.test(String(s?.length?.unit || 'minutes')) ? cislo * 60 : cislo;
    sDelkou += 1;
    celkem += minut;
    const text = String(s?.step || '');
    if (PASSIVE_WAIT_REGEX.some((re) => re.test(text))) {
      pasivni += minut;
      pasivnichKroku += 1;
    }
  }

  return { celkem, pasivni, aktivni: celkem - pasivni, kroku: kroky.length, sDelkou, pasivnichKroku };
}

// --- Binární kalibrace ------------------------------------------------------

/**
 * Návrh prahu. Recall pod tímhle číslem znamená, že brána pouští ven jídla, o
 * kterých se DÁ DOKÁZAT, že limit slotu překračují — to je přesně ta chyba, která
 * uživatele poškodí.
 */
export const BINARY_CALIBRATION_THRESHOLDS = Object.freeze({ recallMin: 0.90 });

/**
 * Jednostranný test: měří se jen recepty, u kterých je odpověď jistá.
 *
 * Reference je spodní mez aktivního času. Když UŽ ONA limit slotu překročí,
 * skutečný čas ho překročí taky — bez ohledu na to, kolik reference nepokrývá.
 * Na téhle podmnožině se dá recall spočítat, aniž bychom o kvalitě reference
 * cokoli předpokládali. Opačný směr (reference pod limitem) jistý není a do
 * výpočtu nevstupuje — proto se tu nepočítá precision ani accuracy.
 *
 * @param {Array<{ id: number, meal: string, llm: number, aktivni: number, celkem: number }>} vzorky
 */
export function evaluateBinaryCalibration(vzorky) {
  const n = vzorky.length;
  if (!n) return null;

  const sLimitem = vzorky.map((v) => {
    const limit = getMealSimplicityRules(v.meal).maxReadyTime;
    return {
      ...v,
      limit,
      jisteNad: v.aktivni > limit,      // reference sama překročila → jistá odpověď
      modelNad: v.llm > limit,
      jisteNadBezOdecteni: v.celkem > limit,
    };
  });

  const jiste = sLimitem.filter((v) => v.jisteNad);
  const zachyceno = jiste.filter((v) => v.modelNad);
  const uniklo = jiste.filter((v) => !v.modelNad);

  /** @type {Record<string, { n: number, jiste: number, zachyceno: number, modelProsel: number, limit: number }>} */
  const poSlotech = {};
  for (const v of sLimitem) {
    const s = (poSlotech[v.meal] ||= { n: 0, jiste: 0, zachyceno: 0, modelProsel: 0, limit: v.limit });
    s.n += 1;
    if (v.jisteNad) s.jiste += 1;
    if (v.jisteNad && v.modelNad) s.zachyceno += 1;
    if (!v.modelNad) s.modelProsel += 1;
  }

  return {
    n,
    jistych: jiste.length,
    zachycenych: zachyceno.length,
    recall: jiste.length ? zachyceno.length / jiste.length : null,
    prosel: jiste.length
      ? zachyceno.length / jiste.length >= BINARY_CALIBRATION_THRESHOLDS.recallMin
      : false,
    uniklo,
    // Kolik by jich jistých bylo, kdyby se pasivní čekání neodečetlo — rozdíl
    // ukazuje, jak moc test na tom odečtu visí.
    jistychBezOdecteni: sLimitem.filter((v) => v.jisteNadBezOdecteni).length,
    // Verdikt brány podle odhadu modelu (to je hodnota, která by slot řídila).
    modelProslo: sLimitem.filter((v) => !v.modelNad).length,
    modelNeproslo: sLimitem.filter((v) => v.modelNad).length,
    // Totéž podle aktivní reference — jen u receptů, kde reference existuje.
    referenceProslo: sLimitem.filter((v) => v.aktivni <= v.limit).length,
    referenceNeproslo: sLimitem.filter((v) => v.aktivni > v.limit).length,
    poSlotech,
    vzorky: sLimitem,
  };
}
