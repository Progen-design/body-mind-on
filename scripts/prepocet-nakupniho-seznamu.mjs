#!/usr/bin/env node
/**
 * PŘEPOČET GRAMÁŽE V NÁKUPNÍM SEZNAMU STARÝCH PLÁNŮ.
 *
 * PROČ. Uložený plán je zmražený JSON. Starší verze `ingredientLinesFromCatalogRow`
 * skládala řádek suroviny z `original` — nepřeložené americké věty, kterou LLM
 * recepty vůbec nemají — a při jejím chybění spadla na holé `name`. Množství se
 * tím zahodilo: „celozrnná pita" místo „80 g celozrnná pita". Kód je opravený
 * (řádek se skládá z `amount` + `unit` + `name`), ale plány vygenerované dřív
 * nesou staré řádky dál a samy se opraví až při dalším pregenerování.
 *
 * CO SKRIPT DĚLÁ. Jen tuhle jednu vadu: jídlo, jehož VŠECHNY řádky jsou bez
 * čísla, přepočítá z katalogu se zohledněním `portion_multiplier`. Nesahá na
 * makra, kalorie, názvy ani na cokoli dalšího v plánu — přepisuje výhradně
 * `shopping_ingredient_lines`.
 *
 * CO SKRIPT NEDĚLÁ. Nepřepočítává jídla, která gramáž mají (změřeno: per jídlo
 * je to všechno-nebo-nic, 0 smíšených z 55). Nesahá na neaktivní a archivní
 * plány — historii nepřepisujeme.
 *
 *   node scripts/prepocet-nakupniho-seznamu.mjs            # dry-run (výchozí)
 *   node scripts/prepocet-nakupniho-seznamu.mjs --apply    # zápis
 *
 * Skript je idempotentní: druhý běh musí hlásit 0 změn.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { radkySurovin } from '../lib/profile/surovinaRadek.js';
import { scaleIngredientsList } from '../lib/nutrition/atomicPortionScale.js';

const APLIKOVAT = process.argv.includes('--apply');

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  break;
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Nese řádek množství? „80 g pita" ano, „pita" ne. */
function maCislo(radek) {
  return /\d/.test(String(radek || ''));
}

/** Jídlo, kterému gramáž chybí úplně. Prázdný seznam se nepočítá. */
function chybiGramaz(jidlo) {
  const radky = jidlo?.shopping_ingredient_lines;
  if (!Array.isArray(radky) || radky.length === 0) return false;
  return radky.every((r) => !maCislo(r));
}

/** Uživatele logujeme jen prefixem — celé id do výstupu nepatří. */
function zkratka(id) {
  return String(id || '').slice(0, 8);
}

async function main() {
  console.log(APLIKOVAT ? '=== ZÁPIS (--apply) ===' : '=== DRY-RUN (nic se nezapisuje) ===');

  const { data: plany, error } = await supabase
    .from('ai_generated_plans')
    .select('id, user_id, created_at, structured_plan_json')
    .eq('is_active', true);

  if (error) throw new Error(`nacteni planu: ${error.message}`);
  console.log(`Aktivních plánů: ${plany.length}`);

  // Katalogové řádky pro všechna catalog_id, která se v plánech objeví.
  const idcka = new Set();
  for (const p of plany) {
    for (const d of p.structured_plan_json?.days ?? []) {
      for (const m of d?.meals ?? []) {
        if (m?.catalog_id !== null && m?.catalog_id !== undefined) idcka.add(Number(m.catalog_id));
      }
    }
  }

  const katalog = new Map();
  if (idcka.size > 0) {
    const { data: recepty, error: chyba } = await supabase
      .from('recipes_catalog')
      .select('id, ingredients')
      .in('id', [...idcka]);
    if (chyba) throw new Error(`nacteni katalogu: ${chyba.message}`);
    for (const r of recepty ?? []) katalog.set(Number(r.id), r);
  }
  console.log(`Katalogových receptů v plánech: ${katalog.size} z ${idcka.size} odkazovaných`);

  let jidelCelkem = 0;
  let bezZmeny = 0;
  let kOprave = 0;
  let neslo = 0;
  const ukazky = [];
  const planyKeZmene = [];

  for (const plan of plany) {
    const kopie = JSON.parse(JSON.stringify(plan.structured_plan_json ?? {}));
    let zmenenoVPlanu = 0;

    for (const den of kopie?.days ?? []) {
      for (const jidlo of den?.meals ?? []) {
        jidelCelkem++;

        if (!chybiGramaz(jidlo)) { bezZmeny++; continue; }

        const radek = katalog.get(Number(jidlo.catalog_id));
        const suroviny = Array.isArray(radek?.ingredients) ? radek.ingredients : null;
        if (!suroviny || suroviny.length === 0) { neslo++; continue; }

        const nasobek = Number(jidlo.portion_multiplier);
        const cil = Number.isFinite(nasobek) && nasobek > 0 ? nasobek : 1;

        // Katalog je uložený na násobku 1. Přeškálujeme na porci daného jídla
        // a teprve pak skládáme řádky. Makra ani kalorie nesaháme.
        const skalovane = scaleIngredientsList(suroviny, 1, cil);
        const nove = radkySurovin(skalovane);

        if (nove.length === 0 || nove.every((r) => !maCislo(r))) { neslo++; continue; }

        if (ukazky.length < 5) {
          ukazky.push({
            uzivatel: zkratka(plan.user_id),
            plan: plan.created_at?.slice(0, 10),
            jidlo: jidlo.display_name_cs || jidlo.name_cs || jidlo.display_name,
            nasobek: cil,
            pred: jidlo.shopping_ingredient_lines.slice(0, 4),
            po: nove.slice(0, 4)
          });
        }

        jidlo.shopping_ingredient_lines = nove;
        kOprave++;
        zmenenoVPlanu++;
      }
    }

    if (zmenenoVPlanu > 0) planyKeZmene.push({ id: plan.id, json: kopie, pocet: zmenenoVPlanu });
  }

  console.log('');
  console.log(`Jídel celkem:            ${jidelCelkem}`);
  console.log(`Gramáž má, beze změny:   ${bezZmeny}`);
  console.log(`K opravě:                ${kOprave} (v ${planyKeZmene.length} plánech)`);
  console.log(`Nelze opravit:           ${neslo} (chybí katalogový recept nebo suroviny bez množství)`);

  if (ukazky.length > 0) {
    console.log('\n--- ukázky před → po ---');
    for (const u of ukazky) {
      console.log(`\n[${u.uzivatel}] plán ${u.plan} • ${u.jidlo} • porce ×${u.nasobek}`);
      console.log(`  před: ${u.pred.join(' | ')}`);
      console.log(`  po:   ${u.po.join(' | ')}`);
    }
  }

  if (!APLIKOVAT) {
    console.log('\nDRY-RUN — nic se nezapsalo. Pro zápis spusť s --apply.');
    return;
  }

  let zapsano = 0;
  for (const p of planyKeZmene) {
    const { error: chyba } = await supabase
      .from('ai_generated_plans')
      .update({ structured_plan_json: p.json })
      .eq('id', p.id);
    if (chyba) {
      console.error(`  plán ${p.id}: ${chyba.message}`);
      continue;
    }
    zapsano += p.pocet;
  }
  console.log(`\nZapsáno: ${zapsano} jídel v ${planyKeZmene.length} plánech.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
