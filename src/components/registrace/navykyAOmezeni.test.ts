// Krok 5 registrace: návyky a zlozvyky jsou dvě oddělené skupiny.
// Do 8. 9. 2026 stály v jednom seznamu — „Kvalitní spánek" vedle
// „Nedostatek spánku", „Zdravá strava" vedle „Junk food".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..', '..');
const ZDROJ = fs.readFileSync(path.join(KOREN, 'src', 'components', 'registrace', 'StartRegistrace.tsx'), 'utf8');
const REGISTRACE = fs.readFileSync(path.join(KOREN, 'lib', 'registration', 'bodyMetricsRegistration.js'), 'utf8');

test('návyky a zlozvyky se nabízejí ve dvou skupinách', () => {
  assert.match(ZDROJ, /popisek="Návyky, které chceš budovat"/);
  assert.match(ZDROJ, /popisek="Zlozvyky, které chceš omezit"/);
  assert.ok(!ZDROJ.includes('vsechnyNavyky'), 'sloučený seznam se už nepoužívá');
});

test('obě skupiny plní jedno pole navyky a nepřepisují se navzájem', () => {
  assert.match(ZDROJ, /const navykyKBudovani = useMemo/);
  assert.match(ZDROJ, /const zlozvykyKOmezeni = useMemo/);
  // Každý handler musí dopsat zpět hodnoty té druhé skupiny.
  assert.match(ZDROJ, /const zDruhe = navyky\.filter/);
  assert.match(ZDROJ, /const zPrvni = navyky\.filter/);
});

test('zdravotní omezení se do poznámky nezapisuje jako "Co nejí"', () => {
  assert.match(REGISTRACE, /'Zdravotní omezení: ' \+ dietaryRestrictions/);
  assert.match(REGISTRACE, /'Co nejí: ' \+ foodsToAvoid/);
});
