/**
 * OpenAI batch translation for recipes_catalog (EN → CS).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { supabaseServer } from '../supabaseServer.js';
// `zbyvaPrelozit` se tu už nepoužívá — fronta se řídí sloupcem `translated_at`,
// ne odhadem z výsledku. Funkce zůstává v `prekladStav.js` pro diagnostiku
// a pro migraci, která tou heuristikou naposledy určila, koho ještě přeložit.
import { overPokrytiSurovin } from './prekladStav.js';
import { extractInstructionStepsEn } from './instructionSteps.js';
import { findFlattenedDietTerms } from '../dietCriticalTerms.js';

const TRANSLATE_MODEL = 'gpt-4.1-mini';

/**
 * Prompt žije v gitu jako prompts/catalog-translate.md, ne inline — aby šla změna
 * promptu recenzovat v diffu a aby se dala svázat s výsledkem přes SHA-256.
 * Soubor se do serverless funkce dostane přes `includeFiles` ve vercel.json.
 */
const PROMPT_PATH = join(process.cwd(), 'prompts', 'catalog-translate.md');
const TRANSLATE_SYSTEM_PROMPT = readFileSync(PROMPT_PATH, 'utf8');

/** Otisk promptu — loguje se ke každému běhu, aby šlo dohledat, čím byl text přeložen. */
export const TRANSLATE_PROMPT_SHA256 = createHash('sha256')
  .update(TRANSLATE_SYSTEM_PROMPT)
  .digest('hex');

/** IDs re-translated for prompt consistency after prompt updates. */
export const RETRANSLATE_RECIPE_IDS = Object.freeze([485, 486, 487, 488]);

/**
 * @param {import('next').NextApiRequest} [_req]
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, value: { batch: number } } | { ok: false, error: string }}
 */
