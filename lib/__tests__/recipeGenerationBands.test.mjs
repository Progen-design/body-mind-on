/**
 * Kalorická pásma objednávek.
 *
 * Chyba, kterou to opravuje: seed objednávky snídaní s pásmem 350–550
 * a 400–550 skončily bez jediného receptu (0 z 6 položek), protože medián
 * toho, co model u snídaně vyrobí, je 392 kcal. Zaplatili jsme za generování
 * a nedostali nic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KROK_KCAL_POPTAVKY,
  MIN_KCAL_POPTAVKY,
  MIN_SIRKA_PASMA,
  ROZSAHY_CHODU,
  jePasmoNesplnitelne,
  kanonickePasmo,
  pasmoPoptavky,
  srovnejPasmo,
} from '../recipeGenerationBands.js';

test('snídaňové pásmo 400–550 se srovná pod medián produkce', () => {
  // Presne zadani polozek 1279 a 1281, ktere skoncily bez receptu.
  const v = srovnejPasmo({ meal_type: 'snidane', kcal_min: 400, kcal_max: 550 });
  assert.equal(v.kcal_min, 300);
  assert.ok(v.kcal_max >= 520);
  assert.equal(v.zmeneno, true);
  assert.match(v.duvod.join(' '), /spodni hranice 400 -> 300/);
});

test('pásmo 350–550 taky — nula úspěchů ze tří položek', () => {
  const v = srovnejPasmo({ meal_type: 'snidane', kcal_min: 350, kcal_max: 550 });
  assert.equal(v.kcal_min, 300);
  assert.equal(v.zmeneno, true);
});

test('pásmo, které fungovalo, se nemění', () => {
  // 300–550 dalo 3 recepty ze 4 polozek.
  const v = srovnejPasmo({ meal_type: 'snidane', kcal_min: 300, kcal_max: 550 });
  assert.equal(v.kcal_min, 300);
  assert.equal(v.kcal_max, 550);
  assert.equal(v.zmeneno, false);
  assert.deepEqual(v.duvod, []);
});

test('obědové 450–650 dostane vyšší strop', () => {
  // 450–650: 2 polozky, 2 selhani. 450–700: 4 hotove.
  const v = srovnejPasmo({ meal_type: 'obed', kcal_min: 450, kcal_max: 650 });
  assert.equal(v.kcal_min, 450);
  assert.equal(v.kcal_max, 680);
  assert.equal(v.zmeneno, true);
});

test('i poptávkové pásmo se spodní hranicí nad p10 se uvolní', () => {
  // `objednejZNevyresenehoSlotu` pocita cil/2 az cil*2. U vecere to dalo
  // 350–850, jenze p10 produkce je 300. Davka potrebuje PET receptu v pasmu,
  // takze i mirne useknuty spodek se projevi: pri 70 % zasahu je sance na pet
  // za sebou 17 %. Uvolneni dolu nic nestoji — slot si porci doskaluje
  // (0,5–2,0x), objednava se zakladni kcal receptu, ne cil slotu.
  const v = srovnejPasmo({ meal_type: 'vecere', kcal_min: 350, kcal_max: 850 });
  assert.equal(v.kcal_min, 300);
  assert.equal(v.kcal_max, 850, 'siroky strop se nesnizuje');
  assert.equal(v.zmeneno, true);
});

test('úzké pásmo se rozšíří na minimální šířku', () => {
  const v = srovnejPasmo({ meal_type: 'svacina', kcal_min: 170, kcal_max: 200 });
  assert.ok(v.kcal_max - v.kcal_min >= MIN_SIRKA_PASMA);
  assert.match(v.duvod.join(' '), /pasmo rozsireno/);
});

test('neznámý chod se nechává být — nehádá se, co jsme neměřili', () => {
  const v = srovnejPasmo({ meal_type: 'brunch', kcal_min: 900, kcal_max: 950 });
  assert.equal(v.kcal_min, 900);
  assert.equal(v.kcal_max, 950);
  assert.equal(v.zmeneno, false);
});

test('chybějící nebo nesmyslné hodnoty nespadnou', () => {
  assert.equal(srovnejPasmo({}).zmeneno, false);
  assert.equal(srovnejPasmo().zmeneno, false);
  assert.equal(srovnejPasmo({ meal_type: 'snidane', kcal_min: null, kcal_max: null }).zmeneno, false);
  assert.equal(srovnejPasmo({ meal_type: 'snidane', kcal_min: 'x', kcal_max: 'y' }).zmeneno, false);
});

test('úprava se nikdy neděje potichu', () => {
  const v = srovnejPasmo({ meal_type: 'snidane', kcal_min: 450, kcal_max: 500 });
  assert.equal(v.zmeneno, true);
  assert.ok(v.duvod.length > 0, 'změna zadání musí mít zapsaný důvod');
});

test('srovnané pásmo už je stabilní — druhý průchod nic nezmění', () => {
  const prvni = srovnejPasmo({ meal_type: 'snidane', kcal_min: 400, kcal_max: 550 });
  const druhy = srovnejPasmo({ meal_type: 'snidane', ...prvni });
  assert.equal(druhy.zmeneno, false);
});

test('nesplnitelné pásmo se pozná', () => {
  // Cele nad tim, co model u snidane tvori (max 542).
  assert.equal(jePasmoNesplnitelne({ meal_type: 'snidane', kcal_min: 700, kcal_max: 900 }), true);
  // Cele pod.
  assert.equal(jePasmoNesplnitelne({ meal_type: 'obed', kcal_min: 100, kcal_max: 200 }), true);
  // Bezne pasmo ne.
  assert.equal(jePasmoNesplnitelne({ meal_type: 'snidane', kcal_min: 300, kcal_max: 550 }), false);
  assert.equal(jePasmoNesplnitelne({ meal_type: 'brunch', kcal_min: 1, kcal_max: 2 }), false);
});

test('každý měřený chod má obě hranice', () => {
  for (const [chod, r] of Object.entries(ROZSAHY_CHODU)) {
    assert.ok(r.spodni_strop > 0, `${chod}: chybí spodní strop`);
    assert.ok(r.horni_podlaha > r.spodni_strop, `${chod}: horní podlaha není nad spodním stropem`);
  }
});

// ------------------------------------------------- poptávkové pásmo (8.5)

test('reálný případ z produkce: svačina cíl 369 — jen horní hranice se rozšíří', () => {
  // docs/DALSI_KROK.md 8.5: recept na 380 kcal odmítnut pro pásmo 170-370,
  // ačkoli cíl*2 = 738 ho měl pustit.
  const v = pasmoPoptavky('svacina', 369);
  assert.equal(v.kcal_min, 170, 'cíl/2=184.5 je nad kanonickým stropem 170 — nerozšiřuje se');
  assert.ok(v.kcal_max >= 738, `horní hranice ${v.kcal_max} musí pustit 738 kcal (cíl×2)`);
  assert.ok(v.kcal_max >= 380, 'musí přijmout i konkrétní zamítnutý recept z produkce');
});

test('reálný případ z produkce: svačina cíl 306 — obě hranice se rozšíří', () => {
  // docs/DALSI_KROK.md 8.5: recept na 125 kcal odmítnut pro pásmo 170-370.
  const v = pasmoPoptavky('svacina', 306);
  assert.ok(v.kcal_min <= 125, `spodní hranice ${v.kcal_min} musí pustit 125 kcal (cíl/2=153)`);
  assert.ok(v.kcal_max >= 612, `horní hranice ${v.kcal_max} musí pustit 612 kcal (cíl×2)`);
});

test('rozšíření je kvantizované — blízké cíle dají TÝŽ výsledek', () => {
  // Stejný princip jako KROK_PODILU u proteinHint.js: bez kvantizace by
  // fronta znovu roztříštila stejný slot na skoro identické objednávky.
  // 305 a 315 padnou do téhož kroku KROK_KCAL_POPTAVKY (300) na obou stranách.
  const a = pasmoPoptavky('svacina', 305);
  const b = pasmoPoptavky('svacina', 315);
  assert.deepEqual(a, b, 'cíle 305 a 315 musí dopadnout na stejné pásmo');
});

test('kvantizace je násobek KROK_KCAL_POPTAVKY (nebo padne na absolutní podlahu)', () => {
  // Oběd, cíl 700: cíl/2=350 (floor(350/300)*300=300, nad MIN_KCAL_POPTAVKY,
  // takže se opravdu kvantizuje, ne jen ořízne podlahou) a cíl*2=1400
  // (ceil(1400/300)*300=1500) — obě strany dopadnou na násobek kroku.
  const v = pasmoPoptavky('obed', 700);
  assert.equal(v.kcal_min % KROK_KCAL_POPTAVKY, 0);
  assert.equal(v.kcal_max % KROK_KCAL_POPTAVKY, 0);
});

test('svačina cíl 306 — spodní hranice je pod krokem, spadne na MIN_KCAL_POPTAVKY', () => {
  // cíl/2=153, floor(153/300)*300=0 — pod absolutní podlahou, takže tady
  // NEROZHODUJE krok, ale MIN_KCAL_POPTAVKY. Zvlášť od testu výš, ať je
  // vidět, který z obou mechanismů se kdy uplatní.
  const v = pasmoPoptavky('svacina', 306);
  assert.equal(v.kcal_min, MIN_KCAL_POPTAVKY);
});

test('spodní hranice nikdy nespadne pod MIN_KCAL_POPTAVKY', () => {
  const v = pasmoPoptavky('svacina', 20); // extrémně nízký cíl
  assert.ok(v.kcal_min >= MIN_KCAL_POPTAVKY);
});

test('pásmo je vždy aspoň MIN_SIRKA_PASMA široké', () => {
  const v = pasmoPoptavky('svacina', 306);
  assert.ok(v.kcal_max - v.kcal_min >= MIN_SIRKA_PASMA);
});

test('neznámý chod spadne na kanonickePasmo (null) — nehádá se', () => {
  assert.equal(pasmoPoptavky('brunch', 400), kanonickePasmo('brunch'));
  assert.equal(pasmoPoptavky('brunch', 400), null);
});

test('chybějící nebo nesmyslný cíl spadne na kanonickePasmo beze změny', () => {
  assert.deepEqual(pasmoPoptavky('svacina', null), kanonickePasmo('svacina'));
  assert.deepEqual(pasmoPoptavky('svacina', 0), kanonickePasmo('svacina'));
  assert.deepEqual(pasmoPoptavky('svacina', -100), kanonickePasmo('svacina'));
  assert.deepEqual(pasmoPoptavky('svacina', 'x'), kanonickePasmo('svacina'));
});

test('cíl, který se do kanonického pásma vejde i po /2 a ×2, ho nechá beze změny', () => {
  // svačina 170-350 (kanonizované na 170-370): cíl 200 → cíl/2=100 (POD 170,
  // rozšíří), cíl*2=400 (NAD 370, rozšíří) — zvolme cíl, kde ani jedno neplatí.
  // Neexistuje takový cíl pro svačinu (pásmo je úzké) — ověřeno na oběd:
  // 450-680, cíl 300 → cíl/2=150 (pod, rozšíří), cíl*2=600 (uvnitř, nerozšíří).
  const v = pasmoPoptavky('obed', 300);
  assert.equal(v.kcal_max, 680, 'horní hranice se nemá rozšiřovat, když cíl×2 do ní už patří');
});
