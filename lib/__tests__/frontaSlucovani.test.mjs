/**
 * Fronta objednava jedno pasmo na chod a ma strop na kusy.
 *
 * PROC. Zmereno 25. 8. 2026: fronta si rikala o 2 042 kusu ve 100 otevrenych
 * polozkach, pritom pokryvaly jen 17 kombinaci (slot x dieta x hint).
 * Tristilo je VYHRADNE kaloricke pasmo, ktere si kazda objednavka brala
 * z ciloveho prijmu konkretniho uzivatele — a unikat fronty ma pasmo v klici,
 * takze dve skoro stejne poptavky zalozily dva radky navzdy.
 *
 * Tenhle test hlida to, co se z JS overit da: ze se konstanty nerozesly
 * s SQL. Chovani (slouceni, dedup) overuje lib/__tests__/db/frontaSlucovani.db.test.mjs,
 * ktery to opravdu spusti.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  KANONICKA_PASMA,
  MIN_SIRKA_PASMA,
  ROZSAHY_CHODU,
  kanonickePasmo,
} from '../recipeGenerationBands.js';
import { MAX_KUSU_NA_OBJEDNAVKU } from '../recipeGenerationQueue.js';
import { MIN_RECEPTU_NA_SLOT } from '../dietOptions.js';

const MIGRACE = 'supabase/migrations/20260825120000_fronta_slucuje_poptavku.sql';
const sql = fs.readFileSync(MIGRACE, 'utf8');

/**
 * Migrace bez komentaru.
 *
 * Komentare popisuji, co se meni — vcetne stareho tvaru, ktery se nahrazuje.
 * `doesNotMatch` nad celym souborem by proto spadl na vete, ktera jen
 * vysvetluje, ze uz tam ten stary tvar NENI.
 */
const kod = sql
  .split('\n')
  .filter((r) => !r.trim().startsWith('--'))
  .join('\n');

// ------------------------------------------------------- kanonicke pasmo

test('kanonicke pasmo vznika z ROZSAHY_CHODU, neni psane znovu', () => {
  for (const [chod, rozsah] of Object.entries(ROZSAHY_CHODU)) {
    const pasmo = KANONICKA_PASMA[chod];
    assert.ok(pasmo, `chybi kanonicke pasmo pro ${chod}`);
    assert.equal(pasmo.kcal_min, rozsah.spodni_strop, `${chod}: spodni hranice`);
    assert.ok(pasmo.kcal_max >= rozsah.horni_podlaha, `${chod}: horni hranice`);
    assert.ok(
      pasmo.kcal_max - pasmo.kcal_min >= MIN_SIRKA_PASMA,
      `${chod}: pasmo uzsi nez ${MIN_SIRKA_PASMA} kcal`,
    );
  }
});

test('svacina se rozsiruje na minimalni sirku', () => {
  // 170-350 je 180 kcal, tedy pod MIN_SIRKA_PASMA. Jediny chod, ktereho
  // se rozsireni tyka — kdyby se ROZSAHY_CHODU zmenily, at je to videt.
  assert.deepEqual(kanonickePasmo('svacina'), { kcal_min: 170, kcal_max: 370 });
});

test('neznamy chod nedostane vymyslene pasmo', () => {
  assert.equal(kanonickePasmo('brunch'), null);
  assert.equal(kanonickePasmo(''), null);
  assert.equal(kanonickePasmo(null), null);
});

test('SQL a JS maji tataz pasma', () => {
  // V migraci stoji jako VALUES. Kdyby se rozesly, fronta by objednavala
  // jine pasmo, nez jake JS povazuje za kanonicke, a unikat by je nespojil.
  for (const [chod, pasmo] of Object.entries(KANONICKA_PASMA)) {
    const vzor = new RegExp(`\\('${chod}',\\s*${pasmo.kcal_min},\\s*${pasmo.kcal_max}\\)`);
    assert.match(sql, vzor, `SQL nema pro ${chod} pasmo ${pasmo.kcal_min}-${pasmo.kcal_max}`);
  }
});

// ------------------------------------------------------------- strop kusu

test('strop na objednavku je MIN_RECEPTU_NA_SLOT', () => {
  // Jedno cislo, tri mista: fronta, watchdog, plnic v SQL.
  assert.equal(MAX_KUSU_NA_OBJEDNAVKU, MIN_RECEPTU_NA_SLOT);
  assert.equal(MAX_KUSU_NA_OBJEDNAVKU, 7);
});

test('SQL plnic ma tyz strop', () => {
  assert.match(sql, /least\(7, v\.chybi_max/, 'plnic nema strop 7 na pozadovano');
  assert.doesNotMatch(kod, /least\(14,/, 've frontu zustal stary strop 14');
});

// --------------------------------------------------- dedup ignoruje pasmo

test('plnic slucuje poptavku pres pasmo', () => {
  // Pasmo v GROUP BY byt NESMI — jinak se poptavka zas roztristi.
  assert.match(sql, /GROUP BY d\.meal_type, d\.diet_tags\b/);
  assert.doesNotMatch(kod, /GROUP BY d\.meal_type, d\.diet_tags, d\.kcal_min/);
});

test('kontrola duplicity uz neporovnava pasmo', () => {
  // Stary tvar mel v NOT EXISTS i q.kcal_min = d.kcal_min.
  const notExists = kod.slice(kod.indexOf('WHERE NOT EXISTS'), kod.indexOf('vybrane AS'));
  assert.match(notExists, /q\.meal_type = d\.meal_type/);
  assert.match(notExists, /q\.diet_tags = d\.diet_tags/);
  assert.doesNotMatch(notExists, /q\.kcal_min/, 'dedup zase porovnava pasmo');
});

// ------------------------------------------------------------- slouceni

test('slouceni fronty nesmi objednat vic, nez se objednavalo', () => {
  assert.match(sql, /Slouceni frontu zvetsilo/, 'chybi kontrola smeru');
  assert.match(sql, /zustala polozka nad stropem/, 'chybi kontrola stropu');
  assert.match(sql, /zustala polozka mimo kanonicke pasmo/, 'chybi kontrola pasma');
});
