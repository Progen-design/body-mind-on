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

import { demandBandForSlot, serveBandForSlot } from '../catalogDemandBand.js';
import { slotTargetKcal, planMealTypeToWeightKey, START_MIN_SCALE, START_MAX_SCALE } from '../nutrition/portionScaling.js';
import { calorieRangeForMealType } from '../spoonacularComplexSearch.js';

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

/**
 * PÁSMO NASERVÍROVANÉ PORCE MUSÍ OBSAHOVAT CÍL SLOTU.
 *
 * 9. 8. 2026, snídaně, 1996 kcal/den, 5 jídel: cíl slotu 399 kcal, ale pásmo
 * 439–459. Porce se škáluje na cíl, takže každý recept, který cíl trefil,
 * naservíroval ~399 a spadl POD pásmo. Ze 43 načtených snídaní prošlo 7 — a to
 * zrovna ty, které cíl minuly nejvíc (439–459 kcal). Filtr byl obrácený naruby:
 * čím líp recept sedl na cíl, tím jistěji se zahodil. Uživatel dostal 2 snídaně.
 *
 * Kořen je rozpor dvou zdrojů pravdy:
 *   MEAL_WEIGHTS[5].snidane            = 0,20 dne  → cíl 399
 *   calorieRangeForMealType breakfast  = 0,22 dne  → dolní hrana 439
 * Netýká se to jen snídaně — při 6 jídlech a 2400+ kcal/den si odporují všechny
 * čtyři sloty. Proto se netestuje jeden případ, ale celá matice.
 */
test('serveBandForSlot: konzistentní pásmo projde beze změny', () => {
  // Nic se nesmí uvolňovat na slotech, kde je pásmo v pořádku.
  const b = serveBandForSlot({ minKcal: 519, maxKcal: 643, slotTargetKcal: 559 });
  assert.equal(b.minKcal, 519);
  assert.equal(b.maxKcal, 643);
  assert.equal(b.opraveno, false);
});

test('serveBandForSlot: cíl pod pásmem — přesně případ z 9. 8.', () => {
  const b = serveBandForSlot({ minKcal: 439, maxKcal: 459, slotTargetKcal: 399 });
  assert.equal(b.opraveno, true);
  assert.equal(b.minKcal, 339, 'dolní hrana = cíl × 0,85');
  assert.equal(b.maxKcal, 459, 'horní hrana = cíl × 1,15');
  assert.ok(399 >= b.minKcal && 399 <= b.maxKcal, 'cíl musí ležet uvnitř');
});

test('serveBandForSlot: cíl nad pásmem se srovná taky', () => {
  const b = serveBandForSlot({ minKcal: 160, maxKcal: 300, slotTargetKcal: 420 });
  assert.equal(b.opraveno, true);
  assert.equal(b.minKcal, 357);
  assert.equal(b.maxKcal, 483);
});

test('serveBandForSlot: bez cíle se pásmo nemá s čím srovnat', () => {
  // Havarijní dotaz cíl slotu nezná — nesmí se mu pásmo přepsat.
  const b = serveBandForSlot({ minKcal: 200, maxKcal: 900, slotTargetKcal: null });
  assert.equal(b.opraveno, false);
  assert.equal(b.minKcal, 200);
  assert.equal(b.maxKcal, 900);
});

