#!/usr/bin/env node
/**
 * scripts/translateInstructions.mjs
 * Jednorázový překlad recipes_catalog.instructions (EN → CS) přes OpenAI.
 *
 * DEFAULT = DRY-RUN: 3 vzorky, nic nezapisuje.
 *   node scripts/translateInstructions.mjs
 * Plný zápis (idempotentní — přeskočí už česky vypadající postupy):
 *   node scripts/translateInstructions.mjs --apply
 * Volitelně: --limit N
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const APPLY = process.argv.includes('--apply');
const limitArgIdx = process.argv.indexOf('--limit');
const LIMIT = limitArgIdx > -1 ? Math.max(1, Number(process.argv[limitArgIdx + 1]) || 0) : null;
const DRY_RUN_SAMPLE = 3;
const OPENAI_CHUNK = 3;

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
  ]);
}

loadEnvFiles();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('Chybí OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_MODEL = process.env.INSTRUCTION_TRANSLATE_MODEL || 'gpt-4o-mini';

const stats = { openai_calls: 0, updated: 0, failed: 0, skipped_already_cs: 0, skipped_empty: 0 };

const EN_HINT =
  /\b(the|and|with|heat|add|mix|stir|bake|boil|minutes|until|bowl|pan|oven|tablespoon|teaspoon|preheat|serve|combine|whisk|season|slice|chop)\b/i;
const CS_HINT = /[ěščřžýáíéúůňťď]/i;

function parseInstructions(raw) {
  if (raw == null) return { format: 'empty', original: null, lines: [] };
  if (Array.isArray(raw)) {
    if (!raw.length) return { format: 'empty', original: raw, lines: [] };
    if (typeof raw[0] === 'object' && raw[0] !== null) {
      const lines = raw
        .map((step) => String(step.step || step.text || step.original || '').trim())
        .filter(Boolean);
      return { format: 'objects', original: raw, lines };
    }
    const lines = raw.map((s) => String(s).trim()).filter(Boolean);
    return { format: 'strings', original: raw, lines };
  }
  if (typeof raw === 'string' && raw.trim()) {
    return { format: 'string', original: raw, lines: [raw.trim()] };
  }
  return { format: 'empty', original: raw, lines: [] };
}

function looksEnglish(lines) {
  if (!lines.length) return false;
  const text = lines.join(' ');
  if (CS_HINT.test(text) && !EN_HINT.test(text)) return false;
  if (EN_HINT.test(text)) return true;
  if (!CS_HINT.test(text) && /[a-z]/i.test(text)) return true;
  return false;
}

function rebuildInstructions(parsed, translatedLines) {
  if (!translatedLines.length) return null;
  if (parsed.format === 'objects' && Array.isArray(parsed.original)) {
    return parsed.original.map((step, i) => {
      const next = translatedLines[i] || String(step.step || step.text || step.original || '').trim();
      if (step && typeof step === 'object') {
        return { ...step, step: next, text: next, original: next };
      }
      return next;
    });
  }
  if (parsed.format === 'string') {
    return translatedLines.join('\n\n');
  }
  return translatedLines;
}

async function translateInstructionsCs(recipes) {
  const out = new Map();
  for (let i = 0; i < recipes.length; i += OPENAI_CHUNK) {
    const chunk = recipes.slice(i, i + OPENAI_CHUNK);
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Překládáš kroky vaření receptů z angličtiny do češtiny.
Zachovej počet kroků a pořadí. Piš srozumitelně pro domácí kuchaře v ČR (metrické jednotky v textu nech).
Odpověz POUZE validním JSON: {"results":[{"id":<id>,"steps":["krok 1 česky",...]}]} — stejná id jako vstup.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            recipes: chunk.map((r) => ({
              id: r.id,
              name_cs: r.name_cs,
              steps_en: r.lines,
            })),
          }),
        },
      ],
    });
    stats.openai_calls++;
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      for (const res of parsed?.results || []) {
        const steps = Array.isArray(res?.steps)
          ? res.steps.map((s) => String(s).trim()).filter(Boolean)
          : [];
        if (res?.id != null && steps.length) out.set(String(res.id), steps);
      }
    } catch {
      /* chunk skip */
    }
  }
  return out;
}

