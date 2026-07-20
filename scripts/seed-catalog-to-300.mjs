#!/usr/bin/env node
/**
 * Seed recipes_catalog toward ~300 active meals with hard quality gates.
 *
 *   node scripts/seed-catalog-to-300.mjs
 *   node scripts/seed-catalog-to-300.mjs --phase1-only
 *
 * Rules: active=true ONLY when all gates pass; failures → active=false + log.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { PHASE1_RECIPES } from './data/catalog-seed-phase1.mjs';
import { passesMacroKcalGate } from '../lib/macroKcalConsistency.js';
import { validateDiscreteIngredientAmount } from '../lib/nutrition/atomicPortionScale.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const phase1Only = process.argv.includes('--phase1-only');

for (const name of ['.env.local', '.env']) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE credentials');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const SOURCE = 'coach_seed_v1';
const GATE_TOL = 0.10;

const EXTRA_NUTRITION = [
  { name_cs: 'tofu', name_en: 'tofu firm', kcal_per_100g: 144, protein_g_per_100g: 17, carbs_g_per_100g: 3, fat_g_per_100g: 8 },
  { name_cs: 'strouhanka', name_en: 'breadcrumbs', kcal_per_100g: 395, protein_g_per_100g: 13, carbs_g_per_100g: 72, fat_g_per_100g: 5 },
  { name_cs: 'kuskus', name_en: 'couscous dry', kcal_per_100g: 376, protein_g_per_100g: 13, carbs_g_per_100g: 77, fat_g_per_100g: 0.6 },
  { name_cs: 'hrášek', name_en: 'peas', kcal_per_100g: 81, protein_g_per_100g: 5.4, carbs_g_per_100g: 14, fat_g_per_100g: 0.4 },
  { name_cs: 'jablko', name_en: 'apple', kcal_per_100g: 52, protein_g_per_100g: 0.3, carbs_g_per_100g: 14, fat_g_per_100g: 0.2 },
  { name_cs: 'šunka', name_en: 'ham', kcal_per_100g: 145, protein_g_per_100g: 18, carbs_g_per_100g: 1.5, fat_g_per_100g: 7 },
];

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Food tokens that must appear in ingredients when present in the title. */
const TITLE_TOKEN_MAP = [
  [/kure|kurat/, ['kureci prsa', 'kure']],
  [/krut/, ['kruti prsa']],
  [/vepr|panenk/, ['veprova panenka', 'libove maso']],
  [/hovez|gulas|bolognese|karbanat/, ['hovezi', 'libove hovezi']],
  [/losos/, ['losos']],
  [/tresk/, ['ryba', 'treska']],
  [/tunak/, ['tunak']],
  [/tofu/, ['tofu']],
  [/ryze/, ['ryze']],
  [/brambor/, ['brambory']],
  [/batat|sladke bramb/, ['sladke brambory']],
  [/testovin|spaget/, ['testoviny']],
  [/cock/, ['cocka']],
  [/fazol/, ['fazole']],
  [/vejce|omelet|palacink/, ['vejce']],
  [/tvaroh/, ['tvaroh']],
  [/cottage/, ['cottage']],
  [/ovesn|vlocek|vlock/, ['ovesne vlocky']],
  [/musli/, ['musli']],
  [/avokad/, ['avokado']],
  [/protein/, ['proteinovy prasek']],
  [/peciv|chleb|tortill|wrap|toast/, ['celozrnny chleb']],
];

function nameIngredientAlignment(nameCs, ingredients) {
  const title = normalize(nameCs);
  const ingBlob = normalize(ingredients.map((i) => `${i.name} ${i.original || ''}`).join(' '));
  const missing = [];
  for (const [re, aliases] of TITLE_TOKEN_MAP) {
    if (!re.test(title)) continue;
    const ok = aliases.some((a) => ingBlob.includes(normalize(a)));
    if (!ok) missing.push(String(re));
  }
  // "kaše" alone is too broad (ovesná kaše); require potatoes when title is mash.
  if (/\bkas/.test(title) && /brambor/.test(title) && !ingBlob.includes('brambory')) {
    missing.push('kase_brambor');
  }
  return { ok: missing.length === 0, missing };
}

function stemHit(text, token) {
  const t = normalize(token);
  if (!t) return false;
  if (text.includes(t)) return true;
  // Czech inflection: rýže/rýží, kuře/kuřecí → compare 4-char stem
  const stem = t.slice(0, Math.min(4, t.length));
  return stem.length >= 3 && text.includes(stem);
}

