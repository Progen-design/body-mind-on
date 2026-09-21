// PROMPT_UX_DOLADENI.md bod A (21. 9. 2026) — na 390 px byl název jídla
// useknutý na ~90 px („Ovesná kaš…") a jediné klikací místo bylo malé
// tlačítko „Recept" vpravo. Celý řádek teď otevírá recept, tlačítko je
// pod `sm` schované a název se zalamuje na dva řádky místo `truncate`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const KARTA = cti('src/components/CasovaOsaDne.tsx');
const GRID = cti('src/components/RadekJidlaGrid.tsx');
const PAYWALL = cti('src/components/TrialPaywallCard.tsx');

test('řádek jídla v Dnešku je celý klikací a otevírá recept', () => {
  assert.match(KARTA, /role="button"/, 'řádek jídla nemá role="button"');
  assert.match(KARTA, /tabIndex=\{0\}/, 'řádek jídla není v tab pořadí');
  assert.match(
    KARTA,
    /onClick=\{\(\) => otevri\(p\)\}/,
    'řádek osy neotevírá recept kliknutím'
  );
  assert.match(KARTA, /if \(meal\) onSelectRecipe\(meal\)/, 'otevri() u jídla nevolá onSelectRecipe');
  assert.match(
    KARTA,
    /onKeyDown=\{\(e\) => \{\s*if \(e\.key === 'Enter' \|\| e\.key === ' '\)/,
    'řádek jídla nereaguje na Enter/mezerník z klávesnice'
  );
});

test('zaškrtávátko jídla nesmí otevřít recept — stopPropagation, žádný vnořený <button> v <button>', () => {
  // Řádek je `div role="button"`, ne `<button>` — vnořené skutečné tlačítko
  // (zaškrtávátko) by v `<button>` bylo nevalidní HTML.
  assert.ok(!/<button[^>]*role="button"/.test(KARTA), 'řádek jídla je <button>, ne div role="button"');
  const idxToggle = KARTA.indexOf('onToggleMeal(p.jidloId)');
  assert.ok(idxToggle > -1, 'zaškrtávátko nevolá onToggleMeal');
  const okoliToggle = KARTA.slice(Math.max(0, idxToggle - 200), idxToggle);
  assert.match(okoliToggle, /e\.stopPropagation\(\)/, 'zaškrtávátko nevolá stopPropagation před onToggleMeal');
});

test('řádek osy má popisný aria-label, i když už nemá zvláštní tlačítko „Recept"', () => {
  // Timeline (21. 9. 2026) nemá desktopové tlačítko „Recept" — celý řádek je
  // klikací a čtečka ho přečte jako „Otevřít recept: název".
  assert.match(KARTA, /Otevřít recept/, 'řádek osy nemá aria-label s akcí');
});

test('název jídla se na mobilu zalamuje na dva řádky, ne useknutý na jednom', () => {
  assert.match(GRID, /line-clamp-2/, 'chybí line-clamp-2 pro mobilní zalomení názvu');
  assert.ok(
    !/text-sm font-bold truncate /.test(GRID),
    'název je pořád jen jednořádkový truncate bez mobilní varianty'
  );
});

test('„Tvůj další týden" — klik na jídlo otevírá náhled zamčeného receptu', () => {
  assert.match(
    PAYWALL,
    /onClick=\{\(\) => onSelectRecipe\(jidlo\)\}/,
    'řádek jídla v TrialPaywallCard neotevírá recept'
  );
});