test('recept naškálovaný na cíl projde pásmem v KAŽDÉ kombinaci den × jídel × slot', () => {
  const SLOTY = ['breakfast', 'lunch', 'dinner', 'snack'];
  const rozbite = [];

  for (const den of [1400, 1600, 1996, 2200, 2400, 3000, 3560]) {
    for (const jidel of [3, 4, 5, 6]) {
      for (const slot of SLOTY) {
        if (slot === 'snack' && jidel < 4) continue;

        const cil = slotTargetKcal(den, jidel, planMealTypeToWeightKey(slot));
        const vyrobit = calorieRangeForMealType(slot, den, jidel);
        // Průnik z kcalBandForMealSlot: slotové pásmo × cíl ±15 %.
        const lo = Math.max(vyrobit.min, Math.round(cil * 0.85));
        const hi = Math.min(vyrobit.max, Math.round(cil * 1.15));
        const pred = lo <= hi ? { minKcal: lo, maxKcal: hi } : { minKcal: vyrobit.min, maxKcal: vyrobit.max };

        const pasmo = serveBandForSlot({ ...pred, slotTargetKcal: cil });

        // Recept, jehož base kcal JE cíl → multiplikátor 1 → naservíruje cíl.
        // Tenhle kandidát musí projít vždycky; když ne, filtr zahazuje ty
        // nejlepší kandidáty a nechává ty nejhorší.
        if (cil < pasmo.minKcal - 0.5 || cil > pasmo.maxKcal + 0.5) {
          rozbite.push(`${den} kcal / ${jidel} jídel / ${slot}: cíl ${cil} mimo ${pasmo.minKcal}–${pasmo.maxKcal}`);
        }
      }
    }
  }

  assert.deepEqual(rozbite, [], `pásmo neobsahuje cíl slotu:\n  ${rozbite.join('\n  ')}`);
});

test('SQL okno srovnaného pásma pustí dál celý rozsah škálování', () => {
  // Kontrola, že se okno a pásmo po opravě nerozejdou: co SQL načte, to má mít
  // šanci projít. Snídaně z 9. 8.
  const cil = 399;
  const { minKcal, maxKcal } = serveBandForSlot({ minKcal: 439, maxKcal: 459, slotTargetKcal: cil });
  const sqlMin = Math.max(80, Math.floor(minKcal / START_MAX_SCALE));
  const sqlMax = Math.ceil(maxKcal / START_MIN_SCALE);

  let zahozeno = 0;
  for (let base = sqlMin; base <= sqlMax; base++) {
    const nasobek = Math.round(Math.min(START_MAX_SCALE, Math.max(START_MIN_SCALE, cil / base)) * 100) / 100;
    const naservirovano = base * nasobek;
    if (naservirovano < minKcal - 0.5 || naservirovano > maxKcal + 0.5) zahozeno += 1;
  }

  // Nula by chtěla přesnou aritmetiku; jde o to, že okno není z 84 % k ničemu.
  assert.ok(zahozeno <= 2, `z okna ${sqlMin}–${sqlMax} se zahodí ${zahozeno} možných base kcal`);
});

test('fetchCatalogCandidates si pásmo srovnává samo, ne až u volajícího', () => {
  // Do fetche vedou tři cesty (hlavní výběr, fallback na slotové pásmo,
  // havarijní dotaz) a rozbité pásmo posílaly dvě z nich. Kdyby se oprava
  // udělala jen v kcalBandForMealSlot, fallback by zůstal rozbitý.
  assert.match(ZDROJ, /serveBandForSlot\(\{/, 'recipesCatalog.js musí volat serveBandForSlot');
  assert.match(
    ZDROJ,
    /const\s+minKcal\s*=\s*servePasmo\.minKcal/,
    'minKcal musí pocházet ze srovnaného pásma, ne přímo z parametrů'
  );
  assert.match(
    ZDROJ,
    /const\s+maxKcal\s*=\s*servePasmo\.maxKcal/,
    'maxKcal musí pocházet ze srovnaného pásma, ne přímo z parametrů'
  );
});

test('passesPostScale loguje důvod odmítnutí, nejen počet', () => {
  // 9. 8. hlásil log jen `blockedByHardFilters: 41` a důvod se musel dohadovat
  // z produkčního SQL. Odmítnutí, které se tiše nezapočítá, se příště hledá
  // stejně dlouho.
  const blok = ZDROJ.match(/function passesPostScale\(r\) \{[\s\S]*?\n  \}/);
  assert.ok(blok, 'passesPostScale se v recipesCatalog.js nenašla');
  assert.match(blok[0], /podMin/, 'musí rozlišit odmítnutí pod dolní hranou');
  assert.match(blok[0], /nadMax/, 'musí rozlišit odmítnutí nad horní hranou');
  assert.match(blok[0], /naservirovano:/, 'do vzorku patří naservírované kcal');
  assert.match(blok[0], /nasobek,/, 'do vzorku patří spočtený multiplikátor');
  assert.match(ZDROJ, /passesPostScale zahodilo kandidaty/, 'počty se musí dostat do logu');
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