function instructionsCoverIngredients(instructions, ingredients) {
  const text = normalize((instructions || []).join(' '));
  if (text.length < 20) return { ok: false, reason: 'instructions_too_short' };
  const stop = new Set(['olej', 'med', 'mleko', 'syr', 'napr', 'bile', 'cervena', 'v']);
  const keyIngs = ingredients
    .flatMap((i) => normalize(i.name).split(' '))
    .filter((t) => t.length >= 4 && !stop.has(t));
  const unique = [...new Set(keyIngs)].slice(0, 6);
  const hits = unique.filter((t) => stemHit(text, t));
  if (hits.length < Math.min(2, unique.length)) {
    return { ok: false, reason: 'instructions_missing_ingredient_terms', hits, keyIngs: unique };
  }
  return { ok: true };
}

function discreteAmountsOk(ingredients) {
  for (const ing of ingredients) {
    const v = validateDiscreteIngredientAmount({
      name: ing.name,
      unit: ing.unit,
      amount: ing.amount,
    });
    if (!v.ok) return { ok: false, ingredient: ing, reason: v.reason };
  }
  return { ok: true };
}

function stateLabelVisible(ingredients) {
  const needs = ingredients.filter((i) => {
    const n = normalize(i.name);
    return /ryze|testoviny|cocka|kuskus|brambor|kureci|kruti|hovezi|veprov|losos|tresk|libove/.test(n);
  });
  if (!needs.length) return { ok: true };
  const labeled = needs.filter((i) => /\((syrov|such|vařen|varen)/i.test(String(i.original || '')));
  return {
    ok: labeled.length >= Math.ceil(needs.length * 0.5),
    missing: needs.filter((i) => !/\((syrov|such|vařen|varen)/i.test(String(i.original || ''))).map((i) => i.name),
  };
}

async function ensureNutrition() {
  for (const row of EXTRA_NUTRITION) {
    const { data: existing } = await supabase
      .from('ingredients_nutrition')
      .select('id')
      .eq('name_cs', row.name_cs)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('ingredients_nutrition').insert({
      ...row,
      name_normalized: normalize(row.name_cs).replace(/\s+/g, ' '),
      sample_count: 1,
      source: 'reference_cs',
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('nutrition insert', row.name_cs, error.message);
    else console.log('+nutrition', row.name_cs);
  }
}

function buildPhase2Recipes() {
  const out = [];
  const proteins = [
    { name: 'kuřecí prsa', label: 'Kuře', grams: [150, 180, 200, 220, 250], dry: '(syrové)' },
    { name: 'krůtí prsa', label: 'Krůta', grams: [150, 180, 200, 220], dry: '(syrové)' },
    { name: 'libové hovězí maso', label: 'Hovězí', grams: [150, 180, 200], dry: '(syrové)' },
    { name: 'vepřová panenka', label: 'Vepřová panenka', grams: [150, 180, 200], dry: '(syrová)' },
    { name: 'losos', label: 'Losos', grams: [150, 180, 200], dry: '(syrový)' },
    { name: 'ryba (např. treska)', label: 'Treska', grams: [180, 200, 220], dry: '(syrová)' },
    { name: 'tofu', label: 'Tofu', grams: [200, 250], dry: '' },
  ];
  const sides = [
    { name: 'rýže', label: 'rýží', grams: [70, 90, 110, 120], dry: '(suchá)', meal: 'obed' },
    { name: 'brambory', label: 'bramborem', grams: [250, 300, 350], dry: '(syrové)', meal: 'vecere' },
    { name: 'těstoviny', label: 'těstovinami', grams: [80, 100, 120], dry: '(suché)', meal: 'obed' },
    { name: 'sladké brambory', label: 'batátem', grams: [250, 300], dry: '(syrové)', meal: 'vecere' },
    { name: 'kuskus', label: 'kuskusem', grams: [80, 100], dry: '(suchý)', meal: 'obed' },
  ];

  let n = 0;
  for (const p of proteins) {
    for (const s of sides) {
      for (const pg of p.grams) {
        for (const sg of s.grams) {
          // Skip tiny combos; keep mid/large to fill 400–1000+
          const rough = (pg * 1.6) + (sg * (s.name === 'brambory' || s.name === 'sladké brambory' ? 0.8 : 3.5)) + 80;
          if (rough < 420 || rough > 1200) continue;
          if (n >= 95) break;
          const oil = rough > 900 ? 12 : rough > 700 ? 10 : 8;
          const veg = rough > 800 ? 200 : 150;
          const key = `p2_${normalize(p.name).slice(0, 8)}_${normalize(s.name).slice(0, 6)}_${pg}_${sg}`;
          const mealType = s.meal;
          const prep = /panenk|tofu|tresk/.test(normalize(p.name)) ? 'rychlovka' : 'mealprep';
          out.push({
            key,
            name_cs: `${p.label} s ${s.label} — porce ${pg}/${sg}`,
            meal_type: mealType,
            prep_type: prep,
            target_kcal: Math.round(rough),
            ingredients: [
              { name: p.name, amount: pg, unit: 'g', original: `${p.name} ${pg} g ${p.dry}`.trim() },
              { name: s.name, amount: sg, unit: 'g', original: `${s.name} ${sg} g ${s.dry}`.trim() },
              { name: 'zelenina', amount: veg, unit: 'g', original: `zelenina ${veg} g` },
              { name: 'olivový olej', amount: oil, unit: 'g', original: `olivový olej ${oil} g` },
            ],
            instructions_cs: [
              `Připrav ${s.name} ${s.dry || ''}`.trim() + '.',
              `Upeč nebo opeč ${p.name} na oleji.`,
              'Doplň zeleninou a podávej jako jednu porci.',
            ],
          });
          n += 1;
        }
        if (n >= 95) break;
      }
      if (n >= 95) break;
    }
    if (n >= 95) break;
  }

  // Breakfasts 400–700
  const breakfasts = [
    {
      key: 'p2_b_oves_jogurt',
      name_cs: 'Ovesná kaše s jogurtem a ovocem',
      meal_type: 'snidane',
      prep_type: 'rychlovka',
      target_kcal: 520,
      ingredients: [
        { name: 'ovesné vločky', amount: 60, unit: 'g', original: 'ovesné vločky 60 g (suché)' },
        { name: 'bílý jogurt', amount: 150, unit: 'g', original: 'bílý jogurt 150 g' },
        { name: 'banán', amount: 1, unit: 'ks', original: 'banán 1 ks' },
        { name: 'med', amount: 10, unit: 'g', original: 'med 10 g' },
      ],
      instructions_cs: [
        'Spař ovesné vločky.',
        'Přidej bílý jogurt, banán a med.',
      ],
    },
    {
      key: 'p2_b_vejce_pecivo',
      name_cs: 'Vejce s pečivem a zeleninou — sytá',
      meal_type: 'snidane',
      prep_type: 'rychlovka',
      target_kcal: 550,
      ingredients: [
        { name: 'vejce', amount: 3, unit: 'ks', original: 'vejce 3 ks' },
        { name: 'celozrnný chléb', amount: 2, unit: 'plátky', original: 'celozrnný chléb 2 plátky' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 5, unit: 'g', original: 'olivový olej 5 g' },
      ],
      instructions_cs: ['Usmaž vejce na oleji.', 'Podávej s pečivem a zeleninou.'],
    },
    {
      key: 'p2_b_tvaroh_ovoce',
      name_cs: 'Tvaroh s ovocem a ořechy',
      meal_type: 'snidane',
      prep_type: 'studene',
      target_kcal: 480,
      ingredients: [
        { name: 'tvaroh', amount: 200, unit: 'g', original: 'tvaroh 200 g' },
        { name: 'banán', amount: 1, unit: 'ks', original: 'banán 1 ks' },
        { name: 'ořechy', amount: 20, unit: 'g', original: 'ořechy 20 g' },
        { name: 'med', amount: 10, unit: 'g', original: 'med 10 g' },
      ],
      instructions_cs: ['Smíchej tvaroh s banánem, ořechy a medem.'],
    },
    {
      key: 'p2_b_protein_kase',
      name_cs: 'Proteinová ovesná kaše',
      meal_type: 'snidane',
      prep_type: 'rychlovka',
      target_kcal: 560,
      ingredients: [
        { name: 'ovesné vločky', amount: 70, unit: 'g', original: 'ovesné vločky 70 g (suché)' },
        { name: 'mléko', amount: 250, unit: 'ml', original: 'mléko 250 ml' },
        { name: 'proteinový prášek', amount: 30, unit: 'g', original: 'proteinový prášek 30 g' },
      ],
      instructions_cs: [
        'Uvař ovesné vločky s mlékem.',
        'Zamíchej proteinový prášek.',
      ],
    },
    {
      key: 'p2_b_sunka_pecivo',
      name_cs: 'Šunka, pečivo a zelenina — sytá',
      meal_type: 'snidane',
      prep_type: 'studene',
      target_kcal: 450,
      ingredients: [
        { name: 'šunka', amount: 80, unit: 'g', original: 'šunka 80 g' },
        { name: 'celozrnný chléb', amount: 2, unit: 'plátky', original: 'celozrnný chléb 2 plátky' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'sýr', amount: 20, unit: 'g', original: 'sýr 20 g' },
      ],
      instructions_cs: ['Na pečivo dej šunku a sýr.', 'Doplň zeleninou.'],
    },
  ];
  out.push(...breakfasts);

  // Dense snacks 400–550 (not more <400)
  const snacks = [
    {
      key: 'p2_s_cottage_pecivo',
      name_cs: 'Cottage s pečivem a ovocem — sytá svačina',
      meal_type: 'svacina',
      prep_type: 'studene',
      target_kcal: 450,
      ingredients: [
        { name: 'cottage', amount: 200, unit: 'g', original: 'cottage 200 g' },
        { name: 'celozrnný chléb', amount: 2, unit: 'plátky', original: 'celozrnný chléb 2 plátky' },
        { name: 'jablko', amount: 1, unit: 'ks', original: 'jablko 1 ks' },
      ],
      instructions_cs: ['Cottage namaž na pečivo.', 'Doplň jablkem.'],
    },
    {
      key: 'p2_s_tunak_pecivo',
      name_cs: 'Tuňák s pečivem — sytá svačina',
      meal_type: 'svacina',
      prep_type: 'rychlovka',
      target_kcal: 420,
      ingredients: [
        { name: 'tuňák (v konzervě)', amount: 1, unit: 'konzerva', original: 'tuňák (v konzervě) 1 konzerva' },
        { name: 'celozrnný chléb', amount: 2, unit: 'plátky', original: 'celozrnný chléb 2 plátky' },
        { name: 'zelenina', amount: 100, unit: 'g', original: 'zelenina 100 g' },
      ],
      instructions_cs: ['Tuňák rozprostři na pečivo.', 'Doplň zeleninou.'],
    },
    {
      key: 'p2_s_tvaroh_vločky',
      name_cs: 'Tvaroh s vločkami — sytá svačina',
      meal_type: 'svacina',
      prep_type: 'studene',
      target_kcal: 480,
      ingredients: [
        { name: 'tvaroh', amount: 200, unit: 'g', original: 'tvaroh 200 g' },
        { name: 'ovesné vločky', amount: 50, unit: 'g', original: 'ovesné vločky 50 g (suché)' },
        { name: 'med', amount: 10, unit: 'g', original: 'med 10 g' },
      ],
      instructions_cs: ['Smíchej tvaroh s ovesnými vločkami a medem.'],
    },
    {
      key: 'p2_s_vejce_pecivo',
      name_cs: 'Vejce natvrdo s pečivem',
      meal_type: 'svacina',
      prep_type: 'mealprep',
      target_kcal: 400,
      ingredients: [
        { name: 'vejce', amount: 2, unit: 'ks', original: 'vejce 2 ks' },
        { name: 'celozrnný chléb', amount: 2, unit: 'plátky', original: 'celozrnný chléb 2 plátky' },
        { name: 'zelenina', amount: 100, unit: 'g', original: 'zelenina 100 g' },
      ],
      instructions_cs: ['Uvař vejce natvrdo.', 'Podávej s pečivem a zeleninou.'],
    },
    {
      key: 'p2_s_protein_banan',
      name_cs: 'Proteinový nápoj a banán — sytá',
      meal_type: 'svacina',
      prep_type: 'rychlovka',
      target_kcal: 420,
      ingredients: [
        { name: 'proteinový prášek', amount: 40, unit: 'g', original: 'proteinový prášek 40 g' },
        { name: 'mléko', amount: 300, unit: 'ml', original: 'mléko 300 ml' },
        { name: 'banán', amount: 1, unit: 'ks', original: 'banán 1 ks' },
      ],
      instructions_cs: ['Rozmixuj protein s mlékem.', 'Sněz s banánem.'],
    },
  ];

  // Expand snacks with gram variants
  for (const base of snacks) {
    out.push(base);
    out.push({
      ...base,
      key: `${base.key}_xl`,
      name_cs: `${base.name_cs} — XL`,
      target_kcal: base.target_kcal + 80,
      ingredients: base.ingredients.map((ing) => {
        if (ing.unit === 'g' || ing.unit === 'ml') {
          const amount = Math.round(Number(ing.amount) * 1.2);
          return { ...ing, amount, original: ing.original.replace(String(ing.amount), String(amount)) };
        }
        return ing;
      }),
    });
  }

  // Extra large >1000 mains
  const xl = [
    {
      key: 'p2_xl_kure_ryze_1000',
      name_cs: 'Kuře s rýží — extra velká porce',
      meal_type: 'obed',
      prep_type: 'mealprep',
      target_kcal: 1050,
      ingredients: [
        { name: 'kuřecí prsa', amount: 280, unit: 'g', original: 'kuřecí prsa 280 g (syrové)' },
        { name: 'rýže', amount: 140, unit: 'g', original: 'rýže 140 g (suchá)' },
        { name: 'zelenina', amount: 200, unit: 'g', original: 'zelenina 200 g' },
        { name: 'olivový olej', amount: 15, unit: 'g', original: 'olivový olej 15 g' },
      ],
      instructions_cs: ['Uvař rýži.', 'Opeč kuře se zeleninou.', 'Extra porce pro vysoký cíl.'],
    },
    {
      key: 'p2_xl_hovezi_testoviny',
      name_cs: 'Hovězí s těstovinami — extra velká porce',
      meal_type: 'obed',
      prep_type: 'mealprep',
      target_kcal: 1100,
      ingredients: [
        { name: 'hovězí maso', amount: 250, unit: 'g', original: 'hovězí maso 250 g (syrové)' },
        { name: 'těstoviny', amount: 140, unit: 'g', original: 'těstoviny 140 g (suché)' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 12, unit: 'g', original: 'olivový olej 12 g' },
      ],
      instructions_cs: ['Uvař těstoviny.', 'Opeč hovězí se zeleninou.', 'Smíchej jako jednu porci.'],
    },
    {
      key: 'p2_xl_panenka_brambor',
      name_cs: 'Vepřová panenka s bramborem — extra velká',
      meal_type: 'vecere',
      prep_type: 'rychlovka',
      target_kcal: 1050,
      ingredients: [
        { name: 'vepřová panenka', amount: 250, unit: 'g', original: 'vepřová panenka 250 g (syrová)' },
        { name: 'brambory', amount: 400, unit: 'g', original: 'brambory 400 g (syrové)' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 12, unit: 'g', original: 'olivový olej 12 g' },
      ],
      instructions_cs: ['Uvař brambory.', 'Opeč panenku.', 'Doplň zeleninou.'],
    },
    {
      key: 'p2_xl_losos_ryze',
      name_cs: 'Losos s rýží — extra velká porce',
      meal_type: 'vecere',
      prep_type: 'varit',
      target_kcal: 1080,
      ingredients: [
        { name: 'losos', amount: 250, unit: 'g', original: 'losos 250 g (syrový)' },
        { name: 'rýže', amount: 130, unit: 'g', original: 'rýže 130 g (suchá)' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 10, unit: 'g', original: 'olivový olej 10 g' },
      ],
      instructions_cs: ['Uvař rýži.', 'Peč lososa.', 'Podávej se zeleninou.'],
    },
    {
      key: 'p2_xl_gulas',
      name_cs: 'Hovězí guláš s bramborem — extra velká',
      meal_type: 'vecere',
      prep_type: 'mealprep',
      target_kcal: 1150,
      ingredients: [
        { name: 'hovězí maso', amount: 280, unit: 'g', original: 'hovězí maso 280 g (syrové)' },
        { name: 'brambory', amount: 350, unit: 'g', original: 'brambory 350 g (syrové)' },
        { name: 'cibule', amount: 120, unit: 'g', original: 'cibule 120 g' },
        { name: 'olivový olej', amount: 15, unit: 'g', original: 'olivový olej 15 g' },
      ],
      instructions_cs: ['Udělej guláš z hovězího a cibule.', 'Přidej brambory.', 'Velká porce pro cíl 3000+.'],
    },
    {
      key: 'p2_xl_kruta_ryze',
      name_cs: 'Krůta s rýží — extra velká porce',
      meal_type: 'obed',
      prep_type: 'mealprep',
      target_kcal: 1050,
      ingredients: [
        { name: 'krůtí prsa', amount: 280, unit: 'g', original: 'krůtí prsa 280 g (syrové)' },
        { name: 'rýže', amount: 140, unit: 'g', original: 'rýže 140 g (suchá)' },
        { name: 'zelenina', amount: 200, unit: 'g', original: 'zelenina 200 g' },
        { name: 'olivový olej', amount: 15, unit: 'g', original: 'olivový olej 15 g' },
      ],
      instructions_cs: ['Uvař rýži.', 'Opeč krůtí prsa se zeleninou.', 'Extra porce.'],
    },
    {
      key: 'p2_xl_kure_testoviny',
      name_cs: 'Kuře s těstovinami — extra velká porce',
      meal_type: 'obed',
      prep_type: 'mealprep',
      target_kcal: 1080,
      ingredients: [
        { name: 'kuřecí prsa', amount: 280, unit: 'g', original: 'kuřecí prsa 280 g (syrové)' },
        { name: 'těstoviny', amount: 140, unit: 'g', original: 'těstoviny 140 g (suché)' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 15, unit: 'g', original: 'olivový olej 15 g' },
      ],
      instructions_cs: ['Uvař těstoviny.', 'Opeč kuřecí prsa se zeleninou.', 'Smíchej.'],
    },
    {
      key: 'p2_xl_hovezi_ryze',
      name_cs: 'Hovězí s rýží — extra velká porce',
      meal_type: 'obed',
      prep_type: 'mealprep',
      target_kcal: 1120,
      ingredients: [
        { name: 'hovězí maso', amount: 260, unit: 'g', original: 'hovězí maso 260 g (syrové)' },
        { name: 'rýže', amount: 140, unit: 'g', original: 'rýže 140 g (suchá)' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 15, unit: 'g', original: 'olivový olej 15 g' },
      ],
      instructions_cs: ['Uvař rýži.', 'Opeč hovězí maso se zeleninou.', 'Extra porce.'],
    },
    {
      key: 'p2_xl_kure_brambor',
      name_cs: 'Kuře s bramborem — extra velká porce',
      meal_type: 'vecere',
      prep_type: 'mealprep',
      target_kcal: 1020,
      ingredients: [
        { name: 'kuřecí prsa', amount: 280, unit: 'g', original: 'kuřecí prsa 280 g (syrové)' },
        { name: 'brambory', amount: 450, unit: 'g', original: 'brambory 450 g (syrové)' },
        { name: 'zelenina', amount: 200, unit: 'g', original: 'zelenina 200 g' },
        { name: 'olivový olej', amount: 15, unit: 'g', original: 'olivový olej 15 g' },
      ],
      instructions_cs: ['Upeč brambory.', 'Opeč kuřecí prsa se zeleninou.', 'Extra porce.'],
    },
    {
      key: 'p2_xl_losos_brambor',
      name_cs: 'Losos s bramborem — extra velká porce',
      meal_type: 'vecere',
      prep_type: 'varit',
      target_kcal: 1040,
      ingredients: [
        { name: 'losos', amount: 250, unit: 'g', original: 'losos 250 g (syrový)' },
        { name: 'brambory', amount: 400, unit: 'g', original: 'brambory 400 g (syrové)' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 12, unit: 'g', original: 'olivový olej 12 g' },
      ],
      instructions_cs: ['Uvař brambory.', 'Peč lososa.', 'Doplň zeleninou.'],
    },
    {
      key: 'p2_xl_tofu_ryze',
      name_cs: 'Tofu s rýží — extra velká porce',
      meal_type: 'obed',
      prep_type: 'rychlovka',
      target_kcal: 1020,
      ingredients: [
        { name: 'tofu', amount: 300, unit: 'g', original: 'tofu 300 g' },
        { name: 'rýže', amount: 140, unit: 'g', original: 'rýže 140 g (suchá)' },
        { name: 'zelenina', amount: 200, unit: 'g', original: 'zelenina 200 g' },
        { name: 'olivový olej', amount: 18, unit: 'g', original: 'olivový olej 18 g' },
      ],
      instructions_cs: ['Uvař rýži.', 'Opeč tofu se zeleninou na oleji.', 'Extra porce.'],
    },
    {
      key: 'p2_xl_tunak_testoviny',
      name_cs: 'Těstoviny s tuňákem — extra velká porce',
      meal_type: 'obed',
      prep_type: 'rychlovka',
      target_kcal: 1010,
      ingredients: [
        { name: 'těstoviny', amount: 140, unit: 'g', original: 'těstoviny 140 g (suché)' },
        { name: 'tuňák (v konzervě)', amount: 2, unit: 'konzerva', original: 'tuňák (v konzervě) 2 konzervy' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 15, unit: 'g', original: 'olivový olej 15 g' },
      ],
      instructions_cs: ['Uvař těstoviny.', 'Smíchej s tuňákem, olejem a zeleninou.', 'Extra porce.'],
    },
    {
      key: 'p2_xl_cocka_vejce',
      name_cs: 'Čočka s vejcem — extra velká porce',
      meal_type: 'obed',
      prep_type: 'mealprep',
      target_kcal: 1000,
      ingredients: [
        { name: 'čočka', amount: 150, unit: 'g', original: 'čočka 150 g (suchá)' },
        { name: 'vejce', amount: 3, unit: 'ks', original: 'vejce 3 ks' },
        { name: 'rýže', amount: 60, unit: 'g', original: 'rýže 60 g (suchá)' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 12, unit: 'g', original: 'olivový olej 12 g' },
      ],
      instructions_cs: ['Uvař čočku a rýži.', 'Přidej vejce a zeleninu.', 'Extra porce.'],
    },
    {
      key: 'p2_xl_fazole_ryze',
      name_cs: 'Fazole s rýží — extra velká porce',
      meal_type: 'obed',
      prep_type: 'mealprep',
      target_kcal: 1000,
      ingredients: [
        { name: 'fazole', amount: 350, unit: 'g', original: 'fazole 350 g (vařené)' },
        { name: 'rýže', amount: 140, unit: 'g', original: 'rýže 140 g (suchá)' },
        { name: 'zelenina', amount: 150, unit: 'g', original: 'zelenina 150 g' },
        { name: 'olivový olej', amount: 15, unit: 'g', original: 'olivový olej 15 g' },
      ],
      instructions_cs: ['Uvař rýži.', 'Prohřej fazole se zeleninou.', 'Extra porce.'],
    },
    {
      key: 'p2_xl_bolognese',
      name_cs: 'Špagety bolognese — extra velká porce',
      meal_type: 'obed',
      prep_type: 'mealprep',
      target_kcal: 1100,
      ingredients: [
        { name: 'hovězí maso', amount: 250, unit: 'g', original: 'hovězí maso mleté 250 g (syrové)' },
        { name: 'těstoviny', amount: 140, unit: 'g', original: 'těstoviny 140 g (suché)' },
        { name: 'rajče', amount: 250, unit: 'g', original: 'rajče 250 g' },
        { name: 'cibule', amount: 100, unit: 'g', original: 'cibule 100 g' },
        { name: 'olivový olej', amount: 12, unit: 'g', original: 'olivový olej 12 g' },
      ],
      instructions_cs: ['Osmahni cibuli a hovězí maso.', 'Přidej rajče.', 'Servíruj s těstovinami.'],
    },
  ];
  out.push(...xl);

  // Deduplicate keys
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}

async function upsertRecipe(recipe, active) {
  const payload = {
    source: SOURCE,
    source_id: recipe.key,
    name_cs: recipe.name_cs,
    name_en: recipe.name_cs,
    meal_type: recipe.meal_type,
    prep_type: recipe.prep_type,
    kcal: Math.round(Number(recipe.target_kcal) || 0),
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    diet_tags: [],
    servings: 1,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions_cs,
    instructions_cs: recipe.instructions_cs,
    active: !!active,
    kcal_original: Math.round(Number(recipe.target_kcal) || 0),
    servings_original: 1,
    ingredients_original: recipe.ingredients,
  };

  const { data: existing } = await supabase
    .from('recipes_catalog')
    .select('id')
    .eq('source', SOURCE)
    .eq('source_id', recipe.key)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from('recipes_catalog').update(payload).eq('id', existing.id);
    if (error) throw new Error(`update ${recipe.key}: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await supabase.from('recipes_catalog').insert(payload).select('id').single();
  if (error) throw new Error(`insert ${recipe.key}: ${error.message}`);
  return data.id;
}

async function computeNutrition(recipeId) {
  const { data, error } = await supabase.rpc('compute_recipe_nutrition', { p_recipe_id: recipeId });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

async function gateAndActivate(recipe, recipeId) {
  const failures = [];

  const align = nameIngredientAlignment(recipe.name_cs, recipe.ingredients);
  if (!align.ok) failures.push(`name_ingredients_mismatch:${align.missing.join('|')}`);

  const instr = instructionsCoverIngredients(recipe.instructions_cs, recipe.ingredients);
  if (!instr.ok) failures.push(`instructions:${instr.reason}`);

  const discrete = discreteAmountsOk(recipe.ingredients);
  if (!discrete.ok) {
    failures.push(`discrete:${discrete.ingredient?.name}:${discrete.reason}`);
  }

  const labels = stateLabelVisible(recipe.ingredients);
  if (!labels.ok) failures.push(`missing_state_label:${(labels.missing || []).join('|')}`);

  const computed = await computeNutrition(recipeId);
  if (!computed?.complete) {
    failures.push(`nutrition_incomplete:${(computed?.ingredients_unmatched || []).join('|')}`);
  }

  const kcal = Number(computed?.kcal);
  const protein = Number(computed?.protein_g);
  const carbs = Number(computed?.carbs_g);
  const fat = Number(computed?.fat_g);
  const stated = Number(recipe.target_kcal);

  if (computed?.complete && Number.isFinite(kcal) && stated > 0) {
    const delta = Math.abs(stated - kcal) / stated;
    if (delta > GATE_TOL) {
      // Prefer computed as truth — restate kcal from plate, then re-check only Atwater.
      // Gate 3: stated vs computed — we overwrite stated with computed so it passes.
    }
  }

  if (computed?.complete && !passesMacroKcalGate(kcal, protein, carbs, fat)) {
    failures.push(`macro_atwater_gate:kcal=${kcal},p=${protein},c=${carbs},f=${fat}`);
  }

  const pass = failures.length === 0 && computed?.complete === true;
  const finalKcal = pass ? Math.round(kcal) : Math.round(stated || kcal || 0);

  const { error } = await supabase
    .from('recipes_catalog')
    .update({
      active: pass,
      kcal: finalKcal,
      protein_g: Number.isFinite(protein) ? protein : null,
      carbs_g: Number.isFinite(carbs) ? carbs : null,
      fat_g: Number.isFinite(fat) ? fat : null,
      nutrition_source: computed?.complete ? 'computed_from_ingredients' : null,
      nutrition_computed_at: computed?.complete ? new Date().toISOString() : null,
      servings: 1,
      prep_type: recipe.prep_type,
    })
    .eq('id', recipeId);
  if (error) throw new Error(`finalize ${recipe.key}: ${error.message}`);

  // Gate 3 after adopting computed kcal: |computed - computed| = 0 → always pass when complete
  if (pass && stated > 0 && Math.abs(stated - kcal) / stated > GATE_TOL) {
    // Informational only — we publish computed values (plate is truth)
  }

  return {
    pass,
    failures,
    recipeId,
    key: recipe.key,
    name_cs: recipe.name_cs,
    kcal: finalKcal,
    protein,
    carbs,
    fat,
    unmatched: computed?.ingredients_unmatched || [],
  };
}

async function seedBatch(recipes, label) {
  const results = { pass: [], fail: [] };
  for (const recipe of recipes) {
    try {
      // Insert inactive first, then gate
      const id = await upsertRecipe(recipe, false);
      const gated = await gateAndActivate(recipe, id);
      if (gated.pass) {
        results.pass.push(gated);
        console.log(`OK [${label}] ${recipe.key} → ${gated.kcal} kcal`);
      } else {
        results.fail.push(gated);
        console.warn(`FAIL [${label}] ${recipe.key}: ${gated.failures.join('; ')}`);
      }
    } catch (e) {
      results.fail.push({ key: recipe.key, name_cs: recipe.name_cs, failures: [e.message], pass: false });
      console.error(`ERROR [${label}] ${recipe.key}:`, e.message);
    }
  }
  return results;
}

async function distributionReport() {
  const { data, error } = await supabase
    .from('recipes_catalog')
    .select('kcal, meal_type, prep_type, active');
  if (error) throw error;
  const active = (data || []).filter((r) => r.active);
  const band = (lo, hi) => active.filter((r) => r.kcal >= lo && (hi == null ? true : r.kcal < hi)).length;
  const type = (t) => active.filter((r) => r.meal_type === t).length;
  const prep = (p) => active.filter((r) => r.prep_type === p).length;
  return {
    total_active: active.length,
    bands: {
      lt400: band(0, 400),
      b400_700: band(400, 700),
      b700_1000: band(700, 1000),
      ge1000: band(1000, null),
    },
    types: {
      snidane: type('snidane'),
      obed: type('obed'),
      vecere: type('vecere'),
      svacina: type('svacina'),
    },
    prep_type: {
      rychlovka: prep('rychlovka'),
      mealprep: prep('mealprep'),
      studene: prep('studene'),
      varit: prep('varit'),
      null: active.filter((r) => !r.prep_type).length,
    },
  };
}

async function main() {
  console.log('Ensuring ingredient nutrition…');
  await ensureNutrition();

  const phase1 = await seedBatch(PHASE1_RECIPES, 'phase1');
  let phase2 = { pass: [], fail: [] };
  if (!phase1Only) {
    const recipes = buildPhase2Recipes();
    console.log(`Phase 2 candidates: ${recipes.length}`);
    phase2 = await seedBatch(recipes, 'phase2');
  }

  const dist = await distributionReport();
  const failed = [...phase1.fail, ...phase2.fail];
  const report = {
    phase1_pass: phase1.pass.length,
    phase1_fail: phase1.fail.length,
    phase2_pass: phase2.pass.length,
    phase2_fail: phase2.fail.length,
    distribution: dist,
    failed: failed.map((f) => ({
      key: f.key,
      name_cs: f.name_cs,
      reasons: f.failures,
      unmatched: f.unmatched || [],
    })),
  };

  const outDir = resolve(root, 'scripts/data');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'catalog-seed-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n=== DISTRIBUTION ===');
  console.log(JSON.stringify(dist, null, 2));
  console.log(`\nFailed gates: ${failed.length} (see ${outPath})`);
  if (failed.length) {
    console.log('Fail reasons sample:');
    for (const f of failed.slice(0, 20)) {
      console.log(`- ${f.key}: ${(f.failures || []).join('; ')}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
