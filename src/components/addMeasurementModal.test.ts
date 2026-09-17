// Zapsat váhu — pole bylo prázdné a poslední váha sloužila jen jako
// placeholder, ne jako předvyplněná hodnota. Uživatel tak musel váhu psát
// od nuly, i když se od minula skoro nezměnila.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const MODAL = fs.readFileSync(path.join(KOREN, 'src', 'components', 'AddMeasurementModal.tsx'), 'utf8');

test('pole se předvyplní poslední váhou při každém otevření, ne jen napoprvé', () => {
  // Komponenta se při zavření nerozmontuje (`if (!isOpen) return null` je AŽ
  // za hooky), takže obyčejný useState('') by prefill nastavil jen jednou.
  assert.match(MODAL, /useEffect\(\(\) => \{[\s\S]*?if \(!isOpen\) return;[\s\S]*?\}, \[isOpen, latestWeight\]\)/, 'prefill neběží na každé otevření (chybí efekt na isOpen)');
  assert.match(MODAL, /setWeight\(latestWeight != null \? formatVahu\(latestWeight\) : ''\)/, 'hodnota se nepředvyplňuje z latestWeight');
  assert.match(MODAL, /formatVahu\(kg: number\)[\s\S]*?replace\('\.', ','\)/, 'formát musí použít desetinnou čárku, ne tečku');
});

test('text v poli se dá při otevření rovnou přepsat (označený)', () => {
  assert.match(MODAL, /onFocus=\{\(e\) => e\.target\.select\(\)\}/, 'pole se při fokusu neoznačí celé — přepis by musel jít znak po znaku');
});

test('input má min/max z MIN_VAHA_KG/MAX_VAHA_KG, ne natvrdo', () => {
  assert.match(MODAL, /import \{ CHYBA_VAHY, MAX_VAHA_KG, MIN_VAHA_KG, overVahu \} from '\.\.\/\.\.\/lib\/vahaMeze\.js'/);
  assert.match(MODAL, /min=\{MIN_VAHA_KG\}/);
  assert.match(MODAL, /max=\{MAX_VAHA_KG\}/);
});

test('rozsah vah je trvalá nápověda pod polem, ne až chyba po odeslání', () => {
  // Nápověda musí být v DOM nezávisle na chybovém stavu (přítomná, i když
  // `chyba` je null) — proto se hledá v `else` větvi vedle chybové hlášky,
  // ne jen jako text schovaný za `{chyba && ...}`.
  assert.match(
    MODAL,
    /\{chyba \? \([\s\S]*?<p className="text-\[11px\] text-red-400 mt-1\.5">\{chyba\}<\/p>[\s\S]*?\) : \([\s\S]*?Zadej váhu mezi \{MIN_VAHA_KG\} a \{MAX_VAHA_KG\} kg\.[\s\S]*?\)\}/,
    'trvalá nápověda o rozsahu chybí nebo se ukáže jen jako chyba'
  );
});

test('hlavičkový komentář už netvrdí, že se pole nepředvyplňuje', () => {
  assert.ok(!/nepředvyplňuje se/.test(MODAL), 'komentář lže — pole se teď předvyplňuje');
});
