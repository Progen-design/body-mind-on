/**
 * JEDINÉ MÍSTO, KTERÉ SMÍ VOLAT MODEL OPENAI.
 *
 * PROMPT_NAKLADY_AI.md (2026-09-17/18) — OpenAI dashboard hlásil za 30 dní
 * $73,18 a 2 292 požadavků; `openai_daily_usage` znal jen $19,12 a 782
 * požadavků. Chybělo 74 % útraty. Příčina: účtování bylo rozeseté po
 * volajících (dva různé zápisy, `lib/recipeGeneratorRun.js` si dokonce
 * stavělo vlastního klienta a `lib/openai.js` úplně obcházelo) — dokud šlo
 * zavolat model bez zaúčtování, vždycky někde zůstala díra.
 *
 * `volejModel()` je teď JEDINÁ cesta k modelu z `api/` a `lib/`
 * (`scripts/verify-openai-uctovani.mjs` to hlídá). Bez `purpose` spadne,
 * DŘÍV než se model zavolá. Po KAŽDÉM volání — i po chybě nebo timeoutu —
 * zapíše účtenku do `ai_runs` (cena, tokeny, `purpose`, případná chyba) a
 * ověří denní rozpočet. `openai_daily_usage` je od migrace 20260828100000
 * pohled nad `ai_runs` + `ai_logs`, takže zápis do `ai_runs` stačí — žádné
 * samostatné `recordOpenAIUsage()` už neexistuje a nemá se vracet
 * (viz komentář v lib/aiOps.js).
 */
import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseServer } from './supabaseServer.js';
import { readOpenAICache, writeOpenAICache } from './aiOps.js';

// KLIENT SE STAVÍ AŽ PŘI PRVNÍM SKUTEČNÉM VOLÁNÍ, NE PŘI IMPORTU MODULU.
//
// `new OpenAI(...)` bez `apiKey` hází výjimku hned při konstrukci (chování
// SDK, ne bug). Kdyby se klient stavěl na úrovni modulu (`export const
// openai = new OpenAI(...)`, jak to bylo dřív), spadl by při importu úplně
// každý soubor, co `lib/openai.js` importuje — i transitivně — v každém
// prostředí bez OPENAI_API_KEY. Typicky `test:unit` v CI. Přesně kvůli
// tomuhle dřív funkce jako `zavolejModel(openai, vstup)` braly klienta jako
// parametr, aby test mohl dodat atrapu a vyhnout se importu tohohle
// souboru — `lib/planExerciseVariantBuilder.js` to má zdokumentované.
// Líné stavění řeší stejný problém jednou pro všechny, bez injektování.
let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/**
 * PROMPT_NAKLADY_AI_DODATEK.md (2026-09-18) — `purpose` hodnoty, jejichž
 * řádek v `ai_runs` NENÍ jednotlivé volání modelu, ale SOUHRN/DIAGNOSTIKA
 * nad voláními, která už mají svůj vlastní řádek s cenou jinde. Kdo tyhle
 * purposy sečte spolu se skutečnými voláními, započítá tutéž útratu dvakrát
 * — přesně bug, který `scripts/audit-unit-economics.mjs` 18. 9. 2026 hlásil
 * ($32,05 místo $19,04 za 30 dní, 68% nadhodnocení).
 *
 * `recipe_generator_beh` — jeden řádek za celý běh generátoru (kolik
 * receptů, jak dlouho, kolik zahozeno); cenu nesou dávky pod
 * `recipe_generation`, tenhle řádek od 18. 9. 2026 píše `cost_usd: null`
 * (viz `lib/recipeGeneratorRun.js`), ale HISTORICKÉ řádky ze staršího kódu
 * nulové nejsou — proto se to řeší filtrem, ne jen opravou zápisu.
 * `recipe_generation_vysledek` — diagnostika PO zpracování jedné dávky
 * (zahozeno podle důvodu, hlavní bílkovina, …), stejný vzor, stejný důvod.
 *
 * `openai_daily_usage` (migrace 20260828100000) `recipe_generator_beh`
 * vylučuje už teď — tahle konstanta jen dělá totéž pravidlo dohledatelné
 * a znovupoužitelné mimo tu jednu SQL definici.
 */
export const AGREGACNI_PURPOSY = Object.freeze(['recipe_generator_beh', 'recipe_generation_vysledek']);

