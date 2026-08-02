#!/usr/bin/env node
/**
 * LLM odhad doby přípravy — kalibrace i produkční běh.
 *
 *   node scripts/estimate-prep-time.mjs --calibrate        fáze 1: 151 receptů s referencí
 *   node scripts/estimate-prep-time.mjs --calibrate --limit=10   zkušební vzorek
 *   node scripts/estimate-prep-time.mjs --rescore          přepočet z ai_runs, bez volání modelu
 *   node scripts/estimate-prep-time.mjs --run              fáze 2: zbytek (jen po schválení)
 *   node scripts/estimate-prep-time.mjs --regenerate       přepočet zdroje 'llm' po změně promptu
 *   node scripts/estimate-prep-time.mjs --run --dry        vypíše, co by běželo, bez volání
 *
 * FÁZE 1 nic nezapisuje do recipes_catalog — jen do ai_runs a na výstup. Reference
 * (prep_minutes_estimated ze structured_length) se modelu NEPOSÍLÁ, jinak by kalibrace
 * měřila schopnost opsat zadání.
 *
 * --rescore existuje proto, že odpovědi modelu leží v ai_runs i s otiskem promptu.
 * Když se změní jen METRIKA (a ne prompt ani model), není co znovu kupovat — přepočet
 * běží nad uloženými odpověďmi zdarma. Jiná prompt SHA než ta aktuální se ignoruje.
 *
 * Kalibrace je BINÁRNÍ: neměří se přesnost v minutách, ale jestli model pozná, že se
 * recept do limitu slotu nevejde. Viz evaluateBinaryCalibration.
 *
 * ready_in_minutes se nikdy nemění; chrání ho trigger protect_measured_ready_in_minutes.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  PREP_TIME_MODEL,
  PREP_TIME_TEMPERATURE,
  PREP_TIME_PROMPT_SHA256,
  buildEstimateInput,
  estimatePrepTime,
  referenceActiveMinutes,
  evaluateBinaryCalibration,
  BINARY_CALIBRATION_THRESHOLDS,
} from '../lib/spoonacular/prepTimeEstimate.js';
import { MEAL_SIMPLICITY_RULES, getMealSimplicityRules } from '../lib/spoonacular/catalogImportGate.js';

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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const openai = new OpenAI({ apiKey: String(process.env.OPENAI_API_KEY || '').trim() });

const args = process.argv.slice(2);
const rezim = args.includes('--calibrate') ? 'calibrate'
  : args.includes('--rescore') ? 'rescore'
    : args.includes('--regenerate') ? 'regenerate'
      : args.includes('--run') ? 'run' : null;
/** Režimy, které zapisují odhad do recipes_catalog. */
const zapisuje = rezim === 'run' || rezim === 'regenerate';
const dry = args.includes('--dry');
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '--limit=0').slice(8)) || 0;

if (!rezim) {
  console.error('Chybí --calibrate, --rescore, --regenerate nebo --run');
  process.exit(2);
}

