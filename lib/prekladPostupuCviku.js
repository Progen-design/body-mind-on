/**
 * Překlad postupů cviků EN → CS — docs/DALSI_KROK.md 9.9 krok 3.
 *
 * TENTÝŽ MECHANISMUS JAKO U RECEPTŮ (lib/spoonacular/catalogTranslate.js),
 * žádný druhý: fronta se řídí sloupci v DB (`instructions_en` je,
 * `instructions_cs` chybí), překládá se dávkově jedním OpenAI voláním
 * s promptem verzovaným v gitu, zápis se ověřuje tím, co UPDATE vrátí,
 * a běží to ze stejného cronu (api/cron/translate-recipes.js) — recepty
 * mají přednost, cviky přijdou na řadu, až když fronta receptů mlčí.
 *
 * V čem se od receptů liší, a proč:
 *   - Žádný počítadlový sloupec pokusů (`translation_attempts`) — migrace
 *     20260907160000 je aplikovaná a další se psát nemá. Řádek, který se
 *     nepřeloží, zůstává ve frontě a zkusí se v dalším běhu; kdyby některý
 *     začal blokovat čelo fronty, bude to vidět v logu cronu (stejné id
 *     pořád dokola) a vyřeší se ručně.
 *   - Žádná dietní kontrola — u cviků nedává smysl. Místo ní je tvrdá
 *     kontrola počtu kroků 1:1: model nesmí kroky přidávat ani zahazovat,
 *     protože cvičební pokyny jsou zdravotně citlivé. POSTUP SE NIKDY
 *     NEGENERUJE — jen překládá; co ve zdroji není, v UI nebude.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { supabaseServer } from './supabaseServer.js';

const TRANSLATE_MODEL = 'gpt-4.1-mini';

/** Prompt žije v gitu (prompts/), do funkce ho vozí includeFiles "prompts/**" ve vercel.json. */
const PROMPT_PATH = join(process.cwd(), 'prompts', 'exercise-instructions-translate.md');
const TRANSLATE_SYSTEM_PROMPT = readFileSync(PROMPT_PATH, 'utf8');

/** Otisk promptu — loguje se ke každému běhu, stejně jako u receptů. */
export const PREKLAD_POSTUPU_PROMPT_SHA256 = createHash('sha256')
  .update(TRANSLATE_SYSTEM_PROMPT)
  .digest('hex');

/**
 * Dávka menší než u receptů není potřeba — postup cviku jsou 3–6 krátkých
 * vět, deset cviků je zlomek tokenů jedné receptové dávky.
 */
export const DAVKA_PREKLADU_POSTUPU = 10;

/**
 * @param {Array<{ id: number, instructions_en: string[] }>} rows
 * @returns {Promise<Map<number, string[]>>} id -> kroky česky
 */
async function prelozDavkuOpenAI(rows) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const openai = new OpenAI({ apiKey });
  const payload = rows.map((row) => ({ id: row.id, steps: row.instructions_en }));

  console.log(JSON.stringify({
    source: 'exercise-instructions-translate',
    event: 'batch_start',
    model: TRANSLATE_MODEL,
    prompt_sha256: PREKLAD_POSTUPU_PROMPT_SHA256,
    exercises: payload.length,
  }));

  const completion = await openai.chat.completions.create({
    model: TRANSLATE_MODEL,
    // Nula jako u receptů — překlad je deterministická úloha a rozptyl jen
    // zvyšuje šanci, že model něco domyslí.
    temperature: 0,
    max_tokens: 6000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI empty response');

  /** @type {{ exercises?: Array<{ id?: number, steps_cs?: string[] }> }} */
  const parsed = JSON.parse(raw);
  /** @type {Map<number, string[]>} */
  const byId = new Map();
  for (const item of Array.isArray(parsed.exercises) ? parsed.exercises : []) {
    const id = Number(item?.id);
    if (!Number.isFinite(id)) continue;
    const kroky = Array.isArray(item?.steps_cs)
      ? item.steps_cs.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
    byId.set(id, kroky);
  }
  return byId;
}

/**
 * Jedna dávka překladu postupů. Vrací stejný tvar jako receptová linka.
 *
 * @param {{ batch?: number }} [options]
 * @returns {Promise<{ translated: number, remaining: number, errors?: string[] }>}
 */
export async function runExerciseInstructionTranslation(options = {}) {
  const batch = options.batch ?? DAVKA_PREKLADU_POSTUPU;

  const { data: pending, error: loadErr } = await supabaseServer
    .from('exercise_asset_registry')
    .select('id, canonical_key, instructions_en')
    .not('instructions_en', 'is', null)
    .is('instructions_cs', null)
    .order('id', { ascending: true })
    .limit(batch);
  if (loadErr) throw new Error(loadErr.message);

  if (!pending?.length) {
    return { translated: 0, remaining: await zbyvaPrelozitPostupu() };
  }

  const preklady = await prelozDavkuOpenAI(pending);
  let translated = 0;
  /** @type {string[]} */
  const errors = [];

  for (const row of pending) {
    const kroky = preklady.get(row.id) || [];
    // POČET KROKŮ 1:1 JE TVRDÁ PODMÍNKA. Méně kroků = model něco zahodil,
    // více = něco domyslel. Obojí se u zdravotně citlivého textu nezapisuje;
    // řádek zůstane ve frontě a zkusí se znovu.
    if (kroky.length !== row.instructions_en.length) {
      errors.push(`Cvik ${row.id} (${row.canonical_key}): model vratil ${kroky.length} kroku misto ${row.instructions_en.length}, nezapisuji`);
      continue;
    }

    const { data: zapsano, error: updateErr } = await supabaseServer
      .from('exercise_asset_registry')
      .update({ instructions_cs: kroky })
      .eq('id', row.id)
      .select('id');

    if (updateErr) {
      errors.push(`Cvik ${row.id}: ${updateErr.message}`);
      continue;
    }
    // Tichý nezápis je chyba, ne úspěch — stejně jako u receptů.
    if (!Array.isArray(zapsano) || zapsano.length === 0) {
      errors.push(`Cvik ${row.id}: UPDATE nezapsal zadny radek`);
      continue;
    }
    translated += 1;
  }

  return {
    translated,
    remaining: await zbyvaPrelozitPostupu(),
    errors: errors.length ? errors : undefined,
  };
}

async function zbyvaPrelozitPostupu() {
  const { count, error } = await supabaseServer
    .from('exercise_asset_registry')
    .select('id', { count: 'exact', head: true })
    .not('instructions_en', 'is', null)
    .is('instructions_cs', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
