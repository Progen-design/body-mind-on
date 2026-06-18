#!/usr/bin/env node
/**
 * scripts/translateInstructions.mjs
 * Batch backfill recipes_catalog.instructions_cs (EN→CS překlad nebo generování z názvu+surovin).
 * API: Anthropic (ANTHROPIC_API_KEY) — žádný runtime překlad v aplikaci.
 *
 * DEFAULT = dry-run (5 vzorků, nic nezapisuje):
 *   node scripts/translateInstructions.mjs
 *   node scripts/translateInstructions.mjs --dry-run
 * Plný zápis (idempotentní — přeskočí neprázdné instructions_cs):
 *   node scripts/translateInstructions.mjs --apply
 * Volitelně: --limit N
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const limitArgIdx = process.argv.indexOf('--limit');
const LIMIT = limitArgIdx > -1 ? Math.max(1, Number(process.argv[limitArgIdx + 1]) || 0) : null;
const DRY_RUN_SAMPLE = 5;
const ANTHROPIC_CHUNK = 2;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_INSTRUCTION_MODEL || 'claude-3-5-haiku-20241022';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function loadEnvFiles() {
  const loadFile = (name, keysFilter = null) => {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) return;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      if (keysFilter && !keysFilter.includes(k)) continue;
      process.env[k] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  };
  loadFile('.env');
  loadFile('.env.local');
  loadFile('.env.production.local', [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_INSTRUCTION_MODEL',
  ]);
}

loadEnvFiles();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Chybí ANTHROPIC_API_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

const stats = {
  anthropic_calls: 0,
  updated: 0,
  copied_cs: 0,
  failed: 0,
  skipped_has_instructions_cs: 0,
};

const EN_HINT =
  /\b(the|and|with|heat|add|mix|stir|bake|boil|minutes|until|bowl|pan|oven|tablespoon|teaspoon|preheat|serve|combine|whisk|season|slice|chop|cups?|ounces?|pounds?)\b/i;
const CS_HINT = /[ěščřžýáíéúůňťď]/i;

function parseInstructionLines(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    if (!raw.length) return [];
    return raw
      .map((step) => {
        if (typeof step === 'string') return step.trim();
        if (step && typeof step === 'object') {
          return String(step.step || step.text || step.original || '').trim();
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

function ingredientLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => {
      if (typeof i === 'string') return i.trim();
      if (i && typeof i === 'object') return String(i.original || i.name || i.text || '').trim();
      return '';
    })
    .filter(Boolean);
}

function looksEnglish(lines) {
  if (!lines.length) return false;
  const text = lines.join(' ');
  if (CS_HINT.test(text) && !EN_HINT.test(text)) return false;
  if (EN_HINT.test(text)) return true;
  if (!CS_HINT.test(text) && /[a-z]/i.test(text)) return true;
  return false;
}

async function callAnthropic(system, user, maxTokens = 4096) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }
  const data = await res.json();
  const block = data?.content?.find((c) => c.type === 'text');
  return block?.text?.trim() || '';
}

function parseJsonFromAnthropic(raw) {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function translateBatch(recipes) {
  const out = new Map();
  for (let i = 0; i < recipes.length; i += ANTHROPIC_CHUNK) {
    const chunk = recipes.slice(i, i + ANTHROPIC_CHUNK);
    const raw = await callAnthropic(
      `Překládáš kroky vaření z angličtiny do češtiny pro domácí kuchaře v ČR.
Pravidla:
- Zachovej přesně počet kroků a pořadí.
- Piš kulinářskou češtinu (srozumitelně, stručně).
- Převeď imperiální jednotky na metrické: oz→g/ml, cup→ml nebo „hrnek“ konzistentně v rámci receptu, lb→g, °F→°C.
- Oprav artefakty: „porce soli a pepře“ → „sůl a pepř dle chuti“, „season to taste“ → „dochutit dle chuti“.
- Vrať POUZE validní JSON: {"results":[{"id":<id>,"steps":["krok 1",...]}]} se stejnými id jako vstup.`,
      JSON.stringify({
        recipes: chunk.map((r) => ({
          id: r.id,
          name_cs: r.name_cs,
          steps_en: r.lines,
        })),
      })
    );
    stats.anthropic_calls++;
    const parsed = parseJsonFromAnthropic(raw);
    for (const res of parsed?.results || []) {
      const steps = Array.isArray(res?.steps)
        ? res.steps.map((s) => String(s).trim()).filter(Boolean)
        : [];
      if (res?.id != null && steps.length) out.set(String(res.id), steps);
    }
  }
  return out;
}

async function generateBatch(recipes) {
  const out = new Map();
  for (let i = 0; i < recipes.length; i += ANTHROPIC_CHUNK) {
    const chunk = recipes.slice(i, i + ANTHROPIC_CHUNK);
    const raw = await callAnthropic(
      `Generuješ postup vaření v češtině pro recepty bez existujícího postupu.
Pravidla:
- 3–6 kroků, jsonb pole stringů.
- Vycházej z name_cs a ingredients — nepřidávej suroviny, které nejsou v seznamu.
- Metrické jednotky, 1 porce, kulinářská čeština.
- Vrať POUZE validní JSON: {"results":[{"id":<id>,"steps":["krok 1",...]}]} se stejnými id jako vstup.`,
      JSON.stringify({
        recipes: chunk.map((r) => ({
          id: r.id,
          name_cs: r.name_cs,
          ingredients: r.ingredients.slice(0, 24),
        })),
      })
    );
    stats.anthropic_calls++;
    const parsed = parseJsonFromAnthropic(raw);
    for (const res of parsed?.results || []) {
      const steps = Array.isArray(res?.steps)
        ? res.steps.map((s) => String(s).trim()).filter(Boolean)
        : [];
      if (res?.id != null && steps.length >= 3 && steps.length <= 8) out.set(String(res.id), steps);
    }
  }
  return out;
}

function printSample(row, beforeLines, afterLines, mode) {
  console.log('');
  console.log(`--- #${row.id} ${row.name_cs} (${row.source || '?'}) [${mode}] ---`);
  if (beforeLines?.length) {
    console.log('PŘED:');
    beforeLines.forEach((s, i) => console.log(`  ${i + 1}. ${s.slice(0, 180)}${s.length > 180 ? '…' : ''}`));
  } else {
    console.log('PŘED: (prázdné instructions)');
  }
  console.log('PO (instructions_cs):');
  afterLines.forEach((s, i) => console.log(`  ${i + 1}. ${s.slice(0, 180)}${s.length > 180 ? '…' : ''}`));
}

async function main() {
  const { data: rows, error } = await supabase
    .from('recipes_catalog')
    .select('id, source, name_cs, name_en, ingredients, instructions, instructions_cs')
    .eq('active', true)
    .order('id', { ascending: true });

  if (error) {
    console.error('DB read failed:', error.message);
    process.exit(1);
  }

  const toTranslate = [];
  const toGenerate = [];
  const toCopy = [];

  for (const row of rows || []) {
    const existingCs = parseInstructionLines(row.instructions_cs);
    if (existingCs.length) {
      stats.skipped_has_instructions_cs++;
      continue;
    }

    const enLines = parseInstructionLines(row.instructions);
    if (enLines.length) {
      if (looksEnglish(enLines)) {
        toTranslate.push({ ...row, lines: enLines, mode: 'translate' });
      } else {
        toCopy.push({ ...row, lines: enLines, mode: 'copy' });
      }
      continue;
    }

    toGenerate.push({
      ...row,
      ingredients: ingredientLines(row.ingredients),
      mode: 'generate',
    });
  }

  const estimate = {
    active_total: (rows || []).length,
    needs_translate: toTranslate.length,
    needs_generate: toGenerate.length,
    needs_copy: toCopy.length,
    est_anthropic_calls:
      Math.ceil(toTranslate.length / ANTHROPIC_CHUNK) + Math.ceil(toGenerate.length / ANTHROPIC_CHUNK),
  };

  console.log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY-RUN', model: ANTHROPIC_MODEL, ...estimate }, null, 2));

  const workQueue = [...toTranslate, ...toGenerate];
  const limitedWork = LIMIT ? workQueue.slice(0, LIMIT) : workQueue;

  if (!limitedWork.length && !toCopy.length) {
    console.log('Žádné recepty k backfillu (všechny mají instructions_cs).');
    return;
  }

  if (!APPLY) {
    const sample = limitedWork.slice(0, DRY_RUN_SAMPLE);
    const sampleTranslate = sample.filter((r) => r.mode === 'translate');
    const sampleGenerate = sample.filter((r) => r.mode === 'generate');

    let translated = new Map();
    let generated = new Map();
    try {
      if (sampleTranslate.length) translated = await translateBatch(sampleTranslate);
      if (sampleGenerate.length) generated = await generateBatch(sampleGenerate);
    } catch (err) {
      console.error('Anthropic selhalo:', err?.message || err);
      process.exit(1);
    }

    console.log('');
    console.log(`=== DRY-RUN VZOREK (${sample.length} receptů) — zápis do instructions_cs ===`);
    for (const row of sample) {
      const steps =
        row.mode === 'translate'
          ? translated.get(String(row.id))
          : generated.get(String(row.id));
      if (steps?.length) printSample(row, row.lines || [], steps, row.mode);
      else console.log(`— #${row.id} ${row.name_cs}: BEZ VÝSLEDKU z Anthropic`);
    }
    if (toCopy.length) {
      console.log('');
      console.log(`(+ ${toCopy.length} receptů s již českým instructions → kopie do instructions_cs bez API)`);
    }
    console.log('');
    console.log(JSON.stringify({ dry_run: true, stats, estimate_full_run: estimate }, null, 2));
    console.log('Nic nebylo zapsáno. Plný zápis: node scripts/translateInstructions.mjs --apply');
    return;
  }

  const procTranslate = limitedWork.filter((r) => r.mode === 'translate');
  const procGenerate = limitedWork.filter((r) => r.mode === 'generate');
  const procCopy = LIMIT
    ? toCopy.slice(0, Math.max(0, LIMIT - limitedWork.length))
    : toCopy;

  let translated = new Map();
  let generated = new Map();
  if (procTranslate.length) translated = await translateBatch(procTranslate);
  if (procGenerate.length) generated = await generateBatch(procGenerate);

  for (const row of procCopy) {
    const { error: upErr } = await supabase
      .from('recipes_catalog')
      .update({ instructions_cs: row.lines })
      .eq('id', row.id);
    if (upErr) {
      stats.failed++;
      console.error('[copy-fail]', row.id, upErr.message);
    } else {
      stats.copied_cs++;
      stats.updated++;
    }
  }

  for (const row of procTranslate) {
    const steps = translated.get(String(row.id));
    if (!steps?.length) {
      stats.failed++;
      continue;
    }
    const { error: upErr } = await supabase
      .from('recipes_catalog')
      .update({ instructions_cs: steps })
      .eq('id', row.id);
    if (upErr) {
      stats.failed++;
      console.error('[translate-fail]', row.id, upErr.message);
    } else {
      stats.updated++;
    }
  }

  for (const row of procGenerate) {
    const steps = generated.get(String(row.id));
    if (!steps?.length) {
      stats.failed++;
      continue;
    }
    const { error: upErr } = await supabase
      .from('recipes_catalog')
      .update({ instructions_cs: steps })
      .eq('id', row.id);
    if (upErr) {
      stats.failed++;
      console.error('[generate-fail]', row.id, upErr.message);
    } else {
      stats.updated++;
    }
  }

  console.log(JSON.stringify({ ok: stats.failed === 0, ...stats }, null, 2));
  process.exit(stats.failed > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