/** @param {string|null|undefined} purpose */
export function jeAgregacniPurpose(purpose) {
  return AGREGACNI_PURPOSY.includes(purpose);
}

/**
 * Součet `cost_usd` (a volitelně tokenů) přes řádky `ai_runs`, s vyloučením
 * agregačních purposů — JEDINÉ místo, které tohle počítá, ať se nestane,
 * že si to někde jinde někdo spočítá znova a zapomene na filtr.
 *
 * @param {Array<{purpose?: string|null, cost_usd?: number|null, input_tokens?: number|null, output_tokens?: number|null}>} radky
 * @returns {{ celkemUsd: number, celkemVstupTokenu: number, celkemVystupTokenu: number, pocetVyloucenychAgregacnich: number, pouziteRadky: Array<object> }}
 */
export function sectiCenuBezAgregaci(radky) {
  const vsechny = Array.isArray(radky) ? radky : [];
  const pouzite = [];
  let vyloucenych = 0;
  let usd = 0;
  let vstup = 0;
  let vystup = 0;
  for (const r of vsechny) {
    if (jeAgregacniPurpose(r?.purpose)) {
      vyloucenych += 1;
      continue;
    }
    pouzite.push(r);
    usd += Number(r?.cost_usd) || 0;
    vstup += Number(r?.input_tokens) || 0;
    vystup += Number(r?.output_tokens) || 0;
  }
  return {
    celkemUsd: usd,
    celkemVstupTokenu: vstup,
    celkemVystupTokenu: vystup,
    pocetVyloucenychAgregacnich: vyloucenych,
    pouziteRadky: pouzite,
  };
}

/**
 * Sazby v USD za milion tokenů. JEDNA TABULKA — dřív existovaly dvě:
 * tahle (binární „je v názvu mini" heuristika) a `RECIPE_GEN_RATES_USD_PER_MTOK`
 * v `lib/recipeGenerator.js`, se stejnými čísly pro gpt-4o, ale ručně
 * udržované na dvou místech zvlášť.
 *
 * Binární heuristika navíc počítala VŠECHNY „*-mini" modely na cenu
 * gpt-4o-mini (0,15 / 0,60 za milion) — gpt-4.1-mini stojí 0,40 / 1,60,
 * tedy 2,67× víc. Ověřeno na https://platform.openai.com/docs/pricing
 * 18. 9. 2026. OVĚŘ ZNOVU při přidání modelu nebo změně ceníku.
 */
export const OPENAI_MODEL_RATES_USD_PER_MTOK = Object.freeze({
  'gpt-4o': Object.freeze({ input: 2.5, cachedInput: 1.25, output: 10.0 }),
  'gpt-4o-mini': Object.freeze({ input: 0.15, cachedInput: 0.075, output: 0.6 }),
  'gpt-4.1': Object.freeze({ input: 2.0, cachedInput: 0.5, output: 8.0 }),
  'gpt-4.1-mini': Object.freeze({ input: 0.4, cachedInput: 0.1, output: 1.6 }),
});

// Neznámý model (nový string z env přepisu jako OPENAI_PLAN_MODEL) dostane
// nejdražší ze známých sazeb — radši útratu nadhodnotit, než ji tiše ztratit
// jako dřív.
const FALLBACK_RATE_USD_PER_MTOK = OPENAI_MODEL_RATES_USD_PER_MTOK['gpt-4o'];

/**
 * PROMPT_NAKLADY_MINIMUM.md bod 4 — `cachedInputTokens` je podmnožina
 * `inputTokens` (OpenAI je v `prompt_tokens` počítá celé), která se účtuje
 * cachovanou sazbou. Bez toho účtenka nadhodnocovala každé volání s opakovaným
 * začátkem promptu a report se rozcházel s dashboardem. Cachované sazby
 * ověř znovu na https://platform.openai.com/docs/pricing při změně ceníku.
 */
export function estimateOpenAICostUSD(model, inputTokens = 0, outputTokens = 0, cachedInputTokens = 0) {
  const rate = OPENAI_MODEL_RATES_USD_PER_MTOK[String(model || '').toLowerCase().trim()] || FALLBACK_RATE_USD_PER_MTOK;
  const input = Number(inputTokens) || 0;
  const output = Number(outputTokens) || 0;
  const cached = Math.min(input, Math.max(0, Number(cachedInputTokens) || 0));
  return ((input - cached) / 1_000_000) * rate.input + (cached / 1_000_000) * rate.cachedInput + (output / 1_000_000) * rate.output;
}

