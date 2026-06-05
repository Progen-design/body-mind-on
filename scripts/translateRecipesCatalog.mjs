#!/usr/bin/env node
/**
 * Překlad name_cs v recipes_catalog (EN → CS) pro seed ze Spoonacular.
 * Cache jídla (meal_cache) už mají české názvy — přeskakuje se.
 *
 * Spustit: node scripts/translateRecipesCatalog.mjs
 * Dry-run: DRY_RUN=1 node scripts/translateRecipesCatalog.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const DRY_RUN = String(process.env.DRY_RUN || '').trim() === '1';
const CHUNK_SIZE = Number(process.env.TRANSLATE_CHUNK_SIZE || 16);

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  break;
}

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

function looksEnglish(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[áčďéěíňóřšťúůýž]/i.test(t)) return false;
  return /[a-z]/i.test(t);
}

function isGenericLabel(text) {
  const t = String(text || '').trim().toLowerCase();
  return !t || t === 'jídlo' || t === 'jidlo' || t === 'recept' || t === 'meal';
}

async function translateChunk(titles) {
  const toTranslate = titles.map((t) => String(t || '').trim().slice(0, 80)).filter(Boolean);
  if (!toTranslate.length) return titles.map(() => '');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      {
        role: 'system',
        content:
          'Přelož názvy receptů do přirozené češtiny. Odpověz POUZE validním JSON: {"titles": ["český název 1", ...]} — stejný počet a pořadí jako vstup. Zachovej kulinářský styl (kuře, losos, vejce…).',
      },
      { role: 'user', content: JSON.stringify(toTranslate) },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) return titles.map(() => '');
  const parsed = JSON.parse(raw);
  const out = Array.isArray(parsed?.titles) ? parsed.titles : [];
  let idx = 0;
  return titles.map((title) => {
    const t = String(title || '').trim();
    if (!t) return '';
    const cs = String(out[idx++] || '').trim();
    if (!cs || cs === t || isGenericLabel(cs)) return '';
    return cs;
  });
}

async function loadRowsNeedingTranslation() {
  const { data, error } = await supabase
    .from('recipes_catalog')
    .select('id, source, name_en, name_cs, meal_type')
    .eq('active', true)
    .eq('source', 'spoonacular')
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).filter((row) => {
    const en = String(row.name_en || '').trim();
    const cs = String(row.name_cs || '').trim();
    if (!en) return false;
    if (cs && cs !== en && !looksEnglish(cs)) return false;
    return looksEnglish(en) || cs === en;
  });
}

async function main() {
  const rows = await loadRowsNeedingTranslation();

  console.log(JSON.stringify({ to_translate: rows.length, dry_run: DRY_RUN, chunk_size: CHUNK_SIZE }, null, 2));
  if (rows.length === 0) {
    console.log('Nic k překladu.');
    return;
  }

  let updated = 0;
  let skipped = 0;
  const samples = [];

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const titles = chunk.map((row) => row.name_en);
    const translated = await translateChunk(titles);

    for (let j = 0; j < chunk.length; j++) {
      const row = chunk[j];
      const nameCs = String(translated[j] || '').trim();
      if (!nameCs || nameCs === row.name_en || looksEnglish(nameCs)) {
        skipped++;
        console.warn('[skip]', row.id, row.name_en, '→', nameCs || '(prázdné)');
        continue;
      }

      if (samples.length < 8) {
        samples.push({ id: row.id, en: row.name_en, cs: nameCs });
      }

      if (DRY_RUN) {
        updated++;
        continue;
      }

      const { error } = await supabase.from('recipes_catalog').update({ name_cs: nameCs }).eq('id', row.id);

      if (error) {
        console.error('[update-fail]', row.id, error.message);
        skipped++;
      } else {
        updated++;
      }
    }

    console.log(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(rows.length / CHUNK_SIZE)} hotovo`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: DRY_RUN,
        translated: updated,
        skipped,
        samples,
      },
      null,
      2
    )
  );

  if (!DRY_RUN) {
    const { data: check } = await supabase
      .from('recipes_catalog')
      .select('id, name_en, name_cs')
      .eq('source', 'spoonacular')
      .eq('active', true)
      .limit(500);
    const remaining = (check || []).filter((r) => {
      const cs = String(r.name_cs || '').trim();
      const en = String(r.name_en || '').trim();
      return !cs || cs === en || looksEnglish(cs);
    }).length;
    console.log(JSON.stringify({ remaining_untranslated: remaining }, null, 2));
    process.exit(remaining > 0 ? 2 : 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
