/**
 * Aktivacni brana: recept bez postupu a s anglickymi surovinami se neaktivuje.
 *
 * PROC TENHLE TEST. Watchdog nahlasil 20 aktivnich receptu bez pouzitelneho
 * postupu. Kroky v `instructions` byly, `instructions_cs` bylo NULL. Backfill
 * to spravil v datech, ale bez brany se to zopakuje u dalsiho importu.
 *
 * Brana je v SQL (trigger + sweeper), takze tenhle test hlida dve veci, ktere
 * se z JS overit daji a ktere se snadno tise rozejdou:
 *
 *   1. Migrace ma obe podminky na OBOU mistech. Kdyby pribyly jen do triggeru,
 *      sweeper by recepty druhy den zase zapnul.
 *   2. Prah pouzitelneho kroku v SQL se rovna tomu v JS. Kdyby se rozesel,
 *      generator by recept prijal a DB ho vzapeti deaktivovala.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { MIN_KROKU_POSTUPU, pouzitelneKroky } from '../profile/postupReceptu.js';
import { jeSurovinaNeprelozena, pocetNeprelozenychSurovin } from '../spoonacular/prekladStav.js';

const MIGRACE = 'supabase/migrations/20260824100000_aktivacni_brana_postup_a_preklad.sql';
const sql = fs.readFileSync(MIGRACE, 'utf8');

// --------------------------------------------------------- obe mista v SQL

test('migrace definuje oba predikaty', () => {
  assert.match(sql, /create or replace function public\.recipe_ma_postup/);
  assert.match(sql, /create or replace function public\.recipe_neprelozenych_surovin/);
});

test('podminka na postup je v brane i ve sweeperu', () => {
  // Bez sweeperu by branu obesla denni doaktivace.
  const vyskyty = [...sql.matchAll(/recipe_ma_postup\s*\(/g)].length;
  assert.ok(vyskyty >= 3, `ceka se definice + brana + sweeper, nalezeno ${vyskyty}`);

  assert.match(sql, /NOT public\.recipe_ma_postup\(NEW\.instructions_cs\)/, 'chybi v brane');
  assert.match(sql, /AND public\.recipe_ma_postup\(r\.instructions_cs\)/, 'chybi ve sweeperu');
});

test('podminka na preklad surovin je v brane i ve sweeperu', () => {
  assert.match(sql, /public\.recipe_neprelozenych_surovin\(NEW\.ingredients\) > 0/, 'chybi v brane');
  assert.match(sql, /public\.recipe_neprelozenych_surovin\(r\.ingredients\) = 0/, 'chybi ve sweeperu');
});

// -------------------------------------------------- prejata slova
//
// TOHLE JE TA CHYBA, KTERA UZ JEDNOU STALA PENIZE. Heuristika "name == name_en"
// bez seznamu prejatych slov drzela 22. 8. 2026 prekladovy cron v placene
// smycce. Prvni verze podminky h) ji zopakovala: hlasila 25 aktivnich receptu
// jako neprelozene, pritom u vsech 25 slo o quinou, tofu, fetu nebo farfalle.
// Zmereno po oprave: 0 receptu se deaktivuje.

/** Seznam prejatych slov se cte z migrace, ktera je_prejata_surovina definuje. */
function prejataSlova() {
  const def = fs.readFileSync('supabase/migrations/20260821140000_watchdog_konzistence_obsahu.sql', 'utf8');
  const telo = def.match(/je_prejata_surovina[\s\S]*?ARRAY\[([\s\S]*?)\]/);
  assert.ok(telo, 'v migraci nenalezen seznam prejatych slov');
  return [...telo[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Zrcadli podminku h) z migrace, vcetne vyjimky na prejata slova. */
function neprelozenychSurovin(suroviny) {
  const prejata = new Set(prejataSlova());
  return (Array.isArray(suroviny) ? suroviny : []).filter((e) => {
    const name = String(e?.name ?? '').trim();
    const nameEn = String(e?.name_en ?? '').trim();
    if (!name) return true;
    if (!nameEn) return false;
    if (name.toLowerCase() !== nameEn.toLowerCase()) return false;
    return !prejata.has(name.toLowerCase());
  }).length;
}

test('podminka h) vola je_prejata_surovina, ne holou shodu retezcu', () => {
  assert.match(
    sql,
    /and not public\.je_prejata_surovina\(e->>'name'\)/,
    'bez je_prejata_surovina by se deaktivovaly recepty s quinoou a tofu',
  );
});

test('recept s quinoou a tofu se NEDEAKTIVUJE', () => {
  // Fixture podle skutecnych radku v katalogu: name i name_en jsou 'quinoa',
  // protoze se to cesky pise stejne. Preklad probehl, jen neni videt.
  const recept = [
    { name: 'quinoa', name_en: 'quinoa' },
    { name: 'tofu', name_en: 'tofu' },
    { name: 'mrkev', name_en: 'carrot' },
  ];

  assert.equal(neprelozenychSurovin(recept), 0, 'brana by tenhle recept vypnula neopravnene');
});

test('vsech 25 nalezenych surovin je na seznamu prejatych', () => {
  // Presne ty nazvy, kvuli kterym prvni verze hlasila 25 receptu.
  const zmerene = [
    'quinoa', 'mango', 'paprika', 'oregano', 'tofu', 'feta', 'ricotta',
    'mascarpone', 'chorizo', 'croissant', 'guacamole', 'salsa', 'tahini',
    'kiwi', 'chilli', 'jalapeño', 'mirin', 'farfalle', 'fettuccine',
  ];
  const prejata = new Set(prejataSlova());

  for (const nazev of zmerene) {
    assert.ok(prejata.has(nazev), `"${nazev}" chybi v je_prejata_surovina — brana by recept vypnula`);
  }
});

test('opravdu neprelozena surovina se porad chyti', () => {
  // Vyjimka na prejata slova nesmi branu vypnout uplne.
  assert.equal(neprelozenychSurovin([{ name: 'old fashioned oats', name_en: 'old fashioned oats' }]), 1);
  assert.equal(neprelozenychSurovin([{ name: 'Salt to taste', name_en: 'Salt to taste' }]), 1);
  assert.equal(neprelozenychSurovin([{ name: '', name_en: 'carrot' }]), 1, 'chybejici nazev je porad vada');
});

test('brana nezahodila zadnou z puvodnich podminek a) az f)', () => {
  // `create or replace` prepisuje celou funkci, takze vynechana podminka
  // by se tise ztratila.
  for (const [popis, vzor] of [
    ['pending_review', /NEW\.pending_review/],
    ['kcal a makra', /NEW\.kcal IS NULL OR NEW\.kcal <= 0/],
    ['Atwater', /public\.atwater_ok\(NEW\.kcal/],
    ['pocet surovin', /count_main_ingredients\(NEW\.ingredients\) > 10/],
    ['cesky nazev', /NEW\.name_cs IS NULL OR btrim\(NEW\.name_cs\) = ''/],
    ['cas slotu', /slot_time_limit\(NEW\.meal_type\)/],
    ['vegan', /'vegan' = ANY\(NEW\.diet_tags\)/],
    ['vegetarian', /'vegetarian' = ANY\(NEW\.diet_tags\)/],
  ]) {
    assert.match(sql, vzor, `brana prisla o podminku: ${popis}`);
  }
});

test('prah pouzitelneho kroku v SQL se rovna tomu v JS', () => {
  // JS: pouzitelneKroky filtruje k.length >= 3.
  const shoda = sql.match(/length\(btrim\(k\)\)\s*>=\s*(\d+)/);
  assert.ok(shoda, 'v SQL nenalezen prah delky kroku');
  assert.equal(Number(shoda[1]), 3, 'SQL a lib/profile/postupReceptu.js se rozesly');
  assert.equal(pouzitelneKroky(['ab']).length, 0, 'JS: dvouznakovy krok neni krok');
  assert.equal(pouzitelneKroky(['abc']).length, 1);
});

// ------------------------------------------------------- semantika v JS
//
// Tytez hranicni pripady, jake byly overene proti produkci suchym behem
// obou SQL predikatu. Drzi se tu, aby se zmena v JS neprovedla bez zmeny SQL.

test('postup: NULL, prazdne pole ani prazdne retezce nejsou postup', () => {
  assert.equal(pouzitelneKroky(null).length, 0);
  assert.equal(pouzitelneKroky([]).length, 0);
  assert.equal(pouzitelneKroky(['', '  ']).length, 0);
  assert.equal(pouzitelneKroky('text').length, 0, 'spatny typ neni postup');
  assert.ok(pouzitelneKroky(['Uvar vejce.', 'Oloupej.']).length >= 1);
});

test('kostrbaty postup je porad postup — brana ho pousti', () => {
  // recipes_catalog id=466: dva kroky. Radsi strohy navod nez zadny.
  const kostrbaty = ['Uvar vejce natvrdo.', 'Podavej s pecivem.'];
  assert.ok(pouzitelneKroky(kostrbaty).length > 0, 'brana g) ho nesmi vypnout');
  assert.ok(pouzitelneKroky(kostrbaty).length < MIN_KROKU_POSTUPU, 'ale je chudy');
});

test('surovina: shoda name a name_en znamena neprelozeno', () => {
  assert.equal(jeSurovinaNeprelozena({ name: 'carrot', name_en: 'carrot' }), true);
  assert.equal(jeSurovinaNeprelozena({ name: 'Carrot', name_en: 'carrot' }), true, 'velikost pismen nerozhoduje');
  assert.equal(jeSurovinaNeprelozena({ name: 'mrkev', name_en: 'carrot' }), false);
});

test('surovina bez name_en se za neprelozenou nepovazuje', () => {
  // Radky z doby pred zavedenim prekladu. Nedá se u nich poznat nic.
  assert.equal(jeSurovinaNeprelozena({ name: 'mrkev' }), false);
  // Ale uplne chybejici nazev ano.
  assert.equal(jeSurovinaNeprelozena({ name: '', name_en: 'carrot' }), true);
});

test('pocet neprelozenych zvlada i chybejici pole', () => {
  assert.equal(pocetNeprelozenychSurovin(null), 0);
  assert.equal(pocetNeprelozenychSurovin([]), 0);
  assert.equal(
    pocetNeprelozenychSurovin([
      { name: 'mrkev', name_en: 'carrot' },
      { name: 'oats', name_en: 'oats' },
      { name: 'salt', name_en: 'Salt' },
    ]),
    2,
  );
});
