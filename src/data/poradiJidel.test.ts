// Pořadí jídel během dne se nesmí odvozovat z textu času.
//
// 9. 9. 2026 se do `mealyDne()` dostalo řazení `a.time.localeCompare(b.time)`.
// Časy jsou psané bez nuly na začátku, takže `'7:30' > '10:00'` a snídaně
// se zobrazovala až za večeří. Test hlídá, že se řadí podle vlastního
// seznamu pořadí, ne podle řetězce.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { naJidla } from './adaptery.ts';

const ZDROJ = fs.readFileSync(
  path.join(import.meta.dirname, 'adaptery.ts'),
  'utf8'
);

test('řazení jídel nevychází z porovnání času jako textu', () => {
  assert.ok(
    !/\.time\.localeCompare\(/.test(ZDROJ),
    'jídla se zase řadí porovnáním času jako řetězce'
  );
  assert.match(ZDROJ, /PORADI_JIDLA/, 'chybí seznam pořadí jídel');
});

test('jednociferná hodina se neseřadí za dvouciferné', () => {
  // Přesně ten případ, který chybu způsobil.
  assert.ok('7:30'.localeCompare('10:00') > 0, 'předpoklad testu neplatí');
});

test('den jde do jídel ve správném pořadí bez ohledu na pořadí v plánu', () => {
  const plan = {
    structured_plan_json: {
      days: [
        {
          date: '2026-09-09',
          meals: [
            { type: 'dinner', display_name_cs: 'Večeře' },
            { type: 'breakfast', display_name_cs: 'Snídaně' },
            { type: 'lunch', display_name_cs: 'Oběd' },
          ],
        },
      ],
    },
  };

  const jidla = naJidla(plan as never);
  assert.deepEqual(
    jidla.map((j) => j.type),
    ['Snídaně', 'Oběd', 'Večeře']
  );
});
