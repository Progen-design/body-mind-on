/**
 * Pásmo, které jde do fronty generátoru, musí být slotové — a OBĚ zapisovací
 * cesty musí zapsat totéž.
 *
 * PROČ TENHLE TEST EXISTUJE. 9. 8. 2026 dostaly zapisPoptavku i zapisLogPoptavky
 * stejné vstupní pásmo a každá si ho zaokrouhlila po svém:
 *     do fronty  snidane 439–459  (20 kcal)
 *     do logu    snidane 400–500  (100 kcal)
 * Obojí navíc bylo špatné pásmo — cíl slotu ±15 % místo slotového pásma.
 * Generátor by si tak objednával recepty do mikropásem a pálil tokeny.
 *
 * Je to osmý výskyt vzorce „dvě místa nad stejnými daty, hlídá se jen jedno“
 * (name vs name_en, gramu is null v pantry, meal_type CHECK, diet_tags pořadí,
 * Atwater na třech místech, limity slotů v bráně a sweeperu, …). Proto se
 * netestuje jen ta funkce, ale i to, že ji obě cesty opravdu používají.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { demandBandForSlot } from '../catalogDemandBand.js';

const ZDROJ = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'recipesCatalog.js'),
  'utf8'
);

test('demandBandForSlot bere slotové pásmo, ne cíl slotu ±15 %', () => {
  // Přesně případ z 9. 8.: snídaně, cíl ~449 kcal, slotové pásmo 300–550.
  const b = demandBandForSlot({
    slotKcalMin: 300,
    slotKcalMax: 550,
    minKcal: 439,
    maxKcal: 459,
  });
  assert.equal(b.kcalMin, 300);
  assert.equal(b.kcalMax, 550);
  assert.ok(b.kcalMax - b.kcalMin >= 200, 'slotové pásmo nesmí být mikropásmo');
});

test('bez slotového pásma spadne zpět na minKcal/maxKcal', () => {
  // Havarijní dotaz a honesty-fill pool slotové pásmo neznají. Nesmí kvůli
  // téhle změně přestat logovat.
  const b = demandBandForSlot({ minKcal: 200, maxKcal: 900 });
  assert.equal(b.kcalMin, 200);
  assert.equal(b.kcalMax, 900);

  const c = demandBandForSlot({ slotKcalMin: null, slotKcalMax: null, minKcal: 150, maxKcal: 320 });
  assert.equal(c.kcalMin, 150);
  assert.equal(c.kcalMax, 320);
});

test('nesmyslné slotové pásmo se ignoruje, nepoužije se obráceně', () => {
  const b = demandBandForSlot({ slotKcalMin: 600, slotKcalMax: 400, minKcal: 300, maxKcal: 550 });
  assert.equal(b.kcalMin, 300, 'min > max není pásmo, musí se použít fallback');
  assert.equal(b.kcalMax, 550);
});

test('spodní mez 80 kcal drží i pro slotové pásmo', () => {
  const b = demandBandForSlot({ slotKcalMin: 10, slotKcalMax: 200, minKcal: 50, maxKcal: 100 });
  assert.equal(b.kcalMin, 80);
});

test('obě zapisovací cesty používají TÝŽ spočítaný pár, ne vlastní zaokrouhlení', () => {
  // Jeden výpočet.
  const vypocty = ZDROJ.match(/demandBandForSlot\(\{[^}]*\}\)/g) || [];
  const vVolani = vypocty.filter((v) => !v.includes('export'));
  assert.equal(
    vVolani.length,
    1,
    `demandBandForSlot se má volat právě jednou, nalezeno ${vVolani.length}× — druhý výpočet se může rozejít`
  );

  // Obě použití.
  for (const cesta of ['zapisLogPoptavky', 'zapisPoptavku']) {
    const blok = ZDROJ.match(new RegExp(`${cesta}\\(\\{[\\s\\S]*?\\}\\);`));
    assert.ok(blok, `${cesta} se v recipesCatalog.js nenašla`);
    assert.match(
      blok[0],
      /kcalMin:\s*poptavkaPasmo\.kcalMin/,
      `${cesta} nepoužívá poptavkaPasmo.kcalMin — pásma se rozejdou`
    );
    assert.match(
      blok[0],
      /kcalMax:\s*poptavkaPasmo\.kcalMax/,
      `${cesta} nepoužívá poptavkaPasmo.kcalMax — pásma se rozejdou`
    );
    assert.doesNotMatch(
      blok[0],
      /Math\.(floor|ceil)\s*\(/,
      `${cesta} si zaokrouhluje sama — přesně tak vznikl rozdíl 439–459 vs 400–500`
    );
  }
});

test('SQL okno se odvozuje z importovaných hranic škálování, neopisuje je', () => {
  assert.match(
    ZDROJ,
    /MIN_SCALE,\s*\n\s*MAX_SCALE/,
    'MIN_SCALE/MAX_SCALE se musí importovat z portionScaling'
  );
  assert.match(ZDROJ, /minKcal\s*\/\s*maxScale/, 'spodní hrana SQL okna = minKcal / maxScale');
  assert.match(ZDROJ, /maxKcal\s*\/\s*minScale/, 'horní hrana SQL okna = maxKcal / minScale');
  // Natvrdo opsané 0.5 / 2.0 v okně by se rozešly s portionScaling.
  assert.doesNotMatch(
    ZDROJ,
    /minKcal\s*\/\s*2(\.0)?\b/,
    'hranice škálování se nesmí opisovat číslem'
  );
});