async function nactiRecepty() {
  let q = supabase
    .from('recipes_catalog')
    .select('id, name_en, meal_type, ingredients, instructions, prep_minutes_estimated, prep_minutes_source, ready_in_minutes')
    .order('id');

  if (rezim === 'calibrate' || rezim === 'rescore') {
    q = q.eq('prep_minutes_source', 'structured_length');
  } else if (rezim === 'regenerate') {
    // Přepočet po změně promptu: jen to, co model už jednou odhadl. Měřený čas
    // ani deterministickou strukturovanou délku nepřepisujeme.
    q = q.eq('prep_minutes_source', 'llm');
  } else {
    // Fáze 2: má postup, nemá měřený čas ani odhad, není vyřazený.
    q = q.is('prep_minutes_estimated', null).is('ready_in_minutes', null).eq('prep_estimate_blocked', false);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return limit ? data.slice(0, limit) : data;
}

const recepty = await nactiRecepty();
console.log(`režim: ${rezim}${dry ? ' (dry)' : ''} | receptů: ${recepty.length}`);
console.log(`model: ${PREP_TIME_MODEL} | temperature: ${PREP_TIME_TEMPERATURE} | prompt SHA: ${PREP_TIME_PROMPT_SHA256.slice(0, 12)}…`);

if (dry) {
  for (const r of recepty.slice(0, 5)) {
    console.log(`  ${r.id} ${String(r.name_en).slice(0, 50)} — kroků ${buildEstimateInput(r).step_count}`);
  }
  process.exit(0);
}

const vzorky = [];
const chyby = [];
let cenaCelkem = 0;
let vstupTok = 0;
let vystupTok = 0;

/**
 * Jeden kalibrační vzorek. Reference se rozpadá na aktivní a pasivní část —
 * binární test pracuje jen s aktivní.
 */
function pridejVzorek(r, minutes, confidence, reasoning) {
  const ref = referenceActiveMinutes(r.instructions);
  vzorky.push({
    id: r.id,
    name: r.name_en,
    meal: r.meal_type,
    llm: minutes,
    confidence,
    reasoning,
    aktivni: ref.aktivni,
    celkem: ref.celkem,
    pasivni: ref.pasivni,
    pasivnichKroku: ref.pasivnichKroku,
    kroku: ref.kroku,
    sDelkou: ref.sDelkou,
  });
}

// --- Režim --rescore: odpovědi už máme koupené, jen se počítají jinak --------
if (rezim === 'rescore') {
  const { data: behy, error } = await supabase
    .from('ai_runs')
    .select('recipe_id, result, created_at')
    .eq('purpose', 'prep_time_calibration')
    .eq('prompt_sha256', PREP_TIME_PROMPT_SHA256)
    .is('error', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  // Poslední běh na recept vyhrává — starší pokusy nad stejným promptem přebije.
  const posledni = new Map();
  for (const b of behy) posledni.set(b.recipe_id, b);

  for (const r of recepty) {
    const b = posledni.get(r.id);
    // `minutes` je tvar před rozdělením na aktivní a pasivní čas; `active_minutes`
    // je ten dnešní. Otisk promptu se u obou liší, takže se v jednom běhu nepotkají —
    // čte se obojí jen proto, aby --rescore fungoval i nad starším otiskem.
    const aktivni = b?.result?.active_minutes ?? b?.result?.minutes;
    if (aktivni == null) { chyby.push(`${r.id}: v ai_runs není odpověď`); continue; }
    pridejVzorek(r, Number(aktivni), Number(b.result.confidence), String(b.result.reasoning || ''));
  }

  console.log(`přepočet z ai_runs: ${vzorky.length} odpovědí, bez volání modelu (útrata $0)`);
  vypisBinarniKalibraci();
  process.exit(0);
}

/** Recepty bez použitelných kroků — odhadnout je nejde, blokují se natrvalo. */
let zablokovano = 0;
/** Zapsané odhady fáze 2, pro rozdělení podle slotů vůči limitům. */
const zapsane = [];

for (const [i, r] of recepty.entries()) {
  const vstup = buildEstimateInput(r);
  if (!vstup.steps.length) {
    // Bez postupu není z čeho odhadovat. Označit a přestat na něj sahat — jinak
    // ho každý další běh znovu načte, znovu přeskočí a znovu nahlásí jako chybu.
    chyby.push(`${r.id}: bez kroků → prep_estimate_blocked`);
    if (zapisuje) {
      await supabase.from('recipes_catalog').update({ prep_estimate_blocked: true }).eq('id', r.id);
      zablokovano += 1;
    }
    continue;
  }

  try {
    const odhad = await estimatePrepTime(openai, vstup);
    cenaCelkem += odhad.cost_usd;
    vstupTok += odhad.usage.input_tokens;
    vystupTok += odhad.usage.output_tokens;

    await supabase.from('ai_runs').insert({
      purpose: rezim === 'calibrate' ? 'prep_time_calibration' : 'prep_time_estimate',
      recipe_id: r.id,
      model: PREP_TIME_MODEL,
      temperature: PREP_TIME_TEMPERATURE,
      prompt_sha256: PREP_TIME_PROMPT_SHA256,
      input_tokens: odhad.usage.input_tokens,
      output_tokens: odhad.usage.output_tokens,
      cost_usd: odhad.cost_usd,
      result: {
        active_minutes: odhad.activeMinutes,
        passive_minutes: odhad.passiveMinutes,
        confidence: odhad.confidence,
        reasoning: odhad.reasoning,
      },
    });

    if (rezim === 'calibrate') {
      pridejVzorek(r, odhad.activeMinutes, odhad.confidence, odhad.reasoning);
    } else {
      // Fáze 2 zapisuje AKTIVNÍ čas do prep_minutes_estimated, pasivní vedle.
      // ready_in_minutes se NEDOTÝKÁ.
      await supabase.from('recipes_catalog').update({
        prep_minutes_estimated: odhad.activeMinutes,
        prep_minutes_passive: odhad.passiveMinutes,
        prep_minutes_source: 'llm',
        prep_minutes_confidence: odhad.confidence,
        prep_minutes_estimated_at: new Date().toISOString(),
      }).eq('id', r.id);
      zapsane.push({
        id: r.id, meal: r.meal_type, minuty: odhad.activeMinutes,
        pasivni: odhad.passiveMinutes, confidence: odhad.confidence,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    chyby.push(`${r.id}: ${msg}`);
    await supabase.from('ai_runs').insert({
      purpose: rezim === 'calibrate' ? 'prep_time_calibration' : 'prep_time_estimate',
      recipe_id: r.id, model: PREP_TIME_MODEL, temperature: PREP_TIME_TEMPERATURE,
      prompt_sha256: PREP_TIME_PROMPT_SHA256, error: msg,
    });
  }

  if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${recepty.length}, zatím $${cenaCelkem.toFixed(4)}`);
}

console.log('');
console.log('='.repeat(72));
console.log(`SKUTEČNÁ ÚTRATA: $${cenaCelkem.toFixed(4)}  (vstup ${vstupTok} tok, výstup ${vystupTok} tok)`);
console.log(`chyb: ${chyby.length}${chyby.length ? ' → ' + chyby.slice(0, 5).join('; ') : ''}`);

if (rezim !== 'calibrate') {
  if (zapisuje) vypisRozdeleniPodleSlotu();
  process.exit(0);
}

/**
 * Rozdělení zapsaných odhadů vůči limitům slotů. Není to verdikt aktivace — ten
 * dělá trigger nad coalesce(ready_in_minutes, prep_minutes_estimated) — ale ukazuje,
 * co časová podmínka udělá, až se zapne.
 */
function vypisRozdeleniPodleSlotu() {
  if (!zapsane.length) { console.log('nic zapsáno'); return; }
  console.log('');
  console.log('='.repeat(72));
  console.log(`ODHADY PODLE SLOTŮ (zapsáno ${zapsane.length}, zablokováno ${zablokovano})`);
  console.log('='.repeat(72));
  console.log('slot        limit      n   do limitu   nad limit   medián   p90   max');

  const slots = [...new Set(zapsane.map((z) => z.meal))].sort();
  for (const meal of slots) {
    const skupina = zapsane.filter((z) => z.meal === meal);
    const limit = getMealSimplicityRules(meal).maxReadyTime;
    const serazene = skupina.map((z) => z.minuty).sort((a, b) => a - b);
    const kvantil = (p) => serazene[Math.min(serazene.length - 1, Math.floor(p * (serazene.length - 1)))];
    const doLimitu = skupina.filter((z) => z.minuty <= limit).length;
    const pct = ((doLimitu / skupina.length) * 100).toFixed(0);
    console.log(
      `${meal.padEnd(10)} ${String(limit).padStart(3)} min ${String(skupina.length).padStart(4)}   `
      + `${String(doLimitu).padStart(4)} (${pct.padStart(3)} %)   ${String(skupina.length - doLimitu).padStart(9)}   `
      + `${String(kvantil(0.5)).padStart(6)}   ${String(kvantil(0.9)).padStart(3)}   ${String(serazene[serazene.length - 1]).padStart(3)}`,
    );
  }

  const celkemDoLimitu = zapsane.filter((z) => z.minuty <= getMealSimplicityRules(z.meal).maxReadyTime).length;
  console.log('');
  console.log(`celkem do limitu ${celkemDoLimitu} z ${zapsane.length} (${((celkemDoLimitu / zapsane.length) * 100).toFixed(1)} %)`);
  const nizkaConf = zapsane.filter((z) => z.confidence < 0.5).length;
  console.log(`odhadů s confidence < 0,5: ${nizkaConf}`);
}

vypisBinarniKalibraci();

/**
 * BINÁRNÍ kalibrace: "vejde se do limitu slotu?", ne "kolik přesně minut?".
 *
 * Přesnost v minutách se neměří schválně. Reference (součet `length` u kroků) je
 * spodní mez — nepokrývá kroky bez uvedené délky — takže rozdíl llm − ref měří
 * z části díru v referenci, ne chybu modelu. Binární test tuhle slabost obchází:
 * počítá se jen tam, kde reference sama limit překročí, protože pak je odpověď
 * jistá bez ohledu na to, co reference nepokrývá.
 */
function vypisBinarniKalibraci() {
  const k = evaluateBinaryCalibration(vzorky);
  if (!k) { console.log('žádné vzorky'); process.exit(1); }

  const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)} %`);

  console.log('');
  console.log('='.repeat(72));
  console.log(`BINÁRNÍ KALIBRACE (n = ${k.n})`);
  console.log('='.repeat(72));
  console.log('limity slotů: ' + Object.entries(MEAL_SIMPLICITY_RULES)
    .map(([m, r]) => `${m} ${r.maxReadyTime}`).join(', ') + ' min');
  console.log('');
  console.log(`receptů s JISTOU odpovědí „nad limit“       ${String(k.jistych).padStart(4)} z ${k.n}`);
  console.log(`  (aktivní reference sama překročí limit — skutečný čas ho překročí taky)`);
  console.log(`z toho model taky řekl „nad limit“          ${String(k.zachycenych).padStart(4)}`);
  console.log(`RECALL                                      ${pct(k.recall).padStart(8)}   práh ≥ ${pct(BINARY_CALIBRATION_THRESHOLDS.recallMin)}   ${k.prosel ? 'OK' : 'NEPROŠLO'}`);
  console.log('');
  console.log(`bez odečtení pasivního čekání by jistých bylo ${k.jistychBezOdecteni} — rozdíl ${k.jistychBezOdecteni - k.jistych} receptů`);
  console.log('');
  console.log('KOLIK BY PŘI NOVÝCH LIMITECH PROŠLO');
  console.log(`  podle odhadu modelu       prošlo ${String(k.modelProslo).padStart(4)}   neprošlo ${String(k.modelNeproslo).padStart(4)}`);
  console.log(`  podle aktivní reference   prošlo ${String(k.referenceProslo).padStart(4)}   neprošlo ${String(k.referenceNeproslo).padStart(4)}`);
  console.log('  (reference je spodní mez, takže „prošlo“ podle ní je horní odhad)');

  console.log('');
  console.log('PO SLOTECH');
  console.log('slot        limit      n   jistých  zachyceno   recall   model pustí');
  for (const [meal, s] of Object.entries(k.poSlotech)) {
    const r = s.jiste ? s.zachyceno / s.jiste : null;
    console.log(`${meal.padEnd(10)} ${String(s.limit).padStart(3)} min ${String(s.n).padStart(4)}   ${String(s.jiste).padStart(5)}   ${String(s.zachyceno).padStart(7)}   ${pct(r).padStart(7)}   ${String(s.modelProsel).padStart(6)}`);
  }

  if (k.uniklo.length) {
    console.log('');
    console.log('UNIKLO — jistě nad limit, ale model je pustil (tohle jsou reálné škody):');
    for (const v of k.uniklo.sort((a, b) => b.aktivni - a.aktivni)) {
      console.log(`  ${String(v.id).padStart(4)} ${String(v.name).slice(0, 38).padEnd(40)} ${v.meal.padEnd(8)} limit ${String(v.limit).padStart(2)}  llm ${String(v.llm).padStart(3)}  aktivní ref ${String(v.aktivni).padStart(3)} (z ${v.celkem}, pasivní ${v.pasivni})`);
    }
  }

  const sPasivnim = vzorky.filter((v) => v.pasivni > 0);
  console.log('');
  console.log(`pasivní čekání odečteno u ${sPasivnim.length} receptů, celkem ${sPasivnim.reduce((a, v) => a + v.pasivni, 0)} min`);
  console.log(k.prosel
    ? 'RECALL PROŠEL — model spolehlivě pozná recept, o kterém se dá dokázat, že limit překračuje.'
    : 'RECALL NEPROŠEL — brána by pouštěla jídla prokazatelně nad limit. Fázi 2 nepouštět.');
}
