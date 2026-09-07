/**
 * docs/DALSI_KROK.md 9.5 — SPOONACULAR: ROZŠÍŘIT DOTAZY, AŤ JE Z ČEHO BRÁT.
 *
 * Rozhodnutí Honzy 7. 9. 2026: „není důležitý čas, ale jednoduchost."
 * Čas se uvolňuje (obed/vecere 35, snidane 25, svacina 20) a strop kroků
 * zvedá — ale POJISTKY JEDNODUCHOSTI (maxMainIngredients, COMPLEX_PREP_REGEX)
 * se nemění. Právě tudy by se dovnitř dostala složitost, proto je tenhle
 * test hlídá napevno.
 *
 * Čísla jsou na DVOU místech: tabulka pravidel platí pro lokální filtr po
 * stažení, API dotaz bere maxReadyTime z params řádku v
 * spoonacular_import_queries — a ten tabulku PŘEBÍJÍ. Druhou polovinu změny
 * dělá migrace 20260907150000 (testovaná tvarově níž).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MEAL_SIMPLICITY_RULES,
  buildImportFiltersForMealType,
  DEFAULT_CATALOG_IMPORT_FILTERS,
} from '../spoonacular/catalogImportGate.js';
import { COMPLEX_PREP_REGEX } from '../spoonacular/catalogSimplicity.js';

const KOREN = join(import.meta.dirname, '..', '..');

test('tabulka pravidel má hodnoty z 7. 9. 2026 a svacina.maxSteps zůstalo 99', () => {
  assert.equal(MEAL_SIMPLICITY_RULES.snidane.maxReadyTime, 25);
  assert.equal(MEAL_SIMPLICITY_RULES.snidane.maxSteps, 14);
  assert.equal(MEAL_SIMPLICITY_RULES.svacina.maxReadyTime, 20);
  assert.equal(MEAL_SIMPLICITY_RULES.svacina.maxSteps, 99, 'kroky svačin se neměnily');
  assert.equal(MEAL_SIMPLICITY_RULES.obed.maxReadyTime, 35);
  assert.equal(MEAL_SIMPLICITY_RULES.obed.maxSteps, 12);
  assert.equal(MEAL_SIMPLICITY_RULES.vecere.maxReadyTime, 35);
  assert.equal(MEAL_SIMPLICITY_RULES.vecere.maxSteps, 12);
});

test('explicitní filtr pořád vyhrává nad pravidlem — chování se nemění, jen čísla', () => {
  // Řádek dotazu s vlastním maxReadyTime přebíjí tabulku…
  const explicitni = buildImportFiltersForMealType('obed', { maxReadyTime: 20 });
  assert.equal(explicitni.maxReadyTime, 20, 'explicitní hodnota z params musí vyhrát');

  // …a pravidlo se dosazuje jen tam, kde filtr chybí.
  const doplnene = buildImportFiltersForMealType('obed', {});
  assert.equal(doplnene.maxReadyTime, 35, 'chybějící filtr dostane hodnotu z tabulky pravidel');
  const snidane = buildImportFiltersForMealType('snidane', undefined);
  assert.equal(snidane.maxReadyTime, 25);
});

test('pojistky jednoduchosti se nemění: maxMainIngredients 10 a COMPLEX_PREP_REGEX', () => {
  for (const [slot, rules] of Object.entries(MEAL_SIMPLICITY_RULES)) {
    assert.equal(rules.maxMainIngredients, 10, `${slot}: maxMainIngredients je skutečná pojistka, ne kroky`);
  }

  // 9 vzorů z 31. 7. 2026 — kdyby někdo „uvolnil čas" i tady, testu to neujde.
  assert.equal(COMPLEX_PREP_REGEX.length, 9);
  const zdroje = COMPLEX_PREP_REGEX.map((re) => re.source);
  for (const vzor of ['marinate overnight', 'pressure cooker', 'candy thermometer', 'double boiler']) {
    assert.ok(zdroje.some((s) => s.includes(vzor)), `chybí vzor „${vzor}"`);
  }
});

test('minProtein a maxSugar zůstávají — zamítly 4 recepty ze 70, nejsou úzké hrdlo', () => {
  assert.equal(DEFAULT_CATALOG_IMPORT_FILTERS.minProtein, 5);
  assert.equal(DEFAULT_CATALOG_IMPORT_FILTERS.maxSugar, 30);
});

test('migrace: rt= v podpisu se přepisuje spolu s params a offsety se nulují', () => {
  const migrace = readdirSync(join(KOREN, 'supabase', 'migrations'))
    .filter((f) => f.includes('spoonacular_dotazy_sirsi_cas'));
  assert.equal(migrace.length, 1, 'čekána právě jedna migrace k 9.5');

  const sql = readFileSync(join(KOREN, 'supabase', 'migrations', migrace[0]), 'utf8');

  // Obě poloviny téže hodnoty: params i podpis.
  assert.match(sql, /jsonb_set\(params, '\{maxReadyTime\}', to_jsonb\(cilovy\)\)/);
  assert.match(sql, /regexp_replace\(r\.query_signature, 'rt=\[0-9\]\+', 'rt=' \|\| cilovy::text\)/);
  assert.match(sql, /query_signature = novy_podpis/);

  // Reset je povinný a úplný — širší dotaz je nový dotaz, staré stránkování
  // ukazuje doprostřed něčeho, co už neexistuje.
  assert.match(sql, /next_offset\s*=\s*0/);
  assert.match(sql, /exhausted_at\s*=\s*NULL/);
  assert.match(sql, /retired_reason\s*=\s*NULL/);
  assert.match(sql, /empty_streak\s*=\s*0/);
  assert.match(sql, /ZAPLACENÁ CENA/, 'důvod resetu musí být v komentáři, ať ho za měsíc nikdo „neopraví"');

  // Idempotence: druhé spuštění nesmí znovu nulovat offsety rozběhnutého
  // stránkování.
  assert.match(sql, /IS DISTINCT FROM cilovy/);

  // Kontrola po sobě: podpis a params musí souhlasit u všech řádků.
  assert.match(sql, /rt=' \|\| \(q\.params ->> 'maxReadyTime'\)/, 'post-check porovnává rt= v podpisu s params');
  assert.match(sql, /RAISE EXCEPTION '% radku ma rt= v podpisu v nesouladu/);

  // Cílové hodnoty podle slotu — dvakrát (update i post-check).
  for (const dvojice of ["WHEN 'snidane' THEN 25", "WHEN 'svacina' THEN 20", "WHEN 'obed'    THEN 35", "WHEN 'vecere'  THEN 35"]) {
    const vyskytu = sql.split(dvojice).length - 1;
    assert.equal(vyskytu, 2, `„${dvojice}" má být v update i v kontrole`);
  }

  // Řádky bez maxReadyTime se nechávají být — přidat jim limit by je zúžilo.
  assert.match(sql, /WHERE params \? 'maxReadyTime'/);

  // A ze stejného důvodu se čas JEN ZVYŠUJE. Na produkci je řádek id=2745
  // (`main course|carb=40|...|rt=40|slot=obed`) širší než cíl 35 — dosadit
  // mu cíl by dotaz zúžilo a shodilo jeho next_offset (36) na nulu.
  assert.match(sql, /GREATEST\(cilovy, \(r\.params ->> 'maxReadyTime'\)::integer\)/,
    'migrace nesmí snížit už existující maxReadyTime');
  assert.match(sql, /\(q\.params ->> 'maxReadyTime'\)::integer <\s*$/m,
    'post-check porovnává „aspoň cíl", ne rovnost — širší řádek smí zůstat širší');

  // query_signature má UNIQUE index a rt= je jeho součástí, takže dva dotazy
  // lišící se jen časem po rozšíření splynou. Na produkci nastává jednou
  // (2732 vs 2754). Migrace to nesmí přejmenovat ani na tom spadnout.
  assert.match(sql, /x\.query_signature = novy_podpis AND x\.id <> r\.id/,
    'migrace musí kolizi podpisů detekovat, ne spadnout na UNIQUE');
  assert.match(sql, /retired_reason = 'merged_after_widening'/,
    'sloučený dotaz odchází trvale, ne dočasně');
  // Ten důvod NESMÍ být v seznamu automatických — jinak by ho třicetidenní
  // znovuotevření vzkřísilo a UNIQUE by spadl při dalším běhu migrace.
  const rotace = readFileSync(join(KOREN, 'lib', 'spoonacular', 'importQueryRotation.js'), 'utf8');
  const docasne = /DOCASNE_DUVODY_VYRAZENI\s*=\s*\[([^\]]*)\]/.exec(rotace)?.[1] ?? '';
  assert.equal(docasne.includes('merged_after_widening'), false,
    'merged_after_widening musí zůstat mimo automatické důvody, jinak ho reopen vzkřísí');

  // …a DB ho musí vůbec připustit. CHECK na retired_reason dovoloval jen
  // pool_exhausted/pool_empty, tedy přesně automatické důvody — slib o
  // „trvalém ručním vyřazení" v importQueryRotation.js tím byl nesplnitelný
  // a po 30 dnech se do rotace vracelo úplně všechno.
  assert.match(sql, /spoonacular_import_queries_retired_reason_chk/,
    'migrace musí rozšířit CHECK, jinak trvalý důvod nejde uložit');
  assert.match(sql, /'pool_exhausted', 'pool_empty', 'merged_after_widening'/,
    'nový CHECK drží oba automatické důvody i ten trvalý');
});
