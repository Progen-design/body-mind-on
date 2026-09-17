// Withings je volitelný modul, defaultně skrytý — kdo o něj neprojevil
// zájem (registrace, preference, nebo existující připojení), nemá dlaždici
// ani tlačítko vidět. `api/profile.js` tohle počítal od začátku přes
// `shouldShowWithingsSection()` (lib/withingsProfileVisibility.js) a posílal
// jako `show_withings_section` — `src/` to ale nikdy nečetlo, takže se
// dlaždice a tlačítko ukazovaly úplně všem. PROMPT_UKLID.md (2026-09-17)
// Blok 4 fix #2.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const APP = cti('src/App.tsx');
const ZARIZENI = cti('src/components/PropojenaZarizeniSection.tsx');
const PROFIL_API = cti('api/profile.js');

test('/api/profile pořád počítá show_withings_section přes shouldShowWithingsSection', () => {
  assert.match(PROFIL_API, /import \{ shouldShowWithingsSection \} from '\.\.\/lib\/withingsProfileVisibility\.js'/);
  assert.match(PROFIL_API, /show_withings_section:\s*shouldShowWithingsSection\(/);
});

test('App.tsx čte show_withings_section a posílá ho do PropojenaZarizeniSection', () => {
  assert.match(APP, /zobrazitWithings=\{profilData\?\.show_withings_section === true\}/);
});

test('tlačítko „Připojit Withings" na záložce Regenerace je za gatem', () => {
  assert.match(APP, /show_withings_section === true &&[\s\S]{0,450}Připojit Withings/);
});

test('PropojenaZarizeniSection kreslí Withings dlaždici jen když je zobrazitWithings true', () => {
  assert.match(ZARIZENI, /zobrazitWithings: boolean/, 'prop musí být povinný, ne volitelný s tichým výchozím true');
  assert.match(ZARIZENI, /\{zobrazitWithings && \(/);
  assert.match(ZARIZENI, /Withings Body Scan/);
});

test('Apple Health dlaždice není za withings gatem — nemá vlastní opt-in kontrakt', () => {
  // Gate se musí zavřít (`)}` na vlastním řádku) dřív, než začne Apple Health
  // dlaždice — jinak by byla vnořená uvnitř `{zobrazitWithings && (...)}`.
  assert.match(ZARIZENI, /\{zobrazitWithings && \([\s\S]*?\n\s*\)\}\s*\n\s*\{\/\* APPLE HEALTH/);
});
