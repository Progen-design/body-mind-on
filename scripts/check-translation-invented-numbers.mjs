#!/usr/bin/env node
/**
 * Deterministický checker: čísla v českém překladu postupu, která nemají oporu v anglickém zdroji.
 *
 * Žádné LLM, žádné zápisy. Jen čte recipes_catalog a porovnává množiny čísel.
 *
 * Referenční množina se bere ze VŠEHO anglického, co recept má:
 *   - text kroků v analyzedInstructions
 *   - length u kroků (strukturovaná délka)
 *   - ingredients[].original i ingredients[].amount
 *   - servings, ready_in_minutes
 * Jinak by se jako vymyšlené označilo "přidejte 200 g mrkve", kde 200 g legitimně
 * pochází ze seznamu surovin, ne z věty postupu.
 *
 * Legitimní převody jednotek se tolerují (°F→°C, cup→ml, oz→g, lb→kg/g, inch→cm),
 * včetně obvyklého zaokrouhlení.
 *
 *   node scripts/check-translation-invented-numbers.mjs
 *   node scripts/check-translation-invented-numbers.mjs --examples=10
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key);

const exampleCount = Number(
  (process.argv.find((a) => a.startsWith('--examples=')) || '--examples=5').slice(11),
) || 5;

/** Vytáhne všechna čísla z textu. Zvládá desetinnou čárku i tečku a zlomky 1/2. */
function extractNumbers(text) {
  const out = [];
  const s = String(text ?? '');
  // SMÍŠENÁ čísla první: "1 1/2 c. water" je 1,5 šálku, ne 1 a 0,5 zvlášť.
  // Bez tohohle vyjde převod cup→ml mimo toleranci a legitimní překlad se označí
  // za vymyšlený (narazil na to recept 34: 1 1/2 c → 360 ml).
  for (const m of s.matchAll(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g)) {
    const celek = Number(m[1]);
    const citatel = Number(m[2]);
    const jmenovatel = Number(m[3]);
    if (jmenovatel !== 0) out.push(celek + citatel / jmenovatel);
  }
  // samostatné zlomky: 1/2, 3/4
  for (const m of s.matchAll(/(\d+)\s*\/\s*(\d+)/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b !== 0) out.push(a / b);
  }
  // běžná čísla (desetinná tečka i čárka)
  for (const m of s.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = Number(String(m[0]).replace(',', '.'));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Kandidáti na legitimní převod jednotek z hodnoty y. */
function conversionCandidates(y) {
  return [
    { v: ((y - 32) * 5) / 9, tol: 4, kind: 'F→C' },
    { v: y * 236.588, tol: 20, kind: 'cup→ml' },
    { v: y * 28.3495, tol: 4, kind: 'oz→g' },
    { v: y * 453.592, tol: 15, kind: 'lb→g' },
    { v: y * 0.453592, tol: 0.08, kind: 'lb→kg' },
    { v: y * 2.54, tol: 0.6, kind: 'inch→cm' },
    { v: y * 15, tol: 2, kind: 'lžíce→ml' },
    { v: y * 5, tol: 1, kind: 'lžička→ml' },
    { v: y * 60, tol: 1, kind: 'hodina→minuty' },
    { v: y / 60, tol: 0.05, kind: 'minuty→hodina' },
  ];
}

/** Je x vysvětlitelné některým anglickým číslem — přímo nebo převodem? */
function hasBasis(x, enNumbers) {
  for (const y of enNumbers) {
    if (Math.abs(x - y) <= Math.max(0.02, Math.abs(y) * 0.02)) return { ok: true, via: 'shoda' };
  }
  for (const y of enNumbers) {
    for (const c of conversionCandidates(y)) {
      if (Math.abs(x - c.v) <= c.tol) return { ok: true, via: c.kind };
    }
    // zaokrouhlení na nejbližší 5 / 10 (typické u °C)
    for (const c of conversionCandidates(y)) {
      if (Math.abs(x - Math.round(c.v / 5) * 5) <= 2) return { ok: true, via: `${c.kind} (zaokr. 5)` };
      if (Math.abs(x - Math.round(c.v / 10) * 10) <= 3) return { ok: true, via: `${c.kind} (zaokr. 10)` };
    }
  }
  return { ok: false, via: null };
}

/** Podle kontextu kolem čísla určí, o jaký typ hodnoty jde. */
function classify(text, index) {
  const okoli = String(text).slice(index, index + 28).toLowerCase();
  if (/^\s*[\d.,/]*\s*(minut|min\b|hodin|sekund|vteřin)/.test(okoli)) return 'čas';
  if (/^\s*[\d.,/]*\s*(°\s*c|stup|celsi)/.test(okoli)) return 'teplota';
  if (/^\s*[\d.,/]*\s*(g\b|gram|kg\b|ml\b|l\b|dl\b|lžíc|lžič|šálk|hrnk|plátk|kus|ks\b)/.test(okoli)) return 'gramáž/objem';
  if (/^\s*[\d.,/]*\s*(porc|osob)/.test(okoli)) return 'porce';
  return 'jiné';
}

/**
 * `instructions` má v katalogu DVA tvary a oba se musí umět přečíst:
 *   1) analyzedInstructions ze Spoonacularu: [{ name, steps: [{ step, length }] }]
 *   2) prosté pole stringů (270 receptů, hlavně starší importy a seed)
 * Vrací pole objektů { step, length } bez ohledu na vstupní tvar.
 */
function enStepTexts(instructions) {
  const pole = Array.isArray(instructions) ? instructions : [];
  const out = [];
  for (const prvek of pole) {
    if (typeof prvek === 'string') {
      out.push({ step: prvek, length: null });
    } else if (prvek && Array.isArray(prvek.steps)) {
      out.push(...prvek.steps);
    }
  }
  return out;
}

/**
 * Text je česky, když obsahuje českou diakritiku.
 *
 * Záměrně JEN diakritika. Dřívější verze zkoušela i slovní znaky jako " a ", " v ",
 * " do " — jenže anglické "Heat a large saucepot" nebo "add a drizzle" je splňují
 * taky, takže se 286 anglických receptů falešně označilo za české a vypadlo
 * z porovnání. Diakritika je jednoznačná: anglický text ji nemá.
 */
function jeCesky(text) {
  return /[ěščřžýáíéúůňťďĚŠČŘŽÝÁÍÉÚŮŇŤĎ]/.test(String(text || ''));
}

const { data, error } = await supabase
  .from('recipes_catalog')
  .select('id, source, name_en, name_cs, active, meal_type, servings, ready_in_minutes, instructions, instructions_cs, ingredients')
  .order('id');

if (error) { console.error(error.message); process.exit(1); }

const zasazene = [];
const typyCelkem = {};
let bezPrekladu = 0;
let bezZdroje = 0;
let krokyNesedi = 0;
let ceskyZdroj = 0;

for (const r of data) {
  const csKroky = Array.isArray(r.instructions_cs) ? r.instructions_cs.filter((x) => typeof x === 'string') : [];
  const enKroky = enStepTexts(r.instructions);

  if (!csKroky.length) { bezPrekladu += 1; continue; }
  if (!enKroky.length) { bezZdroje += 1; continue; }

  // Zdroj, který je sám česky, není překlad — porovnávat ho nemá smysl.
  // Týká se seed receptů a starších ručních importů.
  const zdrojCesky = enKroky.filter((s) => jeCesky(s?.step)).length > enKroky.length / 2;
  if (zdrojCesky) { ceskyZdroj += 1; continue; }

  if (csKroky.length !== enKroky.length) krokyNesedi += 1;

  // referenční množina ze všeho anglického
  const enCisla = [];
  for (const s of enKroky) {
    enCisla.push(...extractNumbers(s?.step));
    if (s?.length?.number != null) enCisla.push(Number(s.length.number));
  }
  for (const ing of Array.isArray(r.ingredients) ? r.ingredients : []) {
    enCisla.push(...extractNumbers(ing?.original));
    if (ing?.amount != null) enCisla.push(Number(ing.amount));
  }
  if (r.servings != null) enCisla.push(Number(r.servings));
  if (r.ready_in_minutes != null) enCisla.push(Number(r.ready_in_minutes));

  const platna = enCisla.filter((n) => Number.isFinite(n));

  const vymyslena = [];
  for (const veta of csKroky) {
    for (const m of String(veta).matchAll(/\d+(?:[.,]\d+)?/g)) {
      const x = Number(String(m[0]).replace(',', '.'));
      if (!Number.isFinite(x)) continue;
      const zaklad = hasBasis(x, platna);
      if (zaklad.ok) continue;
      vymyslena.push({ hodnota: x, typ: classify(veta, m.index + m[0].length), veta });
    }
  }

  if (vymyslena.length) {
    for (const v of vymyslena) typyCelkem[v.typ] = (typyCelkem[v.typ] || 0) + 1;
    zasazene.push({
      id: r.id, name_en: r.name_en, name_cs: r.name_cs, active: r.active, meal_type: r.meal_type,
      pocet: vymyslena.length, vymyslena,
      enKroky: enKroky.map((s) => s?.step || ''), csKroky,
      enPocet: enKroky.length, csPocet: csKroky.length,
    });
  }
}

const aktivnich = zasazene.filter((z) => z.active).length;

console.log('='.repeat(78));
console.log('ČÍSLA V PŘEKLADU BEZ OPORY V ANGLICKÉM ZDROJI');
console.log('='.repeat(78));
console.log(`receptů celkem v katalogu            ${data.length}`);
console.log(`  z toho bez českého překladu        ${bezPrekladu}`);
console.log(`  z toho bez anglického postupu      ${bezZdroje}`);
console.log(`  z toho zdroj rovnou česky (seed)   ${ceskyZdroj}`);
console.log(`  porovnáno                          ${data.length - bezPrekladu - bezZdroje - ceskyZdroj}`);
console.log('');
console.log(`ZASAŽENÝCH RECEPTŮ                   ${zasazene.length}`);
console.log(`  z toho AKTIVNÍCH                   ${aktivnich}`);
console.log(`neshoda v počtu kroků                ${krokyNesedi}`);
console.log('');
console.log('rozpad vymyšlených hodnot podle typu:');
for (const [typ, n] of Object.entries(typyCelkem).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${typ.padEnd(16)} ${String(n).padStart(5)}`);
}

console.log('');
console.log('='.repeat(78));
console.log(`${exampleCount} NEJHORŠÍCH PŘÍPADŮ`);
console.log('='.repeat(78));
for (const z of zasazene.sort((a, b) => b.pocet - a.pocet).slice(0, exampleCount)) {
  console.log('');
  console.log(`--- id ${z.id} | ${z.active ? 'AKTIVNÍ' : 'neaktivní'} | ${z.meal_type} | vymyšlených čísel: ${z.pocet}`);
  console.log(`    ${z.name_en}`);
  console.log(`    ${z.name_cs}`);
  console.log(`    kroky EN/CS: ${z.enPocet}/${z.csPocet}`);
  const n = Math.max(z.enKroky.length, z.csKroky.length);
  for (let i = 0; i < n; i += 1) {
    console.log(`    [${i + 1}] EN: ${(z.enKroky[i] || '(chybí)').slice(0, 150)}`);
    console.log(`        CS: ${(z.csKroky[i] || '(chybí)').slice(0, 150)}`);
  }
  console.log(`    vymyšlené: ${z.vymyslena.map((v) => `${v.hodnota} (${v.typ})`).join(', ')}`);
}
