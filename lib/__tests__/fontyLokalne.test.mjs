/**
 * Písmo z vlastní domény — žádný request na fonts.googleapis.com / gstatic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');
const cti = (p) => readFileSync(join(KOREN, p), 'utf8');

test('index.html ani CSS appky nevolají Google Fonts', () => {
  // Komentáře pryč — vysvětlení „proč ne fonts.googleapis.com" smí zůstat.
  const bezKomentaru = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const soubor of ['index.html', 'src/index.css']) {
    assert.doesNotMatch(bezKomentaru(cti(soubor)), /fonts\.(googleapis|gstatic)\.com/, soubor);
  }
});

test('@font-face míří na soubory v public/fonts, které existují (latin + latin-ext)', () => {
  const css = cti('src/index.css');
  const cesty = [...css.matchAll(/url\('(\/fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1]);
  assert.deepEqual(cesty.sort(), ['/fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2', '/fonts/plus-jakarta-sans-latin-wght-normal.woff2']);
  for (const c of cesty) {
    const soubor = join(KOREN, 'public', c);
    assert.ok(existsSync(soubor), c);
    assert.ok(statSync(soubor).size > 10_000, `${c} je podezřele malý`);
  }
  assert.match(css, /font-family: 'Plus Jakarta Sans';/);
  assert.ok(existsSync(join(KOREN, 'public', 'fonts', 'OFL-plus-jakarta-sans.txt')), 'licence OFL');
});

test('index.html přednačítá latinku z vlastní domény', () => {
  assert.match(cti('index.html'), /<link rel="preload" href="\/fonts\/plus-jakarta-sans-latin-wght-normal\.woff2" as="font" type="font\/woff2" crossorigin>/);
});
