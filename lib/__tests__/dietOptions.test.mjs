/**
 * Brána na `diet_type` + kontrola, že se UI a server nerozejdou.
 *
 * Kontext: vegan byl `disabled` jen ve třech z pěti JSX souborů, takže přes
 * zbylé dvě stránky si ho šlo vybrat. A paleo bylo nabízené všude, přestože
 * se nikdy nefiltrovalo — dietTagsFromProfile() ho nezná a vylučovací logika
 * pro něj neexistuje, takže uživatel dostával nefiltrovaný jídelníček.
 *
 * Druhý test níž porovnává JSX proti lib/dietOptions.js, aby se ta pětice
 * souborů nemohla rozejít znovu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIET_OPTIONS, isDietTypeSupported, dietTypeRejectionReason } from '../dietOptions.js';

const KOREN = join(import.meta.dirname, '..', '..');

test('prazdna hodnota znamena zadna preference a projde', () => {
  for (const prazdno of [undefined, null, '', '   ']) {
    assert.equal(isDietTypeSupported(prazdno), true);
    assert.equal(dietTypeRejectionReason(prazdno), null);
  }
});

test('povolene diety projdou', () => {
  for (const v of ['vegetarian', 'gluten_free', 'lactose_free', 'low_carb', 'other']) {
    assert.equal(isDietTypeSupported(v), true, `${v} ma projit`);
    assert.equal(dietTypeRejectionReason(v), null, `${v} nema mit duvod k odmitnuti`);
  }
});

test('vypnute diety se odmitnou s vysvetlenim', () => {
  for (const v of ['vegan', 'paleo']) {
    assert.equal(isDietTypeSupported(v), false, `${v} ma byt odmitnuta`);
    const duvod = dietTypeRejectionReason(v);
    assert.ok(duvod && duvod.length > 10, `${v} ma mit srozumitelny duvod, ne prazdny retezec`);
  }
});

test('neznama hodnota se odmitne, ne prepise na zadnou preferenci', () => {
  // Tiché přepsání na null by znamenalo poslat člověku jídelníček,
  // o který nežádal.
  assert.equal(isDietTypeSupported('keto'), false);
  assert.equal(isDietTypeSupported('vegan; DROP TABLE'), false);
  assert.ok(dietTypeRejectionReason('keto'));
});

test('matice smoke testu posila jen diety, ktere server prijme', () => {
  // Třetí místo, kde se nabídka diet dá rozejít: seznam profilů ve smoke testu.
  // Kdyby se do něj dostal vegan nebo paleo, produkce vrátí 400 a test by
  // hlásil chybu tam, kde se aplikace chová správně. A obráceně: nová povolená
  // dieta, která v matici chybí, se nikdy neproklikne.
  const zdroj = readFileSync(join(KOREN, 'scripts', 'smoke-test-critical-path.mjs'), 'utf8');

  const blok = zdroj.match(/const PROFILY = \[[\s\S]*?\n\];/);
  assert.ok(blok, 'PROFILY se ve smoke testu nenašly');

  const vMatici = new Set(
    [...blok[0].matchAll(/dietType:\s*'([a-z_]+)'/g)].map((m) => m[1])
  );
  assert.ok(vMatici.size > 0, 'matice nemá ani jednu dietu');

  for (const v of vMatici) {
    assert.equal(
      isDietTypeSupported(v),
      true,
      `matice posílá '${v}', ale server ji odmítne: ${dietTypeRejectionReason(v)}`
    );
  }

  // `other` je povolené, ale je to „žádná konkrétní dieta“ — nefiltruje se
  // podle něj nic, takže do matice nepatří a nechybí tam.
  const maBytVMatici = DIET_OPTIONS
    .filter((o) => o.enabled && o.value !== 'other')
    .map((o) => o.value);
  const chybi = maBytVMatici.filter((v) => !vMatici.has(v));
  assert.deepEqual(chybi, [], `povolené diety, které smoke matice netestuje: ${chybi.join(', ')}`);
});

// PROMPT_UKLID.md (2026-09-17) — přepsáno z pěti `_legacy-next` JSX souborů
// (mrtvá Next.js registrace/checkout) na živou SPA v `src/`. Živý ekvivalent
// je SILNĚJŠÍ, ne stejný: `src/components/registrace/volby.ts`'s `DIETA` se
// neopisuje ručně a nepoužívá `<option disabled>` — je to přímo
// `DIET_OPTIONS.filter(o => o.enabled)`, takže vypnutá dieta (vegan, paleo)
// se do nabídky vůbec nedostane, ne že by tam byla a jen zašedlá. Ověřeno
// greppem, že oba živá místa výběru diety (`StartRegistrace.tsx` — registrace,
// `PreferencesModal.tsx` — editace preferencí) jedou přes `DIETA`, žádné jiné
// natvrdo psané seznamy v src/ neexistují.
test('src/ nabídka diet je odvozená z DIET_OPTIONS.filter(enabled), ne opsaná ručně', () => {
  const volby = readFileSync(join(KOREN, 'src', 'components', 'registrace', 'volby.ts'), 'utf8');
  assert.match(
    volby,
    /DIET_OPTIONS\.filter\(\(o\)\s*=>\s*o\.enabled\)/,
    'DIETA musí být odvozená filtrem nad DIET_OPTIONS, ne vlastní pole hodnot'
  );
  assert.match(
    volby,
    /from ['"]\.\.\/\.\.\/\.\.\/lib\/dietOptions\.js['"]/,
    'volby.ts musí importovat DIET_OPTIONS z lib/dietOptions.js, ne mít vlastní kopii'
  );

  const mistaVyberu = [
    join(KOREN, 'src', 'components', 'registrace', 'StartRegistrace.tsx'),
    join(KOREN, 'src', 'components', 'PreferencesModal.tsx'),
  ];
  for (const cesta of mistaVyberu) {
    const zdroj = readFileSync(cesta, 'utf8');
    assert.match(
      zdroj,
      /volby=\{DIETA\}/,
      `${cesta}: výběr diety musí jít přes sdílenou DIETA, ne přes vlastní seznam`
    );
  }
});

/**
 * VEGAN SE NESMÍ ZAPNOUT PODLE SOUČTŮ ZA SLOT.
 *
 * 22. 9. 2026 vypadal `enabled: false` u veganu jako zapomenutý: aktivních
 * veganských receptů bylo snídaně 14, oběd 12, svačina 10, večeře 12 — všechno
 * nad `MIN_RECEPTU_NA_SLOT` a watchdog `dieta_pod_kritickym_poctem` mlčel.
 *
 * Jenže watchdog počítá celý slot, kdežto jídelníček se skládá z kanonického
 * kalorického pásma chodu. V pásmu byl oběd na 6 (práh 7) a svačina přesně na
 * 7 bez rezervy. Tenhle test drží obojí pohromadě: dokud v `dietOptions.js`
 * stojí naměřený rozpad po pásmech, nesmí se dieta zapnout jen proto, že
 * součty vyšly.
 */
