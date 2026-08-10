#!/usr/bin/env node
/**
 * PRO KAŽDÝ RECEPT S TAGEM `gluten_free` OVĚŘ, ŽE HO DIETNÍ BRÁNA PUSTÍ.
 *
 * Nesouhlas mezi tagem a bránou je vždycky chyba, jen se pokaždé opravuje
 * jinde — proto skript nevypisuje jedno číslo, ale rozděluje nálezy podle toho,
 * co se s nimi má dělat:
 *
 *   A) ŠPATNÝ TAG      — brána lepek vidí a má pravdu. Recept lepek opravdu
 *                        obsahuje (ramen, udon, pšeničná tortilla) a tag
 *                        `gluten_free` ze Spoonaculáru je špatný. Opravuje se
 *                        v DB odebráním tagu.
 *   B) ŠPATNÝ PŘEKLAD  — lepek je vidět jen v anglických datech (`name_en`),
 *                        český text ho zahodil. Recept je nejspíš opravdu
 *                        lepkový, ale hlavní vada je v překladu. Opravuje se
 *                        překladem (glosář v prompts/catalog-translate.md).
 *   C) FALEŠNÝ BLOK    — brána lepek vidí a NEMÁ pravdu. Recept je bezlepkový
 *                        a brána ho zbytečně blokuje. Opravuje se výjimkou
 *                        v GLUTEN_FREE_EXONERATIONS.
 *
 * Kategorie C skript odhadnout neumí — rozhoduje o ní člověk. Vypisuje se
 * proto pro každý nález konkrétní výraz, který branou pohnul, aby šlo rozhodnout
 * bez otevírání DB.
 *
 * DRUHÝM SMĚREM: recepty, kde lepek nesou jen anglická data, ať mají tag
 * gluten_free nebo ne. To je ta nebezpečnější polovina — brána, která by
 * angličtinu nečetla, je nevidí a plán projde.
 *
 * Spouští se proti produkci, čte jen `recipes_catalog`. Nic nezapisuje.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

import { loadLocalEnv } from './audit-utils.mjs';
import { buildDietaryPublishRules, mealDietaryViolation } from '../lib/dietaryPublishGate.js';
import { findGlutenTerm, findFlattenedDietTerms } from '../lib/dietCriticalTerms.js';

loadLocalEnv();

/**
 * Katalogový řádek → jídlo v tom tvaru, v jakém ho brána dostane v produkci.
 *
 * PROČ SE `catalogRowToStructuredMeal` NEIMPORTUJE. lib/recipesCatalog.js má
 * `import … from './supabaseServer'` bez přípony — v Next.js to bundler dořeší,
 * v holém Node ESM to spadne. Žádný skript v repu z něj proto netahá nic za
 * běhu. Tady se skládají jen ty tři plochy, které brána opravdu čte, a že to
 * pořád jsou tytéž plochy, hlídá `zkontrolujTvarJidla()` níž.
 *
 * @param {object} row
 * @returns {object}
 */
function rowToGateMeal(row) {
  const lines = Array.isArray(row.ingredients)
    ? row.ingredients
      .map((i) => (typeof i === 'string' ? i.trim() : String(i?.original || i?.name || i?.text || '').trim()))
      .filter(Boolean)
    : [];
  return {
    type: 'lunch',
    name_cs: row.name_cs || '',
    display_name_cs: row.name_cs || '',
    shopping_ingredient_lines: lines,
    recipe: { title_cs: row.name_cs || '', ingredients: row.ingredients || [] },
  };
}

/**
 * Kdyby se tvar jídla z katalogu změnil, `rowToGateMeal` by tichounku začal
 * lhát a skript by hlásil čistý katalog. Proto se drží proti zdrojáku.
 */
