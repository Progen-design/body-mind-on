/**
 * Jídlo mimo plán — čisté funkce z lib/quickFoodLog.js a tvar migrace.
 *
 * Validace odpovědi modelu je to hlavní: model smí vrátit nesmysl a ten se
 * nesmí dostat do denního součtu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DENNI_LIMIT_ZAPISU,
  MAX_KCAL,
  jeNadDennimLimitem,
  jeVOknuOpravy,
  overOpravu,
  overVstup,
  rozeberOdhadAI,
  sestavZpravy,
  soucetLogu,
} from '../quickFoodLog.js';

const KOREN = join(import.meta.dirname, '..', '..');
const cti = (p) => readFileSync(join(KOREN, p), 'utf8');

// ---------------------------------------------------------------- odpověď AI

const platna = { popis: 'Svíčková s knedlíkem', kcal: 820, protein_g: 38.24, carbs_g: 76, fat_g: 38.96, confidence: 'medium' };

test('AI JSON: platná odpověď projde a čísla se zaokrouhlí', () => {
  const r = rozeberOdhadAI(JSON.stringify(platna));
  assert.equal(r.ok, true);
  assert.deepEqual(r.odhad, {
    popis: 'Svíčková s knedlíkem', kcal: 820, protein_g: 38.2, carbs_g: 76, fat_g: 39, confidence: 'medium',
  });
});

test('AI JSON: text kolem JSONu nebo markdown neprojde', () => {
  assert.deepEqual(rozeberOdhadAI(`Tady je odhad: ${JSON.stringify(platna)}`), { ok: false, duvod: 'neni_json' });
  assert.deepEqual(rozeberOdhadAI('```json\n' + JSON.stringify(platna) + '\n```'), { ok: false, duvod: 'neni_json' });
  assert.deepEqual(rozeberOdhadAI(''), { ok: false, duvod: 'neni_json' });
  assert.deepEqual(rozeberOdhadAI('[1,2]'), { ok: false, duvod: 'neni_json' });
  assert.deepEqual(rozeberOdhadAI(null), { ok: false, duvod: 'neni_json' });
});

test('AI JSON: kcal mimo 0–3000 se odmítne, neuloží', () => {
  assert.deepEqual(rozeberOdhadAI(JSON.stringify({ ...platna, kcal: 3001 })), { ok: false, duvod: 'mimo_rozsah' });
  assert.deepEqual(rozeberOdhadAI(JSON.stringify({ ...platna, kcal: -5 })), { ok: false, duvod: 'mimo_rozsah' });
  assert.equal(rozeberOdhadAI(JSON.stringify({ ...platna, kcal: MAX_KCAL })).ok, true, '3000 je ještě v pořádku');
  assert.equal(rozeberOdhadAI(JSON.stringify({ ...platna, kcal: 0 })).ok, true, '0 kcal (voda, černé kafe) je v pořádku');
});

test('AI JSON: záporná nebo nečíselná makra se odmítnou', () => {
  assert.deepEqual(rozeberOdhadAI(JSON.stringify({ ...platna, fat_g: -1 })), { ok: false, duvod: 'mimo_rozsah' });
  assert.deepEqual(rozeberOdhadAI(JSON.stringify({ ...platna, protein_g: 'hodně' })), { ok: false, duvod: 'mimo_rozsah' });
  assert.deepEqual(rozeberOdhadAI(JSON.stringify({ ...platna, carbs_g: 5000 })), { ok: false, duvod: 'mimo_rozsah' });
});

test('AI JSON: chybějící pole se odmítne', () => {
  const { carbs_g, ...bezSacharidu } = platna;
  void carbs_g;
  assert.deepEqual(rozeberOdhadAI(JSON.stringify(bezSacharidu)), { ok: false, duvod: 'chybi_pole' });
  assert.deepEqual(rozeberOdhadAI(JSON.stringify({ ...platna, kcal: null })), { ok: false, duvod: 'chybi_pole' });
});

test('AI JSON: „nejde o jídlo" je vlastní důvod, ne rozbitá odpověď', () => {
  assert.deepEqual(rozeberOdhadAI('{"chyba":"nejde_o_jidlo"}'), { ok: false, duvod: 'nejde_o_jidlo' });
});

test('AI JSON: neznámá jistota se uloží jako null, ne jako nesmysl', () => {
  const r = rozeberOdhadAI(JSON.stringify({ ...platna, confidence: 'velmi jistá' }));
  assert.equal(r.ok, true);
  assert.equal(r.odhad.confidence, null);
});

// ---------------------------------------------------------------- vstup

test('vstup: přesně jedno z popisu a fotky', () => {
  assert.equal(overVstup({ popis: 'rohlík' }).zdroj, 'text');
  assert.equal(overVstup({ foto_base64: 'data:image/png;base64,AAAA' }).zdroj, 'foto');
  assert.equal(overVstup({ popis: 'rohlík', foto_base64: 'AAAA' }).ok, false, 'obojí nesmí projít');
  assert.equal(overVstup({}).ok, false, 'nic nesmí projít');
  assert.equal(overVstup({ popis: '   ' }).ok, false, 'prázdný popis není popis');
  assert.equal(overVstup({ popis: 'x'.repeat(501) }).ok, false);
});

test('vstup: holé base64 bez hlavičky se bere jako JPEG data URL', () => {
  assert.equal(overVstup({ foto_base64: 'AAAA' }).foto, 'data:image/jpeg;base64,AAAA');
});

test('zprávy pro model: fotka jde s detail low, text jako věta', () => {
  const foto = sestavZpravy({ zdroj: 'foto', dataUrlProAI: 'data:image/jpeg;base64,AAAA' });
  assert.equal(foto[0].role, 'system');
  assert.equal(foto[1].content[1].image_url.detail, 'low');
  const text = sestavZpravy({ zdroj: 'text', popis: 'dva rohlíky' });
  assert.match(text[1].content, /dva rohlíky/);
});

// ---------------------------------------------------------------- limit

test(`denní limit: ${DENNI_LIMIT_ZAPISU}. zápis ještě projde, další ne`, () => {
  assert.equal(DENNI_LIMIT_ZAPISU, 20);
  assert.equal(jeNadDennimLimitem(19), false);
  assert.equal(jeNadDennimLimitem(20), true);
  assert.equal(jeNadDennimLimitem(35), true);
});

test('denní limit: nespočitatelný počet zápis nezablokuje', () => {
  assert.equal(jeNadDennimLimitem(null), false);
  assert.equal(jeNadDennimLimitem(undefined), false);
  assert.equal(jeNadDennimLimitem(NaN), false);
});

// ---------------------------------------------------------------- oprava

test('oprava: čísla v rozsahu projdou, čárka jako desetinná tečka', () => {
  assert.deepEqual(overOpravu({ kcal: '450', fat_g: '12,55' }), { ok: true, zmena: { kcal: 450, fat_g: 12.6 } });
  assert.equal(overOpravu({ kcal: 3001 }).ok, false);
  assert.equal(overOpravu({ protein_g: -1 }).ok, false);
  assert.equal(overOpravu({}).ok, false, 'prázdná oprava není oprava');
});

test('oprava: jen 30 minut po zápisu', () => {
  const ted = Date.parse('2026-09-24T12:00:00Z');
  assert.equal(jeVOknuOpravy('2026-09-24T11:31:00Z', ted), true);
  assert.equal(jeVOknuOpravy('2026-09-24T11:29:00Z', ted), false);
  assert.equal(jeVOknuOpravy('nesmysl', ted), false);
});

// ---------------------------------------------------------------- součet

test('součet zápisů pro TEDa: sečte a zaokrouhlí', () => {
  assert.deepEqual(
    soucetLogu([
      { kcal: 450, protein_g: '20.1', carbs_g: 50, fat_g: 18.25 },
      { kcal: 120, protein_g: 3, carbs_g: 25.05, fat_g: 1 },
    ]),
    { kcal: 570, protein_g: 23.1, carbs_g: 75.1, fat_g: 19.3, pocet: 2 },
  );
  assert.deepEqual(soucetLogu([]), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, pocet: 0 });
});

// ---------------------------------------------------------------- tvar kódu

test('migrace: RLS, CHECK na kcal, private bucket, okno opravy 30 min', () => {
  const m = cti('supabase/migrations/20260924090000_quick_food_logs.sql');
  assert.match(m, /alter table public\.quick_food_logs enable row level security/);
  assert.match(m, /check \(kcal between 0 and 3000\)/);
  assert.match(m, /check \(zdroj in \('foto', 'text'\)\)/);
  assert.match(m, /values \('quick-log-photos', 'quick-log-photos', false/);
  assert.match(m, /for update to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id and created_at > now\(\) - interval '30 minutes'\)/);
  // Žádná storage politika — k fotkám jen service klíčem.
  assert.doesNotMatch(m, /on storage\.objects/);
  assert.doesNotMatch(m, /db push|supabase db/);
});

test('endpoint: user_id jen ze session, model jen přes volejModel s purpose quick_food_log', () => {
  const api = cti('api/nutrition/quick-log/index.js');
  assert.doesNotMatch(api, /req\.body\??\.user_id/, 'user_id z těla požadavku');
  assert.match(api, /user_id: user\.id/);
  assert.match(api, /purpose: PURPOSE_QUICK_LOG/);
  assert.doesNotMatch(api, /api\.openai\.com|new OpenAI/);
});

test('PATCH i DELETE mají vlastníka přímo v dotazu', () => {
  const api = cti('api/nutrition/quick-log/[id].js');
  for (const vzor of [/\.update\(\{[\s\S]{0,120}\.eq\('id', id\)\s*\.eq\('user_id', user\.id\)/, /\.delete\(\)\s*\.eq\('id', id\)\s*\.eq\('user_id', user\.id\)/]) {
    assert.match(api, vzor);
  }
  assert.match(api, /upraveno_uzivatelem: true/);
});

test('smazání účtu uklidí i fotky jídla mimo plán', () => {
  const endpoint = cti('api/delete-account.js');
  assert.match(endpoint, /await smazFotkyJidlaUzivatele\(userId\)/);
  // Musí to být PŘED smazáním dat — potom by nebylo podle čeho hledat.
  assert.ok(endpoint.indexOf('smazFotkyJidlaUzivatele(userId)') < endpoint.indexOf("rpc('delete_user_data'"));
});

test('TED dostává dnešní jídlo mimo plán v naměřených datech', () => {
  const kontext = cti('lib/coachChatKontext.js');
  assert.match(kontext, /from\('quick_food_logs'\)[\s\S]{0,200}\.eq\('plan_day', dnes\)/);
  assert.match(kontext, /out\.jidlo_mimo_plan_dnes = \{/);
});
