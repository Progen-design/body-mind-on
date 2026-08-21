/**
 * Slovník cviků žije na třech místech a musí zůstat v souladu:
 *
 *   lib/exerciseCanonicalMap.js    názvy, vybavení, partie
 *   lib/exerciseRegistryMedia.js   natvrdo zapsané GIF URL
 *   exercise_asset_registry (DB)   zdroj pravdy pro plánovač
 *
 * Když se přidá cvik do JS a zapomene se na databázi, plán ho pořád složí —
 * médium se vezme z kodové mapy — ale DB přestane být zdrojem pravdy a dotaz
 * „co uživateli umíme nabídnout“ na ni dá špatnou odpověď. Naměřeno: v čerstvém
 * plánu bylo 15 cviků, ale jen 6 jejich klíčů mělo řádek v registry.
 *
 * Tenhle test hlídá právě ten směr. Seznam očekávaných klíčů drží migrace
 * 20260803200000 v pohledu exercise_registry_expected_keys; test kontroluje,
 * že mu JS neutekl dopředu. DB se tu nedotazuje schválně — test má běžet
 * v CI bez přístupu k produkci.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { CANONICAL_EXERCISES } from '../exerciseCanonicalMap.js';
import {
  TRUSTED_EXERCISE_GIF_BY_KEY,
  TRUSTED_EXTENDED_GIF_BY_KEY,
} from '../exerciseRegistryMedia.js';

/** Klíče vypsané v migraci, která registry plní. */
function ocekavaneKliceZMigrace() {
  const sql = readFileSync(
    'supabase/migrations/20260803200000_exercise_registry_close_code_gap.sql',
    'utf8',
  );
  const zacatek = sql.indexOf('FROM unnest(ARRAY[');
  assert.ok(zacatek > -1, 'v migraci chybí seznam očekávaných klíčů');
  const konec = sql.indexOf(']) AS k', zacatek);
  const blok = sql.slice(zacatek, konec);
  return new Set([...blok.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
}

test('každý kanonický cvik má očekávaný řádek v registry', () => {
  const ocekavane = ocekavaneKliceZMigrace();
  const chybi = Object.keys(CANONICAL_EXERCISES).filter((k) => !ocekavane.has(k));
  assert.deepEqual(
    chybi, [],
    `Tyhle klíče jsou v exerciseCanonicalMap.js, ale ne v seznamu pro registry: ${chybi.join(', ')}.`
    + ' Přidej je migrací do exercise_asset_registry i do exercise_registry_expected_keys.',
  );
});

test('každý klíč s natvrdo zapsaným GIFem má očekávaný řádek v registry', () => {
  const ocekavane = ocekavaneKliceZMigrace();
  const vsechnyGify = {
    ...TRUSTED_EXERCISE_GIF_BY_KEY,
    ...TRUSTED_EXTENDED_GIF_BY_KEY,
  };
  const chybi = Object.keys(vsechnyGify).filter((k) => !ocekavane.has(k));
  assert.deepEqual(
    chybi, [],
    `Tyhle klíče mají GIF v exerciseRegistryMedia.js, ale ne řádek pro registry: ${chybi.join(', ')}.`,
  );
});

// POZN.: opacny smer se zamerne nehlida. Registry smi obsahovat vic cviku, nez
// planovac dnes pouziva — 13 klicu v nem je navic (box_jump, dips, face_pull,
// step_up a dalsi) a je to zasoba, ne chyba. Problem je jen smer JS -> DB.