export function parseTranslateBody(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const batchRaw = raw.batch != null ? Number(raw.batch) : 20;
  if (!Number.isFinite(batchRaw) || batchRaw < 1 || batchRaw > 50) {
    return { ok: false, error: 'batch must be 1–50' };
  }

  /** @type {number[]} */
  let ids = [];
  if (Array.isArray(raw.ids)) {
    ids = raw.ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  return { ok: true, value: { batch: Math.floor(batchRaw), ids } };
}

// Pozor: tady dřív stálo `export { extractInstructionStepsEn } from './instructionSteps.js'`.
// To je RE-EXPORT, ne import — symbol posílá dál, ale NEVYTVÁŘÍ lokální vazbu, takže
// volání o pár řádků níž padalo na ReferenceError při každém běhu cronu (1307× za 5 dní,
// 1.–5. 8. 2026). Symbol se teď importuje nahoře; re-export tu není, protože ho nikdo
// odsud netahá (importéry berou jen runCatalogRecipeTranslation).

/**
 * @param {unknown} ingredients
 * @returns {string[]}
 */
export function extractIngredientNamesEn(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.map((i) => {
    if (!i || typeof i !== 'object') return '';
    return String(i.name_en || i.name || '').trim();
  });
}

/**
 * @param {Array<{ id: number, name_en: string, ingredients: unknown, instructions: unknown }>} rows
 * @returns {Promise<Array<{ id: number, name_cs: string, ingredient_names_cs: string[], instructions_cs: string[] }>>}
 */
async function translateBatchWithOpenAI(rows) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const openai = new OpenAI({ apiKey });

  const payload = rows.map((row) => ({
    id: row.id,
    title: row.name_en,
    ingredients: extractIngredientNamesEn(row.ingredients),
    steps: extractInstructionStepsEn(row.instructions),
  }));

  console.log(JSON.stringify({
    source: 'catalog-translate',
    event: 'batch_start',
    model: TRANSLATE_MODEL,
    prompt_sha256: TRANSLATE_PROMPT_SHA256,
    recipes: payload.length,
  }));

  const completion = await openai.chat.completions.create({
    model: TRANSLATE_MODEL,
    // Nula, ne 0.2 — překlad receptu je deterministická úloha a rozptyl tady jen
    // zvyšuje šanci, že model něco domyslí.
    temperature: 0,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: TRANSLATE_SYSTEM_PROMPT,
      },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI empty response');

  /** @type {{ recipes?: Array<{ id?: number, name_cs?: string, ingredient_names_cs?: string[], instructions_cs?: string[] }> }} */
  const parsed = JSON.parse(raw);
  const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
  /** @type {Map<number, { id: number, name_cs: string, ingredient_names_cs: string[], instructions_cs: string[] }>} */
  const byId = new Map();

  for (const item of recipes) {
    const id = Number(item.id);
    if (!Number.isFinite(id)) continue;
    byId.set(id, {
      id,
      name_cs: String(item.name_cs || '').trim(),
      ingredient_names_cs: Array.isArray(item.ingredient_names_cs)
        ? item.ingredient_names_cs.map((s) => String(s || '').trim())
        : [],
      instructions_cs: Array.isArray(item.instructions_cs)
        ? item.instructions_cs.map((s) => String(s || '').trim()).filter(Boolean)
        : [],
    });
  }

  return rows.map((row) => {
    const hit = byId.get(row.id);
    return hit || {
      id: row.id,
      name_cs: '',
      ingredient_names_cs: [],
      instructions_cs: [],
    };
  });
}

/**
 * @param {{ batch?: number, ids?: number[] }} [options]
 * @returns {Promise<{ translated: number, remaining: number, errors?: string[] }>}
 */
export async function runCatalogRecipeTranslation(options = {}) {
  // DÁVKA 10, NE 20.
  // Dvacet receptů i s postupy je jeden request na 8000 tokenů a ten se
  // do maxDuration 120 s nevejde spolehlivě — 23. 8. skončily na 504 dva
  // z šesti běhů. Cron jede každých 5 minut, takže menší dávka nic nezdrží.
  const batch = options.batch ?? 10;
  const forceIds = Array.isArray(options.ids) && options.ids.length > 0 ? options.ids : null;

  /** @type {Array<Record<string, unknown>>} */
  let pending;

  if (forceIds) {
    const { data, error: loadErr } = await supabaseServer
      .from('recipes_catalog')
      .select('id, name_en, ingredients, instructions')
      .eq('source', 'spoonacular')
      .in('id', forceIds)
      .order('id', { ascending: true })
      .limit(batch);
    if (loadErr) throw new Error(loadErr.message);
    pending = data || [];
  } else {
    // Fronta se čte přímo z databáze podle `translated_at`, ne dotažením
    // všech receptů a filtrováním v paměti — viz komentář u
    // `nactiKandidatyPrekladu`.
    pending = await nactiKandidatyPrekladu(batch);
  }
  if (pending.length === 0) {
    const remaining = await countRemainingUntranslated();
    return { translated: 0, remaining };
  }

  // RECEPT BEZ ZDROJOVÝCH KROKŮ SE MODELU NEPOSÍLÁ.
  // Kontrola `instructions_cs` níž takový recept stejně odmítne, takže by
  // se pětkrát zaplatil za překlad postupu, který ve zdroji není. Změřeno
  // 23. 8. 2026: recept 47 „Finger Foods: Frittata Muffins“ má
  // `instructions = []` a vyčerpal všech pět pokusů. Takových receptů jsou
  // v katalogu tři. Vypadnou z fronty rovnou a s napsaným důvodem.
  if (!forceIds) {
    const bezKroku = pending.filter((row) => extractInstructionStepsEn(row.instructions).length === 0);
    if (bezKroku.length) {
      await Promise.all(bezKroku.map((row) => supabaseServer
        .from('recipes_catalog')
        .update({
          translation_attempts: MAX_POKUSU,
          translation_last_error: 'zdrojovy recept nema zadne kroky, neni co prekladat',
        })
        .eq('id', row.id)));
      const vyrazene = new Set(bezKroku.map((r) => r.id));
      pending = pending.filter((row) => !vyrazene.has(row.id));
    }
    if (pending.length === 0) {
      const remaining = await countRemainingUntranslated();
      return { translated: 0, remaining };
    }
  }

  // Pokus se počítá PŘED voláním modelu, aby se započítal i timeout.
  // U cíleného přepřekladu (`forceIds`) ne — tam si běh vynutil člověk.
  if (!forceIds) await zapocitejPokus(pending);

  const translations = await translateBatchWithOpenAI(pending);
  let translated = 0;
  /** @type {string[]} */
  const errors = [];

  for (let i = 0; i < pending.length; i += 1) {
    const row = pending[i];
    const tr = translations[i];
    const nameCs = String(tr?.name_cs || '').trim();
    if (!nameCs) {
      errors.push(`Recipe ${row.id}: empty name_cs`);
      continue;
    }

    /** @type {Array<Record<string, unknown>>} */
    const ingredients = Array.isArray(row.ingredients) ? [...row.ingredients] : [];
    const namesCs = tr?.ingredient_names_cs || [];

    // ČÁSTEČNÁ ODPOVĚĎ SE NEZAPÍŠE.
    // Dřív se chybějící název suroviny tiše nahradil anglickým originálem
    // a řádek se přesto uložil — včetně `name_cs`, čímž zmizel z fronty
    // s poloviční prací. Radši ať se recept zkusí znovu v dalším běhu.
    const pokryti = overPokrytiSurovin(ingredients, namesCs);
    if (!pokryti.ok) {
      errors.push(`Recipe ${row.id}: model vratil o ${pokryti.chybi} nazvu surovin min, nezapisuji`);
      continue;
    }

    const updatedIngredients = ingredients.map((ing, idx) => {
      if (!ing || typeof ing !== 'object') return ing;
      const csName = namesCs[idx] ? String(namesCs[idx]).trim() : String(ing.name || ing.name_en || '');
      return { ...ing, name: csName || ing.name, name_en: ing.name_en || ing.name };
    });

    const instructionsCs = (tr?.instructions_cs || []).filter(Boolean);
    if (!instructionsCs.length) {
      errors.push(`Recipe ${row.id}: empty instructions_cs`);
      continue;
    }

    // DIETNĚ KRITICKÉ VÝRAZY. Prompt o ně model požádá, tahle kontrola je
    // vymáhá. Změřeno na produkci 10. 8. 2026: překlad dělal z polenty
    // a grits „krupici“ (pšeničnou) a z „corn tortillas“ holé „tortilly“ —
    // z bezlepkové suroviny lepkovou. Takový překlad se do katalogu nezapíše,
    // protože dietní brána čte češtinu a nemá jak poznat, že lže.
    const flattened = findFlattenedDietTerms({
      en: [row.name_en, ...extractIngredientNamesEn(row.ingredients)].join(' '),
      cs: [nameCs, ...updatedIngredients.map((i) => String(i?.name || ''))].join(' '),
    });
    if (flattened.length) {
      errors.push(
        `Recipe ${row.id}: preklad zahodil dietni informaci — `
        + flattened.map((f) => `${f.en} → ma byt „${f.cs}“ (${f.why})`).join('; ')
      );
      console.error(JSON.stringify({
        source: 'catalog-translate',
        event: 'diet_term_flattened',
        recipe_id: row.id,
        prompt_sha256: TRANSLATE_PROMPT_SHA256,
        terms: flattened.map((f) => f.en),
      }));
      continue;
    }

    // ŽÁDNÁ PODMÍNKA `.is('name_cs', null)`.
    // Dřív tu byla jako pojistka proti dvojímu zápisu. Jenže fronta se
    // 21. 8. 2026 rozšířila i na recepty, kterým chybí jen suroviny nebo
    // postup — a ty název MAJÍ. UPDATE tak netrefil žádný řádek, Supabase
    // nevrátila chybu a `translated += 1` to počítalo jako hotovou práci.
    // Změřeno: tři běhy po sobě hlásily `{ translated: 19, remaining: 82 }`
    // a `max(updated_at)` v katalogu se nehnul, zatímco každý běh platil
    // OpenAI. Zápis se teď ověřuje tím, co se opravdu vrátí.
    const { data: zapsano, error: updateErr } = await supabaseServer
      .from('recipes_catalog')
      .update({
        name_cs: nameCs,
        ingredients: updatedIngredients,
        instructions_cs: instructionsCs,
        active: true,
        // Tímhle recept z fronty odchází natrvalo. Otisk promptu drží
        // vazbu na text, kterým byl přeložen — po změně promptu jde
        // dohledat, co se ještě překládalo tím starým.
        translated_at: new Date().toISOString(),
        translation_prompt_sha: TRANSLATE_PROMPT_SHA256,
        translation_last_error: null,
      })
      .eq('id', row.id)
      .select('id');

    if (updateErr) {
      errors.push(`Recipe ${row.id}: ${updateErr.message}`);
      continue;
    }
    // TICHÝ NEZÁPIS JE CHYBA, NE ÚSPĚCH. Když UPDATE nevrátí řádek, recept
    // mezitím zmizel nebo ho odmítla politika — ať je to vidět v logu.
    if (!Array.isArray(zapsano) || zapsano.length === 0) {
      errors.push(`Recipe ${row.id}: UPDATE nezapsal zadny radek`);
      continue;
    }
    translated += 1;
  }

  // DŮVOD NEÚSPĚCHU PATŘÍ K RECEPTU, NE JEN DO LOGU.
  // Po `MAX_POKUSU` recept z fronty vypadne. Bez zapsaného důvodu by se ztratil
  // tiše a nikdo by nevěděl, jestli ho zabila neúplná odpověď modelu, dietní
  // kontrola, nebo timeout. Log ve Vercelu má retenci; katalog ne.
  if (!forceIds && errors.length) await ulozChybyKReceptum(errors);

  const remaining = await countRemainingUntranslated();
  return { translated, remaining, errors: errors.length ? errors : undefined };
}

/**
 * Zapíše poslední chybu k receptu, kterého se týká.
 *
 * @param {string[]} errors hlášky ve tvaru `Recipe <id>: <text>`
 */
async function ulozChybyKReceptum(errors) {
  /** @type {Map<number, string>} */
  const podleId = new Map();
  for (const hlaska of errors) {
    const shoda = /^Recipe (\d+): (.*)$/.exec(hlaska);
    if (!shoda) continue;
    podleId.set(Number(shoda[1]), shoda[2].slice(0, 500));
  }

  await Promise.all([...podleId].map(([id, text]) => supabaseServer
    .from('recipes_catalog')
    .update({ translation_last_error: text })
    .eq('id', id)));
}

/**
 * Kolik receptů ještě čeká na překlad.
 *
 * FRONTA SE ŘÍDÍ EVIDENCÍ, NE ODHADEM Z VÝSLEDKU.
 *
 * Předchozí verze se ptala, jestli se `name` suroviny rovná `name_en`, a brala
 * to jako důkaz, že překlad neproběhl. Jenže spousta českých názvů je
 * s angličtinou shodná — změřeno na produkci 23. 8. 2026: quinoa 15×,
 * paprika 9×, mango 7×, oregano 6×, k tomu tofu, feta, ricotta, mozzarella.
 * Model je přeložil správně (nechal je), heuristika je přečetla jako
 * nedodělanou práci a recept vrátila do fronty. Šest běhů po sobě zapsalo
 * 19 receptů a `remaining` zůstalo na 68 — nekonečná placená smyčka nad
 * stejnými dvaceti recepty.
 *
 * Teď si každý zpracovaný recept nese `translated_at`. Zapsaný recept z fronty
 * zmizí, i když se některý název s angličtinou shoduje. Recept, který se
 * nezapsal (neúplná odpověď, dietní chyba), `translated_at` nedostane a zkusí
 * se znovu — nejvýš `MAX_POKUSU`, aby marný pokus nestál peníze donekonečna.
 */
export const MAX_POKUSU = 5;

async function nactiKandidatyPrekladu(limit = null) {
  let dotaz = supabaseServer
    .from('recipes_catalog')
    .select('id, name_cs, name_en, ingredients, instructions, instructions_cs, translation_attempts')
    .eq('source', 'spoonacular')
    .is('translated_at', null)
    .lt('translation_attempts', MAX_POKUSU)
    .order('id', { ascending: true });

  if (limit) dotaz = dotaz.limit(limit);

  const { data, error } = await dotaz;
  if (error) throw new Error(error.message);
  return data || [];
}

async function countRemainingUntranslated() {
  const { count, error } = await supabaseServer
    .from('recipes_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'spoonacular')
    .is('translated_at', null)
    .lt('translation_attempts', MAX_POKUSU);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Zvýší počítadlo pokusů PŘED voláním modelu.
 *
 * Kdyby se počítalo až po úspěchu, timeout funkce (120 s) by se nikdy
 * nezapočítal a recept, který dávku pokaždé přetáhne, by ji blokoval navždy.
 * Změřeno: 23. 8. dva z šesti běhů skončily na 504.
 *
 * @param {Array<{id: number, translation_attempts?: number}>} radky
 */
async function zapocitejPokus(radky) {
  await Promise.all(radky.map((row) => supabaseServer
    .from('recipes_catalog')
    .update({ translation_attempts: Number(row.translation_attempts ?? 0) + 1 })
    .eq('id', row.id)));
}
