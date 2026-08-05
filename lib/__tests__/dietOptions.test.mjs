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

test('JSX nabidka se nerozchazi s lib/dietOptions.js', () => {
  const soubory = [
    'pages/start.js',
    'pages/chci-vip.js',
    'pages/on-club.js',
    'components/ProgramForm.js',
    'components/profile/PreferencesOverlay.jsx',
  ];

  const vypnute = new Set(DIET_OPTIONS.filter((o) => !o.enabled).map((o) => o.value));
  const nalezy = [];

  for (const rel of soubory) {
    const zdroj = readFileSync(join(KOREN, rel), 'utf8');
    // `<option value="x" ...>` — zajímá nás, jestli má `disabled`.
    for (const m of zdroj.matchAll(/<option\s+value="([a-z_]+)"([^>]*)>/g)) {
      const [, hodnota, zbytek] = m;
      if (!hodnota) continue;
      const maDisabled = /\bdisabled\b/.test(zbytek);
      if (vypnute.has(hodnota) && !maDisabled) {
        nalezy.push(`${rel}: '${hodnota}' je v dietOptions vypnutá, ale <option> nemá disabled`);
      }
    }
  }

  assert.deepEqual(nalezy, [], `UI nabízí dietu, kterou server odmítne:\n  ${nalezy.join('\n  ')}`);
});