test('vegan zůstává vypnutý a důvod odkazuje na naměřený rozpad po pásmech', () => {
  const vegan = DIET_OPTIONS.find((o) => o.value === 'vegan');

  assert.equal(vegan.enabled, false, 'vegan se zapnul — sedí oběd v pásmu 450–680 na 7+?');
  assert.equal(typeof vegan.reason, 'string');
  assert.ok(vegan.reason.length > 0, 'vypnutá dieta musí říct proč');

  const zdroj = readFileSync(join(KOREN, 'lib', 'dietOptions.js'), 'utf8');
  assert.match(
    zdroj,
    /KANONICKA_PASMA/,
    'důvod vypnutí se musí opírat o kalorická pásma, ne o součty za slot',
  );
  assert.match(zdroj, /oběd\s+450–680/, 'naměřený rozpad po pásmech ze zdroje zmizel');
});

test('kanonická pásma, ve kterých se vegan měřil, se nerozešla s měřením', () => {
  // Kdyby se hranice posunuly, čísla v komentáři u veganu přestanou platit
  // a musí se přeměřit — ne tiše zestárnout.
  const pasma = readFileSync(join(KOREN, 'lib', 'recipeGenerationBands.js'), 'utf8');

  assert.match(pasma, /snidane:\s*\{\s*spodni_strop:\s*300,\s*horni_podlaha:\s*520\s*\}/);
  assert.match(pasma, /obed:\s*\{\s*spodni_strop:\s*450,\s*horni_podlaha:\s*680\s*\}/);
  assert.match(pasma, /vecere:\s*\{\s*spodni_strop:\s*300,\s*horni_podlaha:\s*650\s*\}/);
  assert.match(pasma, /svacina:\s*\{\s*spodni_strop:\s*170,\s*horni_podlaha:\s*350\s*\}/);
});