function printSample(row, beforeLines, afterLines) {
  console.log('');
  console.log(`--- #${row.id} ${row.name_cs} (${row.source || '?'}) ---`);
  console.log('PŘED (EN):');
  beforeLines.forEach((s, i) => console.log(`  ${i + 1}. ${s.slice(0, 160)}${s.length > 160 ? '…' : ''}`));
  console.log('PO (CS):');
  afterLines.forEach((s, i) => console.log(`  ${i + 1}. ${s.slice(0, 160)}${s.length > 160 ? '…' : ''}`));
}

async function main() {
  const { data: rows, error } = await supabase
    .from('recipes_catalog')
    .select('id, source, name_cs, instructions')
    .eq('active', true)
    .order('id', { ascending: true });

  if (error) {
    console.error('DB read failed:', error.message);
    process.exit(1);
  }

  const candidates = [];
  for (const row of rows || []) {
    const parsed = parseInstructions(row.instructions);
    if (!parsed.lines.length) {
      stats.skipped_empty++;
      continue;
    }
    if (!looksEnglish(parsed.lines)) {
      stats.skipped_already_cs++;
      continue;
    }
    candidates.push({ ...row, parsed, lines: parsed.lines });
  }

  const limited = LIMIT ? candidates.slice(0, LIMIT) : candidates;
  const estimate = {
    active_total: (rows || []).length,
    needs_translation: candidates.length,
    est_openai_calls: Math.ceil(limited.length / OPENAI_CHUNK),
  };

  console.log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY-RUN', ...estimate }, null, 2));

  const proc = APPLY ? limited : limited.slice(0, DRY_RUN_SAMPLE);
  if (!proc.length) {
    console.log('Žádné anglické postupy k překladu.');
    return;
  }

  if (!APPLY) {
    console.log('');
    console.log(`=== VZORKY K PŘEKLADU (${proc.length} receptů) — aktuální EN postup v DB ===`);
    for (const row of proc) {
      console.log('');
      console.log(`--- #${row.id} ${row.name_cs} (${row.source || '?'}) ---`);
      row.lines.forEach((s, i) => console.log(`  ${i + 1}. ${s.slice(0, 200)}${s.length > 200 ? '…' : ''}`));
    }
  }

  let translated = new Map();
  try {
    translated = await translateInstructionsCs(proc);
  } catch (err) {
    const msg = err?.message || String(err);
    console.warn('');
    console.warn(`⚠️ OpenAI volání selhalo: ${msg.slice(0, 240)}`);
    if (!APPLY) {
      console.warn('Dry-run ukázal vzorky z DB výše. Po obnovení kvóty spusť znovu pro náhled CS překladu.');
      console.log('');
      console.log(JSON.stringify({ dry_run: true, stats, estimate_full_run: estimate, openai_error: msg.slice(0, 200) }, null, 2));
      console.log('Nic nebylo zapsáno. Plný zápis: node scripts/translateInstructions.mjs --apply');
      return;
    }
    throw err;
  }

  if (!APPLY) {
    console.log('');
    console.log(`=== DRY-RUN VZOREK (${proc.length} receptů) — tvar, který by se zapsal do recipes_catalog.instructions ===`);
    for (const row of proc) {
      const csSteps = translated.get(String(row.id));
      if (csSteps) printSample(row, row.lines, csSteps);
      else console.log(`— #${row.id} ${row.name_cs}: BEZ VÝSLEDKU`);
    }
    console.log('');
    console.log(JSON.stringify({ dry_run: true, stats, estimate_full_run: estimate }, null, 2));
    console.log('Nic nebylo zapsáno. Plný zápis: node scripts/translateInstructions.mjs --apply');
    return;
  }

  for (const row of proc) {
    const csSteps = translated.get(String(row.id));
    if (!csSteps?.length) {
      stats.failed++;
      continue;
    }
    const nextInstructions = rebuildInstructions(row.parsed, csSteps);
    if (!nextInstructions) {
      stats.failed++;
      continue;
    }
    const { error: upErr } = await supabase
      .from('recipes_catalog')
      .update({ instructions: nextInstructions })
      .eq('id', row.id);
    if (upErr) {
      stats.failed++;
      console.error('[update-fail]', row.id, upErr.message);
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