export class AIBudgetReachedError extends Error {
  constructor(message = 'OpenAI daily budget reached') {
    super(message);
    this.name = 'AIBudgetReachedError';
    this.code = 'AI_BUDGET_REACHED';
  }
}

/*
 * DENNÍ STROPY ÚTRATY ZA OPENAI — DVA, ODDĚLENÉ.
 *
 * PROMPT_NAKLADY_MINIMUM.md bod 5. Do 21. 9. 2026 byl jeden společný strop
 * $3 přes všechna volání. Kdyby ho vyčerpal generátor receptů (99 % útraty),
 * TED, záměna jídla a tvorba plánu by dostaly `AIBudgetReachedError` — tedy
 * přesně věci, které uživatel vidí, by zaplatily za práci, kterou nevidí.
 *
 *   batch          generátor, překlady, doplňování postupů (`BATCH_PURPOSY`).
 *                  Strop $0,50 denně, počítaný JEN z útraty batch purposů.
 *                  Zastaví se první. `OPENAI_DAILY_BUDGET_USD` přepisuje.
 *   interaktivní   všechno ostatní (TED, záměna jídla, plán, agenti). Strop
 *                  $3 denně přes CELOU útratu — pojistka proti utečení, ne
 *                  omezení. Generátor je pod svými $0,50, takže do TEDova
 *                  prostoru nikdy nezasáhne. `OPENAI_INTERACTIVE_DAILY_BUDGET_USD`
 *                  přepisuje.
 *
 * Neznámý `purpose` je interaktivní: radši nechat projít člověka než ho
 * zablokovat kvůli špatně zařazenému štítku.
 */
export const DEFAULT_DAILY_BUDGET_USD = 0.5;
export const DEFAULT_INTERACTIVE_DAILY_BUDGET_USD = 3;

export const BATCH_PURPOSY = Object.freeze([
  'recipe_generation',
  'preklad_receptu',
  'preklad_receptu_katalog',
  'preklad_postupu_cviku',
  'doplneni_postupu_receptu',
]);

/** @param {string|null|undefined} purpose */
export function jeBatchPurpose(purpose) {
  return BATCH_PURPOSY.includes(purpose);
}

/**
 * @param {'batch'|'interaktivni'} [trida='interaktivni'] Bez argumentu se
 *   kontroluje interaktivní strop — volající, kteří třídu neznají (např.
 *   `runAgent()`), tak dostanou tu příznivější pro uživatele.
 * @returns {Promise<{ allowed: boolean, spent: number, budget: number, trida: string }>}
 */
export async function assertOpenAIDailyBudget(trida = 'interaktivni') {
  const batch = trida === 'batch';
  const budget = Number(
    batch
      ? process.env.OPENAI_DAILY_BUDGET_USD || DEFAULT_DAILY_BUDGET_USD
      : process.env.OPENAI_INTERACTIVE_DAILY_BUDGET_USD || DEFAULT_INTERACTIVE_DAILY_BUDGET_USD
  );
  if (!Number.isFinite(budget) || budget <= 0) return { allowed: true, spent: 0, budget, trida };

  const usageDate = new Date().toISOString().slice(0, 10);
  try {
    let spent = 0;
    if (batch) {
      // Jen účtenky batch purposů. `openai_daily_usage` je celkový součet
      // (vč. TEDa) a nedá se z něj poznat, kdo utrácí.
      const { data, error } = await supabaseServer
        .from('ai_runs')
        .select('cost_usd')
        .in('purpose', BATCH_PURPOSY)
        .gte('created_at', `${usageDate}T00:00:00.000Z`)
        .limit(5000);
      if (error) return { allowed: true, spent: 0, budget, trida };
      spent = (data || []).reduce((soucet, r) => soucet + (Number(r?.cost_usd) || 0), 0);
    } else {
      const { data, error } = await supabaseServer
        .from('openai_daily_usage')
        .select('spent_usd')
        .eq('usage_date', usageDate)
        .maybeSingle();
      if (error) return { allowed: true, spent: 0, budget, trida };
      spent = Number(data?.spent_usd || 0);
    }

    if (spent >= budget) return { allowed: false, spent, budget, trida };
    return { allowed: true, spent, budget, trida };
  } catch {
    return { allowed: true, spent: 0, budget, trida };
  }
}

