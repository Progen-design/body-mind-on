/**
 * OpenAI batch translation for recipes_catalog (EN → CS).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { supabaseServer } from '../supabaseServer.js';
import { overPokrytiSurovin, zbyvaPrelozit } from './prekladStav.js';
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
  const batch = options.batch ?? 20;
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
    // DŘÍV TU BYLO `.is('name_cs', null)` — fronta se řídila jen názvem.
    // Recept s přeloženým názvem a anglickými surovinami z ní vypadl navždy;
    // na produkci se to 21. 8. 2026 týkalo 74 ze 183 receptů a fronta hlásila
    // nulu. Kandidáti se teď vybírají podle všech tří výstupů překladu.
    pending = (await nactiKandidatyPrekladu()).slice(0, batch);
  }
  if (pending.length === 0) {
    const remaining = await countRemainingUntranslated();
    return { translated: 0, remaining };
  }

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

  const remaining = await countRemainingUntranslated();
  return { translated, remaining, errors: errors.length ? errors : undefined };
}

/**
 * Kolik receptů ještě čeká na překlad.
 *
 * Nestačí se ptát na `name_cs is null`. Překlad zapisuje název, suroviny
 * i postup a každý z nich může chybět zvlášť — „nepřeložená surovina“ se pozná
 * jen porovnáním `name` s `name_en` uvnitř JSONB, což PostgREST filtrem
 * neumí. Řádků je pár set, takže se načtou a vyhodnotí v paměti; kdyby jich
 * jednou byly desetitisíce, patří sem generovaný sloupec a index.
 */
async function nactiKandidatyPrekladu() {
  const { data, error } = await supabaseServer
    .from('recipes_catalog')
    .select('id, name_cs, name_en, ingredients, instructions, instructions_cs')
    .eq('source', 'spoonacular')
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).filter(zbyvaPrelozit);
}

async function countRemainingUntranslated() {
  return (await nactiKandidatyPrekladu()).length;
}
