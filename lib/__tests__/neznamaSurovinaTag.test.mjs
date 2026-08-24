/**
 * Neznama surovina, ktera shodi dietni tag.
 *
 * PROC. Migrace 20260824120000 zavedla spravne, ale TICHE pravidlo: surovina,
 * kterou slovnik neumi posoudit, shodi `gluten_free`. Recept zustane aktivni
 * a v katalogu, jen se prestane nabizet celiakovi — nikde se nerozsviti, ze
 * se to stalo. Zmereno 24. 8. 2026: kvuli tomu prijde o tag 27 receptu ze 199.
 *
 * Detekce zije v SQL pohledu, takze tenhle test hlida to, co se z JS overit
 * da: ze rozhodnuti drzi tvar, ve kterem se seznam nemuze tise ztratit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const MIGRACE = 'supabase/migrations/20260824130000_neznama_surovina_blokuje_dietni_tag.sql';
const sql = fs.readFileSync(MIGRACE, 'utf8');

// ----------------------------------------------------------- rozhodnuti

test('neznama surovina se nikam nezapisuje, pocita se z katalogu', () => {
  // Log by dal ukazoval nazvy, ktere uz nekdo do slovniku doplnil — a tak
  // pracovni seznamy umiraji. Pohled se cisti sam.
  assert.doesNotMatch(sql, /create table/i, 'migrace zaklada tabulku, ma stacit pohled');
  assert.doesNotMatch(sql, /insert into/i, 'migrace nekam zapisuje, ma jen cist');
});

test('duvod, proc ne ingredient_normalization_misses, je v migraci napsany', () => {
  // Aby to za pul roku nekdo "dodelal" tim, ze to tam zacne psat.
  assert.match(sql, /ingredient_normalization_misses/, 'rozhodnuti neni zduvodnene');
  assert.match(sql, /plan_id/, 'chybi duvod: tabulka je klicovana na plan');
});

// ------------------------------------------------------------- verdikty

test('slovnik rozlisuje tri stavy, ne dva', () => {
  // "Neni ve slovniku" a "je ve slovniku a lepek obsahuje" jsou ruzne veci.
  // Doplnit jde jen to prvni; druhe je spravny vysledek, ne mezera.
  for (const verdikt of ['ok', 'konflikt', 'neznama']) {
    assert.match(sql, new RegExp(`'${verdikt}'`), `chybi verdikt ${verdikt}`);
  }
});

test('normalizace nazvu ma prave jednu kopii', () => {
  // Rozpad nazvu, alias a shoda proti spizi zily v `recipe_diet_conflicts`.
  // Druha kopie by se s ni tise rozesla.
  const aliasy = [...sql.matchAll(/a\.alias_normalized = /g)];
  assert.equal(aliasy.length, 1, `hledani aliasu ma byt na jednom miste, nalezeno ${aliasy.length}x`);

  assert.match(
    sql,
    /from public\.recipe_posouzeni_surovin\(p_ingredients, p_tag\) p/,
    'recipe_diet_conflicts nestoji nad recipe_posouzeni_surovin',
  );
});

test('brana dostava porad tyz vysledek — konflikt i neznama dohromady', () => {
  // Brane staci vedet "tag nevznikne". Kdyby se filtr zmenil na
  // `verdikt = 'konflikt'`, neznama surovina by tag prestala shazovat
  // a "nevime" by se zmenilo na "bez lepku".
  assert.match(
    sql,
    /filter \(where p\.verdikt <> 'ok'\)/,
    'recipe_diet_conflicts musi vracet konflikt i neznamou',
  );
});

// -------------------------------------------------------- pracovni seznam

test('seznam vynechava recepty, kterym slovnik stejne nepomuze', () => {
  // Recept, ktery ma vedle nezname suroviny i skutecny zdroj lepku, se
  // doplnenim slovniku nevrati. Na pracovnim seznamu by byl sum.
  assert.match(sql, /count\(\*\) filter \(where verdikt = 'neznama'\) > 0/);
  assert.match(sql, /count\(\*\) filter \(where verdikt = 'konflikt'\) = 0/);
});

test('zrno je (tag, surovina, recept), aby sel spocitat pocet obojiho', () => {
  // Kolik receptu shodila jedna surovina I kolik receptu je celkem
  // postizenych. Recept se dvema neznamymi surovinami je porad jeden recept.
  assert.match(sql, /select p\.tag, p\.surovina, p\.recipe_id, p\.meal_type/);
  assert.match(
    sql,
    /count\(distinct recipe_id\)/,
    'pocet receptu se scita pres suroviny — recept by se pocital dvakrat',
  );
});

// ------------------------------------------------------------ watchdog

test('vetev hlasi seznam i pocet postizenych receptu', () => {
  assert.match(sql, /'surovina_blokuje_dietni_tag'::text as kod/);
  assert.match(sql, /'info'::text as severity/, 'neni to vypadek nabidky, je to dluh ve slovniku');
});

test('utnuty seznam se nezamlci', () => {
  // Strop je kvuli e-mailu, ale "a dalsich X" musi byt videt — jinak seznam
  // vypada uplne, i kdyz neni.
  assert.match(sql, /p\.poradi <= 15/, 'chybi strop na delku detailu');
  assert.match(sql, /dalsich/, 'utnute nazvy se nikde nepriznavaji');
});

// ------------------------------------------------------------- prava

test('kazdy novy pohled ma security_invoker', () => {
  // Bez nej se view pta pravy vlastnika a obejde RLS na recipes_catalog.
  const pohledy = [...sql.matchAll(/create or replace view public\.([a-z0-9_]+) as/gi)].map((m) => m[1]);
  assert.ok(pohledy.length >= 2, `ocekavaji se aspon dva pohledy, nalezeno ${pohledy.length}`);

  for (const pohled of pohledy) {
    assert.ok(
      sql.includes(`alter view public.${pohled} set (security_invoker = true)`),
      `pohled ${pohled} nema security_invoker — obchazel by RLS`,
    );
  }
});