function hashPromptContent(value) {
  try {
    return crypto.createHash('sha256').update(JSON.stringify(value ?? '')).digest('hex');
  } catch {
    return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
  }
}

/**
 * Účtenka za jedno volání (nebo jeden cache hit, nebo jedno zablokování
 * rozpočtem). Selhání zápisu nesmí shodit volajícího — bez řádku jen chybí
 * viditelnost, ne funkčnost.
 */
async function zapisUctenku({
  purpose,
  model,
  temperature,
  promptSha256,
  recipeId = null,
  inputTokens = 0,
  outputTokens = 0,
  cachedTokens = 0,
  costUsd = 0,
  result = null,
  error = null,
}) {
  try {
    const radek = {
      purpose,
      model: model || 'unknown',
      temperature: Number.isFinite(temperature) ? temperature : 0,
      prompt_sha256: promptSha256,
      recipe_id: recipeId,
      input_tokens: Math.max(0, Math.round(inputTokens) || 0),
      output_tokens: Math.max(0, Math.round(outputTokens) || 0),
      cost_usd: Number.isFinite(costUsd) ? costUsd : 0,
      result,
      error: error ? String(error).slice(0, 2000) : null,
    };
    const { error: chybaZapisu } = await supabaseServer
      .from('ai_runs')
      .insert({ ...radek, cached_tokens: Math.max(0, Math.round(cachedTokens) || 0) });
    // Sloupec `cached_tokens` přidává migrace 20260921120000, která se
    // nasazuje odděleně od kódu. Do té doby by insert padal na KAŽDÉM volání
    // a účtenky by mizely — proto se při chybějícím sloupci zapíše řádek
    // bez něj (cena v `cost_usd` už cachovanou sazbu nese).
    if (chybaZapisu && /cached_tokens/i.test(chybaZapisu.message || '')) {
      await supabaseServer.from('ai_runs').insert(radek);
    }
  } catch {
    // Diagnostika, ne práce — nesmí přerušit volajícího.
  }
}

/**
 * JEDINÁ CESTA K MODELU Z `api/` A `lib/`.
 *
 * `params` je přesně to, co čeká OpenAI SDK (`model`, `messages` pro Chat
 * Completions NEBO `instructions`/`input`/`text` pro Responses API, plus
 * `temperature`, `max_tokens`, `response_format`, …) — PLUS tyhle navíc:
 *
 * @param {object} params
 * @param {string} params.purpose POVINNÉ. Účel volání (`recipe_generation`,
 *   `preklad_receptu`, `generovani_planu`, …) — podle něj se čte rozpad
 *   nákladů (`npm run audit:unit-economics`). Bez něj `volejModel()` spadne
 *   DŘÍV, než by zavolal model.
 * @param {'chat'|'responses'} [params.api='chat'] Která plocha OpenAI SDK —
 *   `chat.completions.create` (výchozí) nebo `responses.create`.
 * @param {string} [params.promptSha256] Otisk promptu pro `ai_runs`. Když
 *   chybí, spočítá se automaticky z `messages`/`instructions`+`input` — u
 *   promptů čtených ze souboru (`prompts/*.md`) radši pošli SHA toho
 *   souboru, ne autogenerovaný, ať zůstane stopovatelný ke zdroji.
 * @param {number|null} [params.recipeId] FK do `recipes_catalog`, když
 *   volání patří ke konkrétnímu receptu.
 * @param {string|null} [params.cacheKey] Když je zadaný, `openai_response_cache`
 *   se zkontroluje PŘED voláním (cache hit se do `ai_runs` zapíše s nulovou
 *   cenou a `result.cache_hit: true`) a zapíše se PO úspěšném volání.
 * @param {boolean} [params.record=true] Výjimka z pravidla „obal zapíše
 *   účtenku vždy" — jen pro volající, který hned po volání sám dopíše VLASTNÍ,
 *   úplnější řádek do `ai_runs` (typicky proto, že teprve po naparsování
 *   odpovědi zná výsledek, který chce v `result`, jako
 *   `lib/spoonacular/prepTimeEstimate.js` pro `--rescore`). Rozpočet se
 *   kontroluje i s `record: false` — jen se PO volání nic nezapisuje.
 * @param {import('openai').RequestOptions} [options] 2. argument SDK
 *   (`signal` pro AbortController, atd.) — beze změny se předá dál.
 * @returns {Promise<object|{fromCache:true, rawContent:string}>} Syrová
 *   odpověď SDK (`.choices`/`.output_text` podle `api`), nebo při cache
 *   hitu `{ fromCache: true, rawContent }`.
 */