function zkontrolujTvarJidla() {
  const src = readFileSync(resolve(process.cwd(), 'lib/recipesCatalog.js'), 'utf8');
  const chyby = [];
  if (!/shopping_ingredient_lines:\s*shoppingIngredientLines/.test(src)) {
    chyby.push('meal.shopping_ingredient_lines už nevzniká z ingredientLinesFromCatalogRow');
  }
  if (!/return\s+String\(i\.original \|\| i\.name \|\| i\.text \|\| ''\)\.trim\(\)/.test(src)) {
    chyby.push('ingredientLinesFromCatalogRow už nebere original || name || text');
  }
  if (!/ingredients:\s*structuredIngredients/.test(src)) {
    chyby.push('meal.recipe.ingredients už není kopie row.ingredients');
  }
  if (chyby.length) {
    console.error('rowToGateMeal se rozešel s lib/recipesCatalog.js:');
    for (const c of chyby) console.error(`  - ${c}`);
    process.exit(2);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const BEZ_LEPKU = buildDietaryPublishRules({ diet_type: 'gluten_free' });

/** @param {object} row @returns {string} anglická surovinová data */
function anglickaFakta(row) {
  if (!Array.isArray(row.ingredients)) return '';
  return row.ingredients
    .flatMap((i) => (i && typeof i === 'object' ? [i.name_en, i.original] : []))
    .filter(Boolean)
    .join(' ');
}

/** @param {object} row @returns {string} co uživatel čte */
function ceskyText(row) {
  const ing = Array.isArray(row.ingredients)
    ? row.ingredients.map((i) => (typeof i === 'string' ? i : i?.name || '')).join(' ')
    : '';
  return `${row.name_cs || ''} ${ing}`;
}

async function vsechnyRadky() {
  /** @type {object[]} */
  const out = [];
  const KROK = 500;
  for (let od = 0; ; od += KROK) {
    const { data, error } = await db
      .from('recipes_catalog')
      .select('id, source, source_id, name_cs, name_en, meal_type, kcal, protein_g, carbs_g, fat_g, diet_tags, servings, ingredients, instructions, spoonacular_url, image_url')
      .eq('active', true)
      .order('id', { ascending: true })
      .range(od, od + KROK - 1);
    if (error) throw new Error(`recipes_catalog: ${error.message}`);
    out.push(...(data || []));
    if ((data || []).length < KROK) break;
  }
  return out;
}

function main() {
  zkontrolujTvarJidla();
  return vsechnyRadky().then((radky) => {
    const glutenFree = radky.filter((r) => (r.diet_tags || []).includes('gluten_free'));

    /** @type {Array<{ id: number, name_cs: string, name_en: string, meal_type: string, code: string, term: string|null, enTerm: string|null }>} */
    const nesouhlas = [];

    for (const row of glutenFree) {
      const code = mealDietaryViolation(rowToGateMeal(row), BEZ_LEPKU);
      if (!code) continue;
      nesouhlas.push({
        id: row.id,
        name_cs: row.name_cs || '',
        name_en: row.name_en || '',
        meal_type: row.meal_type || '',
        code,
        term: findGlutenTerm(ceskyText(row)),
        enTerm: findGlutenTerm(anglickaFakta(row)),
      });
    }

    // Druhý směr: lepek jen v angličtině, napříč celým katalogem.
    /** @type {Array<{ id: number, name_cs: string, name_en: string, enTerm: string, gfTag: boolean, flattened: string[] }>} */
    const jenAnglicky = [];
    for (const row of radky) {
      const cs = ceskyText(row);
      const en = anglickaFakta(row);
      if (findGlutenTerm(cs)) continue;
      const enTerm = findGlutenTerm(en);
      if (!enTerm) continue;
      jenAnglicky.push({
        id: row.id,
        name_cs: row.name_cs || '',
        name_en: row.name_en || '',
        enTerm,
        gfTag: (row.diet_tags || []).includes('gluten_free'),
        flattened: findFlattenedDietTerms({
          en: `${row.name_en || ''} ${en}`,
          cs,
        }).map((f) => `${f.en} → „${f.cs}“`),
      });
    }

    // ── výpis ────────────────────────────────────────────────────────────────
    const podleTypu = glutenFree.reduce((acc, r) => {
      acc[r.meal_type] = (acc[r.meal_type] || 0) + 1;
      return acc;
    }, /** @type {Record<string, number>} */ ({}));

    console.log(`\nAktivních receptů v katalogu: ${radky.length}`);
    console.log(`S tagem gluten_free: ${glutenFree.length} — ${
      Object.entries(podleTypu).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`Brána pustí: ${glutenFree.length - nesouhlas.length}/${glutenFree.length}\n`);

    if (nesouhlas.length) {
      console.log('── NESOUHLAS: tag říká bezlepkový, brána blokuje ──────────────────');
      console.log('   Buď špatný tag (A/B), nebo falešný blok brány (C). Rozhoduje výraz.\n');
      for (const n of nesouhlas) {
        const kde = n.code === 'gluten_free_source_en'
          ? `B/A — jen anglicky: „${n.enTerm}“`
          : `A/C — česky: „${n.term}“${n.enTerm && n.enTerm !== n.term ? `, anglicky: „${n.enTerm}“` : ''}`;
        console.log(`  id ${String(n.id).padEnd(4)} ${n.meal_type.padEnd(8)} ${kde}`);
        console.log(`           CS: ${n.name_cs}`);
        console.log(`           EN: ${n.name_en}`);
      }
      console.log('');
    } else {
      console.log('Žádný recept s tagem gluten_free brána neblokuje.\n');
    }

    if (jenAnglicky.length) {
      console.log('── LEPEK JEN V ANGLIČTINĚ: překlad dietní informaci zahodil ───────');
      console.log('   Brána, která čte jen češtinu, tyhle recepty NEVIDÍ.\n');
      for (const r of jenAnglicky) {
        console.log(`  id ${String(r.id).padEnd(4)} „${r.enTerm}“${r.gfTag ? '  [MÁ TAG gluten_free]' : ''}`);
        console.log(`           CS: ${r.name_cs}`);
        console.log(`           EN: ${r.name_en}`);
        if (r.flattened.length) console.log(`           glosář: ${r.flattened.join('; ')}`);
      }
      console.log('');
    }

    const spatnyTag = jenAnglicky.filter((r) => r.gfTag);
    console.log('── SOUHRN ─────────────────────────────────────────────────────────');
    console.log(`  tag gluten_free × brána blokuje:        ${nesouhlas.length}`);
    console.log(`  lepek jen v angličtině (celý katalog):  ${jenAnglicky.length}`);
    console.log(`  z toho s tagem gluten_free (špatný tag):${spatnyTag.length}`
      + (spatnyTag.length ? `  → id ${spatnyTag.map((r) => r.id).join(', ')}` : ''));

    // Nesouhlas je vždycky chyba — buď v tagu, nebo v překladu, nebo v bráně.
    const failed = nesouhlas.length > 0 || jenAnglicky.length > 0;
    console.log(failed ? '\nFAIL — nálezy výš je potřeba rozhodnout.\n' : '\nOK\n');
    process.exit(failed ? 1 : 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
