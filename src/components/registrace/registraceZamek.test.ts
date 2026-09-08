// Během generování plánu nesmí jít sáhnout na nic. Text pod tlačítkem prosí
// „Nezavírej prosím stránku." — prosba sama o sobě odchod nezastaví, a
// překliknuté návyky by se do už odeslaného požadavku nedostaly, takže by
// uživatel viděl jiný výběr, než jaký se uložil.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ZDROJ = fs.readFileSync(
  path.join(import.meta.dirname, '..', '..', '..', 'src', 'components', 'registrace', 'StartRegistrace.tsx'),
  'utf8'
);

test('obsah kroku je během odesílání zablokovaný fieldsetem, ne jen tlačítka', () => {
  assert.match(ZDROJ, /<fieldset disabled=\{odesilam\}/);
  const zacatek = ZDROJ.indexOf('<fieldset disabled={odesilam}');
  const konec = ZDROJ.indexOf('</fieldset>', zacatek);
  assert.ok(konec > zacatek, 'fieldset se nezavírá');
  assert.match(ZDROJ.slice(zacatek, konec), /\{obsah\}/, 'fieldset musí obalovat obsah kroku');
});

test('odkaz pryč ze stránky se během odesílání vypíná — fieldset odkazy neblokuje', () => {
  assert.match(ZDROJ, /aria-disabled=\{odesilam \|\| undefined\}/);
  assert.match(ZDROJ, /if \(odesilam\) e\.preventDefault\(\)/);
  assert.match(ZDROJ, /pointer-events-none/);
});

test('zavření karty během generování vyvolá potvrzení prohlížeče', () => {
  assert.match(ZDROJ, /addEventListener\('beforeunload'/);
  assert.match(ZDROJ, /removeEventListener\('beforeunload'/, 'posluchač se musí odebrat');
});

test('obě tlačítka zůstávají disabled po dobu odesílání', () => {
  assert.match(ZDROJ, /disabled=\{odesilam\}/);
  assert.match(ZDROJ, /disabled=\{odesilam \|\| overuji\}/);
});

test('karta hlásí aria-busy, aby odečítač věděl, že se pracuje', () => {
  assert.match(ZDROJ, /aria-busy=\{odesilam\}/);
});
