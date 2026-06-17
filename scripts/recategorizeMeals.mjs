#!/usr/bin/env node
/**
 * scripts/recategorizeMeals.mjs
 * Re-kategorizace meal_type v recipes_catalog přes OpenAI klasifikátor
 * (scripts/mealTypeClassifier.mjs — stejná logika jako seed/import).
 *
 * DEFAULT = DRY-RUN: jen vypíše tabulku "id | name_cs | current -> proposed" pro změny.
 * Zápis do DB až s flagem --apply (po review). Idempotentní — mění jen řádky,
 * kde se proposed liší od current.
 *
 * Spustit: node scripts/recategorizeMeals.mjs            (dry-run)
 *          node scripts/recategorizeMeals.mjs --apply    (zápis)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { classifyMealTypesWithOpenAI, CATALOG_MEAL_TYPES } from './mealTypeClassifier.mjs';

const APPLY = process.argv.includes('--apply');

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
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

function pad(s, len) {
  return String(s ?? '').padEnd(len);
}

async function main() {
  const { data: rows, error } = await supabase
    .from('recipes_catalog')
    .select('id, name_cs, name_en, meal_type, kcal, protein_g, carbs_g, fat_g')
    .eq('active', true)
    .order('id', { ascending: true });

  if (error) {
    console.error('Načtení recipes_catalog selhalo:', error.message);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log('Žádné aktivní recepty.');
    return;
  }

  console.log(`Klasifikuji ${rows.length} aktivních receptů (model: ${process.env.MEAL_CLASSIFIER_MODEL || 'gpt-4o-mini'})…`);
  const classified = await classifyMealTypesWithOpenAI(openai, rows);

  const changes = [];
  let unclassified = 0;
  for (const row of rows) {
    const proposed = classified.get(String(row.id));
    if (!proposed || !CATALOG_MEAL_TYPES.includes(proposed)) {
      unclassified++;
      continue;
    }
    if (proposed !== row.meal_type) {
      changes.push({ id: row.id, name_cs: row.name_cs, kcal: row.kcal, current: row.meal_type, proposed });
    }
  }

  console.log('');
  console.log(`Aktivních receptů: ${rows.length} | klasifikováno: ${classified.size} | bez výsledku: ${unclassified} | navržených změn: ${changes.length}`);
  console.log('');

  if (!changes.length) {
    console.log('Žádné změny — katalog je správně kategorizovaný.');
    return;
  }

  const nameLen = Math.min(60, Math.max(...changes.map((c) => String(c.name_cs || '').length), 7));
  console.log(`${pad('id', 5)} | ${pad('name_cs', nameLen)} | ${pad('kcal', 5)} | current -> proposed`);
  console.log('-'.repeat(5 + 3 + nameLen + 3 + 5 + 3 + 22));
  for (const c of changes) {
    console.log(
      `${pad(c.id, 5)} | ${pad(String(c.name_cs || '').slice(0, nameLen), nameLen)} | ${pad(c.kcal ?? '—', 5)} | ${c.current} -> ${c.proposed}`
    );
  }
  console.log('');

  const byTransition = {};
  for (const c of changes) {
    const k = `${c.current} -> ${c.proposed}`;
    byTransition[k] = (byTransition[k] || 0) + 1;
  }
  console.log('Souhrn přechodů:', JSON.stringify(byTransition, null, 2));

  if (!APPLY) {
    console.log('');
    console.log('DRY-RUN — nic nebylo zapsáno. Pro aplikaci spusť: node scripts/recategorizeMeals.mjs --apply');
    return;
  }

  console.log('');
  console.log('APPLY — zapisuji změny…');
  let updated = 0;
  let failed = 0;
  for (const c of changes) {
    const { error: upErr } = await supabase
      .from('recipes_catalog')
      .update({ meal_type: c.proposed })
      .eq('id', c.id);
    if (upErr) {
      failed++;
      console.error('[update-fail]', c.id, upErr.message);
    } else {
      updated++;
    }
  }
  console.log(JSON.stringify({ ok: failed === 0, updated, failed }, null, 2));
  process.exit(failed > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