export async function volejModel(params, options = undefined) {
  const { purpose, api = 'chat', promptSha256: explicitSha, recipeId = null, cacheKey = null, record = true, ...sdkParams } = params || {};

  if (!purpose || typeof purpose !== 'string' || !purpose.trim()) {
    throw new Error('volejModel: "purpose" je povinný parametr — bez něj se model nesmí volat.');
  }
  if (api !== 'chat' && api !== 'responses') {
    throw new Error(`volejModel: neznámé "api" (${api}) — povolené jsou 'chat' nebo 'responses'.`);
  }

  const model = sdkParams.model || 'unknown';
  const temperature = Number.isFinite(sdkParams.temperature) ? sdkParams.temperature : 0;
  const promptSha256 =
    explicitSha ||
    hashPromptContent(api === 'chat' ? sdkParams.messages : { instructions: sdkParams.instructions, input: sdkParams.input });

  if (cacheKey) {
    const cached = await readOpenAICache(cacheKey);
    if (cached?.rawContent) {
      await zapisUctenku({ purpose, model, temperature, promptSha256, recipeId, result: { cache_hit: true } });
      return { fromCache: true, rawContent: cached.rawContent };
    }
  }

  const budgetState = await assertOpenAIDailyBudget(jeBatchPurpose(purpose) ? 'batch' : 'interaktivni');
  if (!budgetState.allowed) {
    await zapisUctenku({
      purpose,
      model,
      temperature,
      promptSha256,
      recipeId,
      error: `daily_budget_reached spent=${budgetState.spent} budget=${budgetState.budget}`,
    });
    throw new AIBudgetReachedError(
      `OpenAI daily budget reached (spent $${budgetState.spent}, budget $${budgetState.budget}). purpose=${purpose}`
    );
  }

  const client = getClient();
  let response = null;
  let callError = null;
  try {
    response =
      api === 'responses'
        ? await client.responses.create(sdkParams, options)
        : await client.chat.completions.create(sdkParams, options);
  } catch (err) {
    callError = err;
  }

  const usage = response?.usage || {};
  const inputTokens = api === 'responses' ? Number(usage.input_tokens || 0) : Number(usage.prompt_tokens || 0);
  const outputTokens = api === 'responses' ? Number(usage.output_tokens || 0) : Number(usage.completion_tokens || 0);
  // OpenAI cachuje automaticky opakovaný začátek promptu (≥ 1 024 tokenů)
  // a hlásí kolik — Chat Completions v `prompt_tokens_details`, Responses
  // v `input_tokens_details`.
  const cachedTokens = Number(
    (api === 'responses' ? usage.input_tokens_details?.cached_tokens : usage.prompt_tokens_details?.cached_tokens) || 0
  );
  const costUsd = estimateOpenAICostUSD(model, inputTokens, outputTokens, cachedTokens);

  if (record) {
    await zapisUctenku({
      purpose,
      model,
      temperature,
      promptSha256,
      recipeId,
      inputTokens,
      outputTokens,
      cachedTokens,
      costUsd,
      result: callError
        ? null
        : {
            finish_reason: api === 'chat' ? response?.choices?.[0]?.finish_reason ?? null : null,
            response_id: response?.id ?? null,
          },
      error: callError ? callError.message || String(callError) : null,
    });
  }

  if (cacheKey && !callError) {
    const rawContent =
      api === 'responses'
        ? response.output_text || response.output?.[0]?.content?.[0]?.text || ''
        : response.choices?.[0]?.message?.content || '';
    if (rawContent) await writeOpenAICache(cacheKey, rawContent);
  }

  if (callError) throw callError;
  return response;
}
